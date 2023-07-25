import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  VToken,
} from "../../../typechain";
import { Error } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

describe("assetListTest", () => {
  let root: SignerWithAddress;
  let customer: SignerWithAddress;
  let comptroller: MockContract<Comptroller>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let OMG: FakeContract<VToken>;
  let ZRX: FakeContract<VToken>;
  let BAT: FakeContract<VToken>;
  let SKT: FakeContract<VToken>;
  let allTokens: FakeContract<VToken>[];
  const maxLoopsLimit = 150;

  type AssetListFixture = {
    accessControl: FakeContract<AccessControlManager>;
    comptroller: MockContract<Comptroller>;
    oracle: FakeContract<PriceOracle>;
    OMG: FakeContract<VToken>;
    ZRX: FakeContract<VToken>;
    BAT: FakeContract<VToken>;
    SKT: FakeContract<VToken>;
    allTokens: FakeContract<VToken>[];
    names: string[];
  };

  async function assetListFixture(): Promise<AssetListFixture> {
    poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
    const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
    const comptroller = await upgrades.deployProxy(Comptroller, [maxLoopsLimit, accessControl.address], {
      constructorArgs: [poolRegistry.address],
      initializer: "initialize(uint256,address)",
    });
    const oracle = await smock.fake<PriceOracle>("PriceOracle");

    accessControl.isAllowedToCall.returns(true);
    await comptroller.setPriceOracle(oracle.address);
    const names = ["OMG", "ZRX", "BAT", "sketch"];
    const [OMG, ZRX, BAT, SKT] = await Promise.all(
      names.map(async name => {
        const vToken = await smock.fake<VToken>("VToken");
        vToken.isVToken.returns(true);
        if (name !== "sketch") {
          const poolRegistryBalance = await poolRegistry.provider.getBalance(poolRegistry.address);
          if (poolRegistryBalance.isZero()) {
            await setBalance(root.address, 100n ** 18n);
            await root.sendTransaction({
              to: poolRegistry.address,
              value: ethers.utils.parseEther("1"),
            });
          }
          const poolRegistrySigner = await ethers.getSigner(poolRegistry.address);
          await comptroller.connect(poolRegistrySigner).supportMarket(vToken.address);
        }
        return vToken;
      }),
    );
    const allTokens = [OMG, ZRX, BAT, SKT];
    return { accessControl, comptroller, oracle, OMG, ZRX, BAT, SKT, allTokens, names };
  }

  function configure({ accessControl, oracle, allTokens, names }: AssetListFixture) {
    accessControl.isAllowedToCall.returns(true);
    oracle.getUnderlyingPrice.returns(convertToUnit("0.5", 18));
    allTokens.map((vToken, i) => {
      vToken.isVToken.returns(true);
      vToken.symbol.returns(names[i]);
      vToken.name.returns(names[i]);
      vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
    });
  }

  beforeEach(async () => {
    [root, customer] = await ethers.getSigners();
    const contracts = await loadFixture(assetListFixture);
    configure(contracts);
    ({ comptroller, OMG, ZRX, BAT, SKT, allTokens } = contracts);
    const [addresses, caps] = allTokens.reduce(
      (acc: [string[], string[]], curr) => {
        acc[0].push(curr.address);
        acc[1].push("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        return acc;
      },
      [[], []],
    );
    await comptroller.setMarketBorrowCaps(addresses, caps);
  });

  const checkMarkets = async (expectedTokens: FakeContract<VToken>[]) => {
    for (const token of allTokens) {
      const isExpected = expectedTokens.some(e => e == token);
      expect(await comptroller.checkMembership(customer.address, token.address)).to.equal(isExpected);
    }
  };

  const enterAndCheckMarkets = async (
    enterTokens: FakeContract<VToken>[],
    expectedTokens: FakeContract<VToken>[],
    expectedErrors: Error[] | null = null,
  ) => {
    const reply = await comptroller.connect(customer).callStatic.enterMarkets(enterTokens.map(t => t.address));
    const receipt = await comptroller.connect(customer).enterMarkets(enterTokens.map(t => t.address));
    const assetsIn = await comptroller.getAssetsIn(customer.address);

    const expectedErrors_ = expectedErrors || enterTokens.map(_ => Error.NO_ERROR);

    reply.forEach((tokenReply, i) => {
      expect(tokenReply).to.equal(expectedErrors_[i]);
    });

    expect(receipt).to.emit(comptroller, "MarketEntered"); // eslint-disable-line @typescript-eslint/no-floating-promises
    expect(assetsIn).to.deep.equal(expectedTokens.map(t => t.address));

    await checkMarkets(expectedTokens);

    return receipt;
  };

  async function exitAndCheckMarkets(
    exitToken: FakeContract<VToken>,
    expectedTokens: FakeContract<VToken>[],
    expectedError: Error = Error.NO_ERROR,
  ) {
    const reply = await comptroller.connect(customer).callStatic.exitMarket(exitToken.address);
    const receipt = await comptroller.connect(customer).exitMarket(exitToken.address);
    const assetsIn = await comptroller.getAssetsIn(customer.address);
    expect(reply).to.equal(expectedError);
    expect(assetsIn).to.deep.equal(expectedTokens.map(t => t.address));
    await checkMarkets(expectedTokens);
    return receipt;
  }

  describe("enterMarkets", () => {
    it("properly emits events", async () => {
      const tx1 = await enterAndCheckMarkets([OMG], [OMG]);
      const tx2 = await enterAndCheckMarkets([OMG], [OMG]);
      expect(tx1) // eslint-disable-line @typescript-eslint/no-floating-promises
        .to.emit(comptroller, "MarketEntered")
        .withArgs(OMG.address, customer);
      expect((await tx2.wait()).events).to.be.empty;
    });

    it("adds to the asset list only once", async () => {
      await enterAndCheckMarkets([OMG], [OMG]);
      await enterAndCheckMarkets([OMG], [OMG]);
      await enterAndCheckMarkets([ZRX, BAT, OMG], [OMG, ZRX, BAT]);
      await enterAndCheckMarkets([ZRX, OMG], [OMG, ZRX, BAT]);
      await enterAndCheckMarkets([ZRX], [OMG, ZRX, BAT]);
      await enterAndCheckMarkets([OMG], [OMG, ZRX, BAT]);
      await enterAndCheckMarkets([ZRX], [OMG, ZRX, BAT]);
      await enterAndCheckMarkets([BAT], [OMG, ZRX, BAT]);
    });

    it("the market must be listed for add to succeed", async () => {
      const tx = comptroller.connect(customer).enterMarkets([SKT.address]);
      await expect(tx).to.be.revertedWithCustomError(comptroller, "MarketNotListed").withArgs(SKT.address);
      const poolRegistrySigner = await ethers.getSigner(poolRegistry.address);
      await comptroller.connect(poolRegistrySigner).supportMarket(SKT.address);
      await enterAndCheckMarkets([SKT], [SKT]);
    });

    it("returns a list of codes mapping to user's ultimate membership in given addresses", async () => {
      await enterAndCheckMarkets([OMG, ZRX, BAT], [OMG, ZRX, BAT], [Error.NO_ERROR, Error.NO_ERROR, Error.NO_ERROR]);
      const tx = comptroller.connect(customer).enterMarkets([OMG.address, SKT.address]);
      await expect(tx).to.be.revertedWithCustomError(comptroller, "MarketNotListed").withArgs(SKT.address);
    });
  });

  describe("exitMarket", () => {
    it("doesn't let you exit if you have a borrow balance", async () => {
      await enterAndCheckMarkets([OMG], [OMG]);
      OMG.getAccountSnapshot.returns([0, 1, 2, 1]);

      const tx = comptroller.connect(customer).exitMarket(OMG.address);
      await expect(tx).to.be.revertedWithCustomError(comptroller, "NonzeroBorrowBalance");
    });

    it("rejects unless redeem allowed", async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT]);
      // We need to borrow at least 2, otherwise our borrow balance in USD gets truncated
      // when multiplied by price=0.5
      BAT.getAccountSnapshot.returns([0, 0, 2, 1]);

      // BAT has a negative balance and there's no supply, thus account should be underwater
      const tx = comptroller.connect(customer).exitMarket(OMG.address);
      await expect(tx).to.be.revertedWithCustomError(comptroller, "InsufficientLiquidity");
    });

    it("accepts when you're not in the market already", async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT]);

      // Not in ZRX, should exit fine
      await exitAndCheckMarkets(ZRX, [OMG, BAT], Error.NO_ERROR);
    });

    it("properly removes when there's only one asset", async () => {
      await enterAndCheckMarkets([OMG], [OMG]);
      await exitAndCheckMarkets(OMG, [], Error.NO_ERROR);
    });

    it("properly removes when there's only two assets, removing the first", async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT]);
      await exitAndCheckMarkets(OMG, [BAT], Error.NO_ERROR);
    });

    it("properly removes when there's only two assets, removing the second", async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT]);
      await exitAndCheckMarkets(BAT, [OMG], Error.NO_ERROR);
    });

    it("properly removes when there's only three assets, removing the first", async () => {
      await enterAndCheckMarkets([OMG, BAT, ZRX], [OMG, BAT, ZRX]);
      await exitAndCheckMarkets(OMG, [ZRX, BAT], Error.NO_ERROR);
    });

    it("properly removes when there's only three assets, removing the second", async () => {
      await enterAndCheckMarkets([OMG, BAT, ZRX], [OMG, BAT, ZRX]);
      await exitAndCheckMarkets(BAT, [OMG, ZRX], Error.NO_ERROR);
    });

    it("properly removes when there's only three assets, removing the third", async () => {
      await enterAndCheckMarkets([OMG, BAT, ZRX], [OMG, BAT, ZRX]);
      await exitAndCheckMarkets(ZRX, [OMG, BAT], Error.NO_ERROR);
    });
  });

  describe("entering from preBorrowHook", () => {
    it("enters when called by a vToken", async () => {
      await setBalance(await BAT.wallet.getAddress(), 10n ** 18n);
      await comptroller.connect(BAT.wallet).preBorrowHook(BAT.address, await customer.getAddress(), 1);

      const assetsIn = await comptroller.getAssetsIn(customer.address);

      expect(assetsIn).to.deep.equal([BAT.address]);

      await checkMarkets([BAT]);
    });

    it("reverts when called by not a vToken", async () => {
      await expect(
        comptroller.connect(customer).preBorrowHook(BAT.address, await customer.getAddress(), 1),
      ).to.be.revertedWithCustomError(comptroller, "UnexpectedSender");

      const assetsIn = await comptroller.getAssetsIn(customer.address);

      expect(assetsIn).to.deep.equal([]);

      await checkMarkets([]);
    });

    it("adds to the asset list only once", async () => {
      await setBalance(await BAT.wallet.getAddress(), 10n ** 18n);
      await comptroller.connect(BAT.wallet).preBorrowHook(BAT.address, await customer.getAddress(), 1);

      await enterAndCheckMarkets([BAT], [BAT]);

      await comptroller.connect(BAT.wallet).preBorrowHook(BAT.address, await customer.getAddress(), 1);
      const assetsIn = await comptroller.getAssetsIn(await customer.getAddress());
      expect(assetsIn).to.deep.equal([BAT.address]);
    });
  });
});

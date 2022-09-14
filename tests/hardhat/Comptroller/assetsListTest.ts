import { Signer } from "ethers";
import { ethers } from "hardhat";
import { setBalance, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, PriceOracle, Comptroller__factory, VBep20Immutable, AccessControlManager, PoolRegistry
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";


describe("assetListTest", () => {
  let root: Signer;
  let customer: Signer;
  let accounts: Signer[];
  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VBep20Immutable>;
  let ZRX: FakeContract<VBep20Immutable>;
  let BAT: FakeContract<VBep20Immutable>;
  let SKT: FakeContract<VBep20Immutable>;
  let allTokens: FakeContract<VBep20Immutable>[];

  type AssetListFixture = {
    accessControl: FakeContract<AccessControlManager>;
    comptroller: MockContract<Comptroller>,
    oracle: FakeContract<PriceOracle>,
    OMG: FakeContract<VBep20Immutable>,
    ZRX: FakeContract<VBep20Immutable>,
    BAT: FakeContract<VBep20Immutable>,
    SKT: FakeContract<VBep20Immutable>,
    allTokens: FakeContract<VBep20Immutable>[],
    names: string[]
  };

  async function assetListFixture(): Promise<AssetListFixture> {
    const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
    const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    const comptroller = await ComptrollerFactory.deploy(poolRegistry.address, accessControl.address);
    const oracle = await smock.fake<PriceOracle>("PriceOracle");

    accessControl.isAllowedToCall.returns(true);
    await comptroller._setPriceOracle(oracle.address);
    const names = ["OMG", "ZRX", "BAT", "sketch"];
    const [OMG, ZRX, BAT, SKT] = await Promise.all(
      names.map(async (name) => {
        const vToken = await smock.fake<VBep20Immutable>("VBep20Immutable");
        if (name !== "sketch") {
          await comptroller._supportMarket(vToken.address);
        }
        return vToken;
      })
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
    })
  }

  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(assetListFixture);
    configure(contracts);
    ({ comptroller, OMG, ZRX, BAT, SKT, allTokens } = contracts);
  });

  async function checkMarkets(expectedTokens: FakeContract<VBep20Immutable>[]) {
    for (let token of allTokens) {
      const isExpected = expectedTokens.some(e => e == token);
      expect(await comptroller.checkMembership(await customer.getAddress(), token.address)).to.equal(isExpected);
    }
  }

  async function enterAndCheckMarkets(
    enterTokens: FakeContract<VBep20Immutable>[],
    expectedTokens: FakeContract<VBep20Immutable>[],
    expectedErrors: Error[] | null = null
  ) {
    const reply = await comptroller.connect(customer).callStatic.enterMarkets(enterTokens.map(t => t.address));
    const receipt = await comptroller.connect(customer).enterMarkets(enterTokens.map(t => t.address));
    const assetsIn = await comptroller.getAssetsIn(await customer.getAddress());

    const expectedErrors_ = expectedErrors || enterTokens.map(_ => Error.NO_ERROR);

    reply.forEach((tokenReply, i) => {
      expect(tokenReply).to.equal(expectedErrors_[i]);
    });

    expect(receipt).to.emit(comptroller, "MarketEntered");
    expect(assetsIn).to.deep.equal(expectedTokens.map(t => t.address));

    await checkMarkets(expectedTokens);

    return receipt;
  };

  async function exitAndCheckMarkets(
    exitToken: FakeContract<VBep20Immutable>,
    expectedTokens: FakeContract<VBep20Immutable>[],
    expectedError: Error = Error.NO_ERROR
  ) {
    const reply = await comptroller.connect(customer).callStatic.exitMarket(exitToken.address);
    const receipt = await comptroller.connect(customer).exitMarket(exitToken.address);
    const assetsIn = await comptroller.getAssetsIn(await customer.getAddress());
    expect(reply).to.equal(expectedError);
    expect(assetsIn).to.deep.equal(expectedTokens.map(t => t.address));
    await checkMarkets(expectedTokens);
    return receipt;
  };

  describe("enterMarkets", () => {
    it("properly emits events", async () => {
      const tx1 = await enterAndCheckMarkets([OMG], [OMG]);
      const tx2 = await enterAndCheckMarkets([OMG], [OMG]);
      expect(tx1).to.emit(comptroller, "MarketEntered")
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
      await enterAndCheckMarkets([SKT], [], [Error.MARKET_NOT_LISTED]);
      await comptroller._supportMarket(SKT.address);
      await enterAndCheckMarkets([SKT], [SKT]);
    });

    it("returns a list of codes mapping to user's ultimate membership in given addresses", async () => {
      await enterAndCheckMarkets(
        [OMG, ZRX, BAT],
        [OMG, ZRX, BAT],
        [Error.NO_ERROR, Error.NO_ERROR, Error.NO_ERROR]
      );
      await enterAndCheckMarkets([OMG, SKT], [OMG, ZRX, BAT], [Error.NO_ERROR, Error.MARKET_NOT_LISTED]);
    });
  });

  describe("exitMarket", () => {
    it("doesn't let you exit if you have a borrow balance", async () => {
      await enterAndCheckMarkets([OMG], [OMG]);
      OMG.getAccountSnapshot.returns([0, 1, 2, 1]);

      await exitAndCheckMarkets(OMG, [OMG], Error.NONZERO_BORROW_BALANCE);
    });

    it("rejects unless redeem allowed", async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT]);
      // We need to borrow at least 2, otherwise our borrow balance in USD gets truncated
      // when multiplied by price=0.5
      BAT.getAccountSnapshot.returns([0, 0, 2, 1]);

      // BAT has a negative balance and there's no supply, thus account should be underwater
      await exitAndCheckMarkets(OMG, [OMG, BAT], Error.REJECTION);
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

  describe("entering from borrowAllowed", () => {
    it("enters when called by a ctoken", async () => {
      await setBalance(await BAT.wallet.getAddress(), 10n ** 18n);
      await comptroller.connect(BAT.wallet).borrowAllowed(BAT.address, await customer.getAddress(), 1);

      const assetsIn = await comptroller.getAssetsIn(await customer.getAddress());

      expect(assetsIn).to.deep.equal([BAT.address]);

      await checkMarkets([BAT]);
    });

    it("reverts when called by not a ctoken", async () => {
      await expect(
        comptroller.connect(customer).borrowAllowed(BAT.address, await customer.getAddress(), 1)
      ).to.be.revertedWith("sender must be vToken");

      const assetsIn = await comptroller.getAssetsIn(await customer.getAddress());

      expect(assetsIn).to.deep.equal([]);

      await checkMarkets([]);
    });

    it("adds to the asset list only once", async () => {
      await setBalance(await BAT.wallet.getAddress(), 10n ** 18n);
      await comptroller.connect(BAT.wallet).borrowAllowed(BAT.address, await customer.getAddress(), 1);

      await enterAndCheckMarkets([BAT], [BAT]);

      await comptroller.connect(BAT.wallet).borrowAllowed(BAT.address, await customer.getAddress(), 1);
      const assetsIn = await comptroller.getAssetsIn(await customer.getAddress());
      expect(assetsIn).to.deep.equal([BAT.address]);
    });
  });
});

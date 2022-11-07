import { Signer } from "ethers";
import { ethers } from "hardhat";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, PriceOracle, Comptroller__factory, VToken, AccessControlManager, PoolRegistry
} from "../../../typechain";


type PauseFixture = {
  accessControl: FakeContract<AccessControlManager>;
  comptroller: MockContract<Comptroller>;
  poolRegistry: FakeContract<PoolRegistry>;
  oracle: FakeContract<PriceOracle>;
  OMG: FakeContract<VToken>;
  ZRX: FakeContract<VToken>;
  BAT: FakeContract<VToken>;
  SKT: FakeContract<VToken>;
  allTokens: FakeContract<VToken>[];
  names: string[];
};

async function pauseFixture(): Promise<PauseFixture> {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await ComptrollerFactory.deploy(poolRegistry.address, accessControl.address);
  const oracle = await smock.fake<PriceOracle>("PriceOracle");

  accessControl.isAllowedToCall.returns(true);
  const [root] = await ethers.getSigners();
  await comptroller._setPriceOracle(oracle.address);
  const names = ["OMG", "ZRX", "BAT", "sketch"];
  const [OMG, ZRX, BAT, SKT] = await Promise.all(
    names.map(async (name) => {
      const vToken = await smock.fake<VToken>("VToken");
      if (name !== "sketch") {
        const poolRegistryBalance = await poolRegistry.provider.getBalance(poolRegistry.address)
        if (poolRegistryBalance.isZero()) {
          setBalance(await root.getAddress(), 100n ** 18n)
          await root.sendTransaction({
            to: poolRegistry.address,
            value: ethers.utils.parseEther("1"),
          });
        }
        const poolRegistrySigner = await ethers.getSigner(poolRegistry.address);
        await comptroller.connect(poolRegistrySigner)._supportMarket(vToken.address);
      }
      return vToken;
    })
  );
  const allTokens = [OMG, ZRX, BAT];
  return { accessControl, comptroller, oracle, OMG, ZRX, BAT, SKT, allTokens, names, poolRegistry };
}

function configure({ accessControl, oracle, allTokens, names }: PauseFixture) {
  accessControl.isAllowedToCall.reset();
  accessControl.isAllowedToCall.returns(true);
  allTokens.map((vToken, i) => {
    vToken.isVToken.returns(true);
    vToken.symbol.returns(names[i]);
    vToken.name.returns(names[i]);
    vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
  });
}


describe("Comptroller", () => {
  let root: Signer;
  let rootAddress: string;
  let customer: Signer;
  let accounts: Signer[];
  let accessControl: FakeContract<AccessControlManager>;
  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VToken>;
  let ZRX: FakeContract<VToken>;
  let BAT: FakeContract<VToken>;
  let SKT: FakeContract<VToken>;

  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(pauseFixture);
    configure(contracts);
    ({ accessControl, comptroller, OMG, ZRX, BAT, SKT } = contracts);
    rootAddress = await root.getAddress();
  });

  describe("_setActionsPaused", () => {
    it("reverts if AccessControlManager does not allow it", async () => {
      accessControl.isAllowedToCall
        .whenCalledWith(rootAddress, "_setActionsPaused(VToken[],Action[],bool)")
        .returns(false);
      await expect(comptroller._setActionsPaused([OMG.address], [1], true))
        .to.be.revertedWith("only authorised addresses can pause");
    });

    it("reverts if the market is not listed", async () => {
      await expect(comptroller._setActionsPaused([SKT.address], [1], true))
        .to.be.revertedWith("cannot pause a market that is not listed");
    });

    it("does nothing if the actions list is empty", async () => {
      await comptroller._setActionsPaused([OMG.address, ZRX.address], [], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 2)).to.equal(false);
    });

    it("does nothing if the markets list is empty", async () => {
      await comptroller._setActionsPaused([], [1, 2, 3, 4, 5], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 2)).to.equal(false);
    });

    it("can pause one action on several markets", async () => {
      await comptroller._setActionsPaused([OMG.address, BAT.address], [1], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 1)).to.equal(true);
    });

    it("can pause several actions on one market", async () => {
      await comptroller._setActionsPaused([OMG.address], [3, 5, 6], true);
      expect(await comptroller.actionPaused(OMG.address, 3)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 4)).to.equal(false);
      expect(await comptroller.actionPaused(OMG.address, 5)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 6)).to.equal(true);
    });

    it("can pause and unpause several actions on several markets", async () => {
      await comptroller._setActionsPaused([OMG.address, BAT.address, ZRX.address], [3, 4, 5, 6], true);
      await comptroller._setActionsPaused([ZRX.address, BAT.address], [3, 5], false);
      expect(await comptroller.actionPaused(OMG.address, 3)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 4)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 5)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 6)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 3)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 4)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 5)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 6)).to.equal(true);
      expect(await comptroller.actionPaused(BAT.address, 3)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 4)).to.equal(true);
      expect(await comptroller.actionPaused(BAT.address, 5)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 6)).to.equal(true);
    });
  });
});

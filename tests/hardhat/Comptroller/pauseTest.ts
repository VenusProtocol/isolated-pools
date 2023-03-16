import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

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

const maxLoopsLimit = 150;

async function pauseFixture(): Promise<PauseFixture> {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
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
          await setBalance(poolRegistry.address, parseEther("1"));
        }
        await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
      }
      return vToken;
    }),
  );
  const allTokens = [OMG, ZRX, BAT];
  return { accessControl, comptroller, oracle, OMG, ZRX, BAT, SKT, allTokens, names, poolRegistry };
}

function configure({ accessControl, allTokens, names }: PauseFixture) {
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
  let root: SignerWithAddress;
  let accessControl: FakeContract<AccessControlManager>;
  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VToken>;
  let ZRX: FakeContract<VToken>;
  let BAT: FakeContract<VToken>;
  let SKT: FakeContract<VToken>;

  beforeEach(async () => {
    [root] = await ethers.getSigners();
    const contracts = await loadFixture(pauseFixture);
    configure(contracts);
    ({ accessControl, comptroller, OMG, ZRX, BAT, SKT } = contracts);
  });

  describe("setActionsPaused", () => {
    it("reverts if AccessControlManager does not allow it", async () => {
      accessControl.isAllowedToCall
        .whenCalledWith(root.address, "setActionsPaused(address[],uint256[],bool)")
        .returns(false);
      await expect(comptroller.setActionsPaused([OMG.address], [1], true))
        .to.be.revertedWithCustomError(comptroller, "Unauthorized")
        .withArgs(root.address, comptroller.address, "setActionsPaused(address[],uint256[],bool)");
    });

    it("reverts if the market is not listed", async () => {
      await expect(comptroller.setActionsPaused([SKT.address], [1], true)).to.be.revertedWith(
        "cannot pause a market that is not listed",
      );
    });

    it("does nothing if the actions list is empty", async () => {
      await comptroller.setActionsPaused([OMG.address, ZRX.address], [], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 2)).to.equal(false);
    });

    it("does nothing if the markets list is empty", async () => {
      await comptroller.setActionsPaused([], [1, 2, 3, 4, 5], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 2)).to.equal(false);
    });

    it("can pause one action on several markets", async () => {
      await comptroller.setActionsPaused([OMG.address, BAT.address], [1], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 1)).to.equal(true);
    });

    it("can pause several actions on one market", async () => {
      await comptroller.setActionsPaused([OMG.address], [3, 5, 6], true);
      expect(await comptroller.actionPaused(OMG.address, 3)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 4)).to.equal(false);
      expect(await comptroller.actionPaused(OMG.address, 5)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 6)).to.equal(true);
    });

    it("can pause and unpause several actions on several markets", async () => {
      await comptroller.setActionsPaused([OMG.address, BAT.address, ZRX.address], [3, 4, 5, 6], true);
      await comptroller.setActionsPaused([ZRX.address, BAT.address], [3, 5], false);
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

    it("reverts if the market is paused", async () => {
      await comptroller.setActionsPaused([OMG.address], [8], true);
      await expect(comptroller.exitMarket(OMG.address))
        .to.be.revertedWithCustomError(comptroller, "ActionPaused")
        .withArgs(OMG.address, 8);
    });

    it("reverts if market is not listed", async () => {
      await expect(comptroller.exitMarket(SKT.address))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(SKT.address);
    });
  });
});

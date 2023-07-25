import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
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

describe("healAccount", () => {
  let liquidator: SignerWithAddress;
  let user: SignerWithAddress;

  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VToken>;
  let ZRX: FakeContract<VToken>;
  let BAT: FakeContract<VToken>;
  const maxLoopsLimit = 150;

  type HealAccountFixture = {
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

  async function healAccountFixture(): Promise<HealAccountFixture> {
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
    await comptroller.setLiquidationIncentive(parseUnits("1.1", 18));
    await comptroller.setMinLiquidatableCollateral(parseUnits("100", 18));
    await setBalance(poolRegistry.address, parseEther("1"));
    const names = ["OMG", "ZRX", "BAT"];
    const [OMG, ZRX, BAT, SKT] = await Promise.all(
      names.map(async () => {
        const vToken = await smock.fake<VToken>("VToken");
        vToken.isVToken.returns(true);
        await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
        return vToken;
      }),
    );
    const allTokens = [OMG, ZRX, BAT];
    return { accessControl, comptroller, oracle, OMG, ZRX, BAT, SKT, allTokens, names };
  }

  function configure({ accessControl, oracle, allTokens, names }: HealAccountFixture) {
    accessControl.isAllowedToCall.returns(true);
    oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
    allTokens.map((vToken, i) => {
      vToken.isVToken.returns(true);
      vToken.symbol.returns(names[i]);
      vToken.name.returns(names[i]);
      vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
    });
  }

  beforeEach(async () => {
    [, liquidator, user] = await ethers.getSigners();
    const contracts = await loadFixture(healAccountFixture);
    configure(contracts);
    ({ comptroller, OMG, ZRX, BAT } = contracts);
  });

  describe("liquidation incentive * debt == collateral", async () => {
    beforeEach(async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);

      // Supply 1.05 OMG, borrow 0 OMG
      OMG.getAccountSnapshot.whenCalledWith(user.address).returns([0, parseUnits("1.05", 18), 0, parseUnits("1", 18)]);

      // Supply 1.15 ZRX, borrow 1 ZRX
      ZRX.getAccountSnapshot
        .whenCalledWith(user.address)
        .returns([0, parseUnits("1.15", 18), parseUnits("1", 18), parseUnits("1", 18)]);

      // Supply 0 BAT, borrow 1 BAT
      BAT.getAccountSnapshot.whenCalledWith(user.address).returns([0, 0, parseUnits("1", 18), parseUnits("1", 18)]);
    });

    it("fails if the vToken account snapshot returns an error", async () => {
      ZRX.getAccountSnapshot.whenCalledWith(user.address).returns([42, 0, 0, 0]);
      await expect(comptroller.connect(liquidator).healAccount(user.address)).to.be.revertedWithCustomError(
        comptroller,
        "SnapshotError",
      );
    });

    it("fails if collateral exceeds threshold", async () => {
      await comptroller.setMinLiquidatableCollateral("2199999999999999999");
      await expect(comptroller.connect(liquidator).healAccount(user.address))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs("2199999999999999999", "2200000000000000000");
    });

    it("seizes the entire collateral", async () => {
      const omgToSeize = parseUnits("1.05", 18);
      const zrxToSeize = parseUnits("1.15", 18);
      await comptroller.connect(liquidator).healAccount(user.address);
      expect(OMG.seize).to.have.been.calledWith(liquidator.address, user.address, omgToSeize);
      expect(ZRX.seize).to.have.been.calledWith(liquidator.address, user.address, zrxToSeize);
      expect(BAT.seize).to.have.not.been.called;
    });

    it("does not accrue bad debt", async () => {
      const zrxToRepay = parseUnits("1", 18);
      const batToRepay = parseUnits("1", 18);
      await comptroller.connect(liquidator).healAccount(user.address);
      expect(OMG.healBorrow).to.have.not.been.called;
      expect(ZRX.healBorrow).to.have.been.calledWith(liquidator.address, user.address, zrxToRepay);
      expect(BAT.healBorrow).to.have.been.calledWith(liquidator.address, user.address, batToRepay);
    });
  });

  describe("liquidation incentive * debt > collateral", async () => {
    beforeEach(async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);

      // Supply 4 OMG, borrow 0 OMG
      OMG.getAccountSnapshot.whenCalledWith(user.address).returns([0, parseUnits("4", 18), 0, parseUnits("1", 18)]);

      // Supply 7 ZRX, borrow 600 ZRX
      ZRX.getAccountSnapshot
        .whenCalledWith(user.address)
        .returns([0, parseUnits("7", 18), parseUnits("600", 18), parseUnits("1", 18)]);

      // Supply 0 BAT, borrow 400 BAT
      BAT.getAccountSnapshot.whenCalledWith(user.address).returns([0, 0, parseUnits("400", 18), parseUnits("1", 18)]);
    });

    it("seizes the entire collateral", async () => {
      const omgToSeize = parseUnits("4", 18);
      const zrxToSeize = parseUnits("7", 18);
      await comptroller.connect(liquidator).healAccount(user.address);
      expect(OMG.seize).to.have.been.calledWith(liquidator.address, user.address, omgToSeize);
      expect(ZRX.seize).to.have.been.calledWith(liquidator.address, user.address, zrxToSeize);
      expect(BAT.seize).to.have.not.been.called;
    });

    it("accrues bad debt", async () => {
      // total borrows = 600 + 400
      // borrows to repay = (4 + 7) / 1.1 = 10
      // percentage = 10 / 1000 = 1%
      const zrxToRepay = parseUnits("6", 18);
      const batToRepay = parseUnits("4", 18);
      await comptroller.connect(liquidator).healAccount(user.address);
      expect(OMG.healBorrow).to.have.not.been.called;
      expect(ZRX.healBorrow).to.have.been.calledWith(liquidator.address, user.address, zrxToRepay);
      expect(BAT.healBorrow).to.have.been.calledWith(liquidator.address, user.address, batToRepay);
    });
  });

  describe("failures", async () => {
    it("fails if liquidation incentive * debt < collateral", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);

      // Supply 5 OMG, borrow 0 OMG
      OMG.getAccountSnapshot.whenCalledWith(user.address).returns([0, parseUnits("5", 18), 0, parseUnits("1", 18)]);

      // Supply 1.15 ZRX, borrow 1 ZRX
      ZRX.getAccountSnapshot
        .whenCalledWith(user.address)
        .returns([0, parseUnits("1.15", 18), parseUnits("1", 18), parseUnits("1", 18)]);

      // Supply 0 BAT, borrow 1 BAT
      BAT.getAccountSnapshot.whenCalledWith(user.address).returns([0, 0, parseUnits("1", 18), parseUnits("1", 18)]);

      await expect(comptroller.connect(liquidator).healAccount(user.address))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs("2200000000000000000", "6150000000000000000");
    });

    it("fails if liquidation incentive * debt > collateral but there is no shortfall", async () => {
      // This could happen if liquidation incentive is too high
      await comptroller.setLiquidationIncentive(parseUnits("100", 18));
      await comptroller.setCollateralFactor(OMG.address, parseUnits("0.9", 18), parseUnits("0.9", 18));
      await comptroller.connect(user).enterMarkets([OMG.address]);

      // In-kind borrow for simplicity, supply: 4, borrow: 3.5 < 0.9 * 4 = 3.6
      OMG.getAccountSnapshot
        .whenCalledWith(user.address)
        .returns([0, parseUnits("4", 18), parseUnits("3.5", 18), parseUnits("1", 18)]);

      await expect(comptroller.connect(liquidator).healAccount(user.address)).to.be.revertedWithCustomError(
        comptroller,
        "InsufficientShortfall",
      );
    });
  });
});

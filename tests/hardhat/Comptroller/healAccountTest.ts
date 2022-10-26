import { Signer } from "ethers";
import { ethers } from "hardhat";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, PriceOracle, Comptroller__factory, VBep20Immutable, AccessControlManager, PoolRegistry
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";


describe("healAccount", () => {
  let root: Signer;
  let liquidator: Signer;
  let user: Signer;
  let accounts: Signer[];
  let rootAddress: string;
  let liquidatorAddress: string;
  let userAddress: string;

  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VBep20Immutable>;
  let ZRX: FakeContract<VBep20Immutable>;
  let BAT: FakeContract<VBep20Immutable>;

  type HealAccountFixture = {
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

  async function healAccountFixture(): Promise<HealAccountFixture> {
    const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
    const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    const comptroller = await ComptrollerFactory.deploy(poolRegistry.address, accessControl.address);
    const oracle = await smock.fake<PriceOracle>("PriceOracle");

    accessControl.isAllowedToCall.returns(true);
    await comptroller._setPriceOracle(oracle.address);
    await comptroller._setLiquidationIncentive(convertToUnit("1.1", 18));
    await comptroller._setMinLiquidatableCollateral(convertToUnit("100", 18));
    const names = ["OMG", "ZRX", "BAT"];
    const [OMG, ZRX, BAT, SKT] = await Promise.all(
      names.map(async (name) => {
        const vToken = await smock.fake<VBep20Immutable>("VBep20Immutable");
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
        return vToken;
      })
    );
    const allTokens = [OMG, ZRX, BAT];
    return { accessControl, comptroller, oracle, OMG, ZRX, BAT, SKT, allTokens, names };
  }

  function configure({ accessControl, oracle, allTokens, names }: HealAccountFixture) {
    accessControl.isAllowedToCall.returns(true);
    oracle.getUnderlyingPrice.returns(convertToUnit("1", 18));
    allTokens.map((vToken, i) => {
      vToken.isVToken.returns(true);
      vToken.symbol.returns(names[i]);
      vToken.name.returns(names[i]);
      vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
    })
  }

  beforeEach(async () => {
    [root, liquidator, user, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    liquidatorAddress = await liquidator.getAddress();
    userAddress = await user.getAddress();
    const contracts = await loadFixture(healAccountFixture);
    configure(contracts);
    ({ comptroller, OMG, ZRX, BAT } = contracts);
  });

  describe("debt == liquidation incentive * collateral", async () => {
    beforeEach(async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);

      // Supply 1.05 OMG, borrow 0 OMG
      OMG.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, convertToUnit("1.05", 18), 0, convertToUnit("1", 18)]);

      // Supply 1.15 ZRX, borrow 1 ZRX
      ZRX.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, convertToUnit("1.15", 18), convertToUnit("1", 18), convertToUnit("1", 18)]);

      // Supply 0 BAT, borrow 1 BAT
      BAT.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, 0, convertToUnit("1", 18), convertToUnit("1", 18)]);
    });

    it("fails if the vToken account snapshot returns an error", async () => {
      ZRX.getAccountSnapshot.whenCalledWith(userAddress).returns([42, 0, 0, 0]);
      await expect(comptroller.connect(liquidator).healAccount(userAddress))
        .to.be.revertedWithCustomError(comptroller, "SnapshotError");
    });

    it("fails if collateral exceeds threshold", async () => {
      await comptroller._setMinLiquidatableCollateral("2199999999999999999");
      await expect(comptroller.connect(liquidator).healAccount(userAddress))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs("2199999999999999999", "2200000000000000000");
    });

    it("seizes the entire collateral", async () => {
      const omgToSeize = convertToUnit("1.05", 18);
      const zrxToSeize = convertToUnit("1.15", 18);
      await comptroller.connect(liquidator).healAccount(userAddress);
      expect(OMG.seize).to.have.been.calledWith(liquidatorAddress, userAddress, omgToSeize);
      expect(ZRX.seize).to.have.been.calledWith(liquidatorAddress, userAddress, zrxToSeize);
      expect(BAT.seize).to.have.not.been.called;
    });

    it("does not accrue bad debt", async () => {
      const zrxToRepay = convertToUnit("1", 18);
      const batToRepay = convertToUnit("1", 18);
      await comptroller.connect(liquidator).healAccount(userAddress);
      expect(OMG.healBorrow).to.have.not.been.called;
      expect(ZRX.healBorrow).to.have.been.calledWith(liquidatorAddress, userAddress, zrxToRepay);
      expect(BAT.healBorrow).to.have.been.calledWith(liquidatorAddress, userAddress, batToRepay);
    });
  });

  describe("debt > liquidation incentive * collateral", async () => {
    beforeEach(async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);

      // Supply 4 OMG, borrow 0 OMG
      OMG.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, convertToUnit("4", 18), 0, convertToUnit("1", 18)]);

      // Supply 7 ZRX, borrow 600 ZRX
      ZRX.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, convertToUnit("7", 18), convertToUnit("600", 18), convertToUnit("1", 18)]);

      // Supply 0 BAT, borrow 400 BAT
      BAT.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, 0, convertToUnit("400", 18), convertToUnit("1", 18)]);
    });

    it("seizes the entire collateral", async () => {
      const omgToSeize = convertToUnit("4", 18);
      const zrxToSeize = convertToUnit("7", 18);
      await comptroller.connect(liquidator).healAccount(userAddress);
      expect(OMG.seize).to.have.been.calledWith(liquidatorAddress, userAddress, omgToSeize);
      expect(ZRX.seize).to.have.been.calledWith(liquidatorAddress, userAddress, zrxToSeize);
      expect(BAT.seize).to.have.not.been.called;
    });

    it("accrues bad debt", async () => {
      // total borrows = 600 + 400
      // borrows to repay = (4 + 7) / 1.1 = 10
      // percentage = 10 / 1000 = 1%
      const zrxToRepay = convertToUnit("6", 18);
      const batToRepay = convertToUnit("4", 18);
      await comptroller.connect(liquidator).healAccount(userAddress);
      expect(OMG.healBorrow).to.have.not.been.called;
      expect(ZRX.healBorrow).to.have.been.calledWith(liquidatorAddress, userAddress, zrxToRepay);
      expect(BAT.healBorrow).to.have.been.calledWith(liquidatorAddress, userAddress, batToRepay);
    });
  });

  describe("debt < liquidation incentive * collateral", async () => {
    it("fails", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);

      // Supply 5 OMG, borrow 0 OMG
      OMG.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, convertToUnit("5", 18), 0, convertToUnit("1", 18)]);

      // Supply 1.15 ZRX, borrow 1 ZRX
      ZRX.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, convertToUnit("1.15", 18), convertToUnit("1", 18), convertToUnit("1", 18)]);

      // Supply 0 BAT, borrow 1 BAT
      BAT.getAccountSnapshot
        .whenCalledWith(userAddress)
        .returns([0, 0, convertToUnit("1", 18), convertToUnit("1", 18)]);

      await expect(comptroller.connect(liquidator).healAccount(userAddress))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs("2200000000000000000", "6150000000000000000");
    });
  });
});

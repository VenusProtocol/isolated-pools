import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { BSC_BLOCKS_PER_YEAR } from "../../../helpers/deploymentConfig";
import { convertToUnit } from "../../../helpers/utils";
import { AccessControlManager, JumpRateModelV2 } from "../../../typechain";
import { getDescription } from "../util/descriptionHelpers";

const { expect } = chai;
chai.use(smock.matchers);

for (const isTimeBased of [false, true]) {
  let jumpRateModel: JumpRateModelV2;
  let accessControlManager: FakeContract<AccessControlManager>;

  const kink = convertToUnit(8, 17);
  const cash = convertToUnit(10, 19);
  const borrows = convertToUnit(4, 19);
  const reserves = convertToUnit(2, 19);
  const badDebt = convertToUnit(1, 19);
  const expScale = convertToUnit(1, 18);
  const baseRatePerYear = convertToUnit(2, 12);
  const multiplierPerYear = convertToUnit(4, 14);
  const jumpMultiplierPerYear = convertToUnit(2, 18);

  const description = getDescription(isTimeBased);
  let slotsPerYear = isTimeBased ? 0 : BSC_BLOCKS_PER_YEAR;

  describe(`${description}Jump rate model tests`, async () => {
    const fixture = async () => {
      accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
      accessControlManager.isAllowedToCall.returns(true);
      const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelV2");

      jumpRateModel = await JumpRateModelFactory.deploy(
        baseRatePerYear,
        multiplierPerYear,
        jumpMultiplierPerYear,
        kink,
        accessControlManager.address,
        isTimeBased,
        slotsPerYear,
      );
      await jumpRateModel.deployed();
    };

    before(async () => {
      await loadFixture(fixture);
      slotsPerYear = (await jumpRateModel.blocksOrSecondsPerYear()).toNumber();
    });

    it("Update jump rate model", async () => {
      let baseRatePerBlockOrTimestamp = new BigNumber(baseRatePerYear).dividedBy(slotsPerYear).toFixed(0);
      let multiplierPerBlockOrTimestamp = new BigNumber(multiplierPerYear)
        .dividedBy(new BigNumber(slotsPerYear))
        .toFixed(0);
      let jumpMultiplierPerBlockOrTimestamp = new BigNumber(jumpMultiplierPerYear).dividedBy(slotsPerYear).toFixed(0);

      expect(await jumpRateModel.baseRatePerBlock()).equal(baseRatePerBlockOrTimestamp);
      expect(await jumpRateModel.multiplierPerBlock()).equal(multiplierPerBlockOrTimestamp);
      expect(await jumpRateModel.jumpMultiplierPerBlock()).equal(jumpMultiplierPerBlockOrTimestamp);
      expect(await jumpRateModel.kink()).equal(kink);

      await jumpRateModel.updateJumpRateModel(convertToUnit(3, 12), convertToUnit(5, 14), convertToUnit(2.2, 18), kink);

      baseRatePerBlockOrTimestamp = new BigNumber(convertToUnit(3, 12)).dividedBy(slotsPerYear).toFixed(0);
      multiplierPerBlockOrTimestamp = new BigNumber(convertToUnit(5, 14))
        .dividedBy(new BigNumber(slotsPerYear))
        .toFixed(0);
      jumpMultiplierPerBlockOrTimestamp = new BigNumber(convertToUnit(2.2, 18)).dividedBy(slotsPerYear).toFixed(0);

      expect(await jumpRateModel.baseRatePerBlock()).equal(baseRatePerBlockOrTimestamp);
      expect(await jumpRateModel.multiplierPerBlock()).equal(multiplierPerBlockOrTimestamp);
      expect(await jumpRateModel.jumpMultiplierPerBlock()).equal(jumpMultiplierPerBlockOrTimestamp);
      expect(await jumpRateModel.kink()).equal(kink);
    });

    it("Utilization rate: borrows and badDebt is zero", async () => {
      expect(await jumpRateModel.utilizationRate(cash, 0, reserves, 0)).equal(0);
    });

    it("Should return correct number of blocks", async () => {
      expect(await jumpRateModel.blocksOrSecondsPerYear()).to.equal(slotsPerYear);
    });

    it("Utilization rate", async () => {
      const utilizationRate = new BigNumber(Number(borrows) + Number(badDebt))
        .multipliedBy(expScale)
        .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves))
        .toFixed(0);

      expect(await jumpRateModel.utilizationRate(cash, borrows, reserves, badDebt)).equal(utilizationRate);
    });

    it("Borrow Rate: below kink utilization", async () => {
      const multiplierPerBlockOrTimestamp = (await jumpRateModel.multiplierPerBlock()).toString();
      const baseRatePerBlockOrTimestamp = (await jumpRateModel.baseRatePerBlock()).toString();
      const utilizationRate = (await jumpRateModel.utilizationRate(cash, borrows, reserves, badDebt)).toString();

      const value = new BigNumber(utilizationRate)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      expect(await jumpRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
        Number(value) + Number(baseRatePerBlockOrTimestamp),
      );
    });

    it("Borrow Rate: above kink utilization", async () => {
      const multiplierPerBlockOrTimestamp = (await jumpRateModel.multiplierPerBlock()).toString();
      const jumpMultiplierPerBlockOrTimestamp = (await jumpRateModel.jumpMultiplierPerBlock()).toString();
      const baseRatePerBlockOrTimestamp = (await jumpRateModel.baseRatePerBlock()).toString();
      const utilizationRate = (
        await jumpRateModel.utilizationRate(convertToUnit(6, 19), convertToUnit(16, 19), reserves, badDebt)
      ).toString();

      const value = new BigNumber(kink).multipliedBy(multiplierPerBlockOrTimestamp).dividedBy(expScale).toFixed(0);

      const normalRate = Number(value) + Number(baseRatePerBlockOrTimestamp);
      const excessUtil = Number(utilizationRate) - Number(kink);

      const jumpValue = new BigNumber(excessUtil)
        .multipliedBy(jumpMultiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      expect(await jumpRateModel.getBorrowRate(convertToUnit(6, 19), convertToUnit(16, 19), reserves, badDebt)).equal(
        Number(jumpValue) + Number(normalRate),
      );
    });

    it("Supply Rate", async () => {
      const reserveMantissa = convertToUnit(1, 17);
      const oneMinusReserveFactor = Number(expScale) - Number(reserveMantissa);
      const borrowRate = (await jumpRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).toString();
      const rateToPool = new BigNumber(borrowRate).multipliedBy(oneMinusReserveFactor).dividedBy(expScale).toFixed(0);
      const rate = new BigNumber(borrows)
        .multipliedBy(expScale)
        .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves));
      const supplyRate = new BigNumber(rateToPool).multipliedBy(rate).dividedBy(expScale).toFixed(0);

      expect(await jumpRateModel.getSupplyRate(cash, borrows, reserves, reserveMantissa, badDebt)).equal(supplyRate);
    });
  });
}

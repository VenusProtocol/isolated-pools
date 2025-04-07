import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { BSC_BLOCKS_PER_YEAR } from "../../../helpers/deploymentConfig";
import { convertToUnit } from "../../../helpers/utils";
import { TwoKinksInterestRateModel } from "../../../typechain";
import { getDescription } from "../util/descriptionHelpers";

const { expect } = chai;
chai.use(smock.matchers);

for (const isTimeBased of [false, true]) {
  let twoKinksInterestRateModel: TwoKinksInterestRateModel;

  const baseRatePerYear = convertToUnit(0.2, 16);
  const multiplierPerYear = convertToUnit(0.225, 18);
  const kink1 = convertToUnit(0.2, 18);
  const multiplier2PerYear = convertToUnit(0.625, 18);
  const baseRate2PerYear = convertToUnit(0.6, 16);
  const kink2 = convertToUnit(0.8, 18);
  const jumpMultiplierPerYear = convertToUnit(6.8, 18);

  const cash = convertToUnit(10, 19);
  const borrows = convertToUnit(4, 19);
  const reserves = convertToUnit(2, 19);
  const badDebt = convertToUnit(1, 19);
  const expScale = convertToUnit(1, 18);

  const description = getDescription(isTimeBased);
  const slotsPerYear = isTimeBased ? 0 : BSC_BLOCKS_PER_YEAR;

  describe(`${description}Two Kinks Interest Rate Model Tests`, async () => {
    const fixture = async () => {
      const TwoKinksInterestRateModelFactory = await ethers.getContractFactory("TwoKinksInterestRateModel");

      twoKinksInterestRateModel = await TwoKinksInterestRateModelFactory.deploy(
        baseRatePerYear,
        multiplierPerYear,
        kink1,
        multiplier2PerYear,
        baseRate2PerYear,
        kink2,
        jumpMultiplierPerYear,
        isTimeBased,
        slotsPerYear,
      );
      await twoKinksInterestRateModel.deployed();
    };

    before(async () => {
      await loadFixture(fixture);
    });

    it("Utilization rate: borrows and badDebt is zero", async () => {
      expect(await twoKinksInterestRateModel.utilizationRate(cash, 0, reserves, 0)).equal(0);
    });

    it("Should return correct number of blocks", async () => {
      const slotsPerYear = (await twoKinksInterestRateModel.blocksOrSecondsPerYear()).toNumber();
      expect(await twoKinksInterestRateModel.blocksOrSecondsPerYear()).to.equal(slotsPerYear);
    });

    it("Utilization rate", async () => {
      const utilizationRate = new BigNumber(Number(borrows) + Number(badDebt))
        .multipliedBy(expScale)
        .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves))
        .toFixed(0);

      expect(await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves, badDebt)).equal(utilizationRate);
    });

    it("Borrow Rate: below kink1 utilization", async () => {
      const cash = convertToUnit(12, 19);
      const borrows = convertToUnit(1, 19);
      const reserves = convertToUnit(2, 19);
      const badDebt = convertToUnit(1, 19);

      const multiplierPerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_PER_BLOCK_OR_SECOND()
      ).toString();
      const baseRatePerBlockOrTimestamp = (await twoKinksInterestRateModel.BASE_RATE_PER_BLOCK_OR_SECOND()).toString();
      const utilizationRate = (
        await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves, badDebt)
      ).toString();

      expect(new BigNumber(utilizationRate).toNumber()).to.be.lt(new BigNumber(kink1).toNumber());

      const value = new BigNumber(utilizationRate)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
        Number(value) + Number(baseRatePerBlockOrTimestamp),
      );
    });

    it("Borrow Rate: above kink1 and below kink2 utilization", async () => {
      const cash = convertToUnit(12, 19);
      const borrows = convertToUnit(3, 19);
      const reserves = convertToUnit(1, 19);
      const badDebt = convertToUnit(1, 19);

      const multiplierPerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_PER_BLOCK_OR_SECOND()
      ).toString();
      const multiplier2PerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_2_PER_BLOCK_OR_SECOND()
      ).toString();
      const baseRatePerBlockOrTimestamp = (await twoKinksInterestRateModel.BASE_RATE_PER_BLOCK_OR_SECOND()).toString();
      const baseRate2PerBlockOrTimestamp = (
        await twoKinksInterestRateModel.BASE_RATE_2_PER_BLOCK_OR_SECOND()
      ).toString();
      const utilizationRate = (
        await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves, badDebt)
      ).toString();

      expect(new BigNumber(utilizationRate).toNumber()).to.be.gt(new BigNumber(kink1).toNumber());
      expect(new BigNumber(utilizationRate).toNumber()).to.be.lt(new BigNumber(kink2).toNumber());

      const rate1 = new BigNumber(kink1)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .plus(baseRatePerBlockOrTimestamp)
        .toFixed(0);
      const rate2 = new BigNumber(new BigNumber(utilizationRate).minus(kink1))
        .multipliedBy(multiplier2PerBlockOrTimestamp)
        .dividedBy(expScale)
        .plus(baseRate2PerBlockOrTimestamp)
        .toFixed(0);

      expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
        Number(rate1) + Number(rate2),
      );
    });

    it("Borrow Rate: above kink2 utilization", async () => {
      const cash = convertToUnit(12, 19);
      const borrows = convertToUnit(21, 19);
      const reserves = convertToUnit(1, 19);
      const badDebt = convertToUnit(24, 19);

      const multiplierPerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_PER_BLOCK_OR_SECOND()
      ).toString();
      const multiplier2PerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_2_PER_BLOCK_OR_SECOND()
      ).toString();
      const baseRatePerBlockOrTimestamp = (await twoKinksInterestRateModel.BASE_RATE_PER_BLOCK_OR_SECOND()).toString();
      const baseRate2PerBlockOrTimestamp = (
        await twoKinksInterestRateModel.BASE_RATE_2_PER_BLOCK_OR_SECOND()
      ).toString();
      const jumpMultiplierPerBlockOrTimestamp = (
        await twoKinksInterestRateModel.JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND()
      ).toString();
      const utilizationRate = (
        await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves, badDebt)
      ).toString();

      expect(new BigNumber(utilizationRate).toNumber()).to.be.gt(new BigNumber(kink2).toNumber());

      const rate1 = new BigNumber(kink1)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .plus(baseRatePerBlockOrTimestamp)
        .toFixed(0);
      const rate2 = new BigNumber(new BigNumber(kink2).minus(kink1))
        .multipliedBy(multiplier2PerBlockOrTimestamp)
        .dividedBy(expScale)
        .plus(baseRate2PerBlockOrTimestamp)
        .toFixed(0);
      const rate3 = new BigNumber(new BigNumber(utilizationRate).minus(kink2))
        .multipliedBy(jumpMultiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
        new BigNumber(rate1).plus(rate2).plus(rate3).toString(),
      );
    });

    it("Borrow Rate: above kink2 utilization and negative multipliers", async () => {
      const multiplierPerYear = convertToUnit(-0.225, 18);
      const multiplier2PerYear = convertToUnit(-0.625, 18);
      const jumpMultiplierPerYear = convertToUnit(-6.8, 18);

      const TwoKinksInterestRateModelFactory = await ethers.getContractFactory("TwoKinksInterestRateModel");

      twoKinksInterestRateModel = await TwoKinksInterestRateModelFactory.deploy(
        baseRatePerYear,
        multiplierPerYear,
        kink1,
        multiplier2PerYear,
        baseRate2PerYear,
        kink2,
        jumpMultiplierPerYear,
        isTimeBased,
        slotsPerYear,
      );
      await twoKinksInterestRateModel.deployed();

      const cash = convertToUnit(12, 19);
      const borrows = convertToUnit(21, 19);
      const reserves = convertToUnit(1, 19);
      const badDebt = convertToUnit(24, 19);

      const multiplierPerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_PER_BLOCK_OR_SECOND()
      ).toString();
      const multiplier2PerBlockOrTimestamp = (
        await twoKinksInterestRateModel.MULTIPLIER_2_PER_BLOCK_OR_SECOND()
      ).toString();
      const baseRatePerBlockOrTimestamp = (await twoKinksInterestRateModel.BASE_RATE_PER_BLOCK_OR_SECOND()).toString();
      const baseRate2PerBlockOrTimestamp = (
        await twoKinksInterestRateModel.BASE_RATE_2_PER_BLOCK_OR_SECOND()
      ).toString();
      const jumpMultiplierPerBlockOrTimestamp = (
        await twoKinksInterestRateModel.JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND()
      ).toString();
      const utilizationRate = (
        await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves, badDebt)
      ).toString();

      expect(new BigNumber(utilizationRate).toNumber()).to.be.gt(new BigNumber(kink2).toNumber());

      const rate1 = new BigNumber(kink1)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .plus(baseRatePerBlockOrTimestamp)
        .toFixed(0);
      const rate2 = new BigNumber(new BigNumber(kink2).minus(kink1))
        .multipliedBy(multiplier2PerBlockOrTimestamp)
        .dividedBy(expScale)
        .plus(baseRate2PerBlockOrTimestamp)
        .toFixed(0);
      const rate3 = new BigNumber(new BigNumber(utilizationRate).minus(kink2))
        .multipliedBy(jumpMultiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      let finalRate = new BigNumber(rate1).plus(rate2).plus(rate3).toNumber();
      if (finalRate < 0) {
        finalRate = 0;
      }

      expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(finalRate);
    });

    it("Supply Rate", async () => {
      const reserveMantissa = convertToUnit(1, 17);
      const oneMinusReserveFactor = Number(expScale) - Number(reserveMantissa);
      const borrowRate = (await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).toString();
      const rateToPool = new BigNumber(borrowRate).multipliedBy(oneMinusReserveFactor).dividedBy(expScale).toFixed(0);
      const rate = new BigNumber(borrows)
        .multipliedBy(expScale)
        .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves));
      const supplyRate = new BigNumber(rateToPool).multipliedBy(rate).dividedBy(expScale).toFixed(0);

      expect(await twoKinksInterestRateModel.getSupplyRate(cash, borrows, reserves, reserveMantissa, badDebt)).equal(
        supplyRate,
      );
    });
  });
}

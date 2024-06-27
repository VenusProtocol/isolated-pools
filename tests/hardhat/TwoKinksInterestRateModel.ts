import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { BSC_BLOCKS_PER_YEAR } from "../../helpers/deploymentConfig";
import { convertToUnit } from "../../helpers/utils";
import { TwoKinksInterestRateModel } from "../../typechain";
import { getDescription } from "./util/descriptionHelpers";
import { parseEther } from "ethers/lib/utils";

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
  let slotsPerYear = isTimeBased ? 0 : BSC_BLOCKS_PER_YEAR;

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
      slotsPerYear = (await twoKinksInterestRateModel.blocksOrSecondsPerYear()).toNumber();
    });

    it("Utilization rate: borrows and badDebt is zero", async () => {
      expect(await twoKinksInterestRateModel.utilizationRate(cash, 0, reserves, 0)).equal(0);
    });

    it("Should return correct number of blocks", async () => {
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
      
      const multiplierPerBlockOrTimestamp = (await twoKinksInterestRateModel.MULTIPLIER_PER_BLOCK_OR_TIMESTAMP()).toString();
      const baseRatePerBlockOrTimestamp = (await twoKinksInterestRateModel.BASE_RATE_PER_BLOCK_OR_TIMESTAMP()).toString();
      const utilizationRate = (await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves, badDebt)).toString();

      const value = new BigNumber(utilizationRate)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
        Number(value) + Number(baseRatePerBlockOrTimestamp),
      );
    });

    // it("Borrow Rate: above kink utilization", async () => {
    //   const multiplierPerBlockOrTimestamp = (await jumpRateModel.multiplierPerBlock()).toString();
    //   const jumpMultiplierPerBlockOrTimestamp = (await jumpRateModel.jumpMultiplierPerBlock()).toString();
    //   const baseRatePerBlockOrTimestamp = (await jumpRateModel.baseRatePerBlock()).toString();
    //   const utilizationRate = (
    //     await jumpRateModel.utilizationRate(convertToUnit(6, 19), convertToUnit(16, 19), reserves, badDebt)
    //   ).toString();

    //   const value = new BigNumber(kink).multipliedBy(multiplierPerBlockOrTimestamp).dividedBy(expScale).toFixed(0);

    //   const normalRate = Number(value) + Number(baseRatePerBlockOrTimestamp);
    //   const excessUtil = Number(utilizationRate) - Number(kink);

    //   const jumpValue = new BigNumber(excessUtil)
    //     .multipliedBy(jumpMultiplierPerBlockOrTimestamp)
    //     .dividedBy(expScale)
    //     .toFixed(0);

    //   expect(await jumpRateModel.getBorrowRate(convertToUnit(6, 19), convertToUnit(16, 19), reserves, badDebt)).equal(
    //     Number(jumpValue) + Number(normalRate),
    //   );
    // });

    // it("Supply Rate", async () => {
    //   const reserveMantissa = convertToUnit(1, 17);
    //   const oneMinusReserveFactor = Number(expScale) - Number(reserveMantissa);
    //   const borrowRate = (await jumpRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).toString();
    //   const rateToPool = new BigNumber(borrowRate).multipliedBy(oneMinusReserveFactor).dividedBy(expScale).toFixed(0);
    //   const rate = new BigNumber(borrows)
    //     .multipliedBy(expScale)
    //     .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves));
    //   const supplyRate = new BigNumber(rateToPool).multipliedBy(rate).dividedBy(expScale).toFixed(0);

    //   expect(await jumpRateModel.getSupplyRate(cash, borrows, reserves, reserveMantissa, badDebt)).equal(supplyRate);
    // });
  });
}

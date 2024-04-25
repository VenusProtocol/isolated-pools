import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { BSC_BLOCKS_PER_YEAR } from "../../helpers/deploymentConfig";
import { convertToUnit } from "../../helpers/utils";
import { WhitePaperInterestRateModel } from "../../typechain";
import { getDescription } from "./util/descriptionHelpers";

const { expect } = chai;
chai.use(smock.matchers);

for (const isTimeBased of [false, true]) {
  let interestRateModel: WhitePaperInterestRateModel;
  const cash = convertToUnit(10, 19);
  const borrows = convertToUnit(4, 19);
  const reserves = convertToUnit(2, 19);
  const badDebt = convertToUnit(1, 19);
  const expScale = convertToUnit(1, 18);
  const baseRatePerYear = convertToUnit(2, 12);
  const multiplierPerYear = convertToUnit(4, 14);
  const description: string = getDescription(isTimeBased);
  let slotsPerYear = isTimeBased ? 0 : BSC_BLOCKS_PER_YEAR;

  describe(`${description}White Paper interest rate model tests`, () => {
    const fixture = async () => {
      const interestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModel");
      interestRateModel = await interestRateModelFactory.deploy(
        baseRatePerYear,
        multiplierPerYear,
        isTimeBased,
        slotsPerYear,
      );
      await interestRateModel.deployed();
    };

    before(async () => {
      await loadFixture(fixture);
      slotsPerYear = (await interestRateModel.blocksOrSecondsPerYear()).toNumber();
    });

    it("Model getters", async () => {
      const baseRatePerBlockOrTimestamp = new BigNumber(baseRatePerYear).dividedBy(slotsPerYear).toFixed(0);
      const multiplierPerBlockOrTimestamp = new BigNumber(multiplierPerYear).dividedBy(slotsPerYear).toFixed(0);

      expect(await interestRateModel.baseRatePerBlock()).equal(baseRatePerBlockOrTimestamp);
      expect(await interestRateModel.multiplierPerBlock()).equal(multiplierPerBlockOrTimestamp);
    });

    it("Utilization rate: borrows and badDebt is zero", async () => {
      expect(await interestRateModel.utilizationRate(cash, 0, badDebt, 0)).equal(0);
    });

    it("Utilization rate", async () => {
      const utilizationRate = new BigNumber(Number(borrows) + Number(badDebt))
        .multipliedBy(expScale)
        .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves))
        .toFixed(0);

      expect(await interestRateModel.utilizationRate(cash, borrows, reserves, badDebt)).equal(utilizationRate);
    });

    it("Borrow Rate", async () => {
      const multiplierPerBlockOrTimestamp = (await interestRateModel.multiplierPerBlock()).toString();
      const baseRatePerBlockOrTimestamp = (await interestRateModel.baseRatePerBlock()).toString();
      const utilizationRate = (await interestRateModel.utilizationRate(cash, borrows, reserves, badDebt)).toString();

      const value = new BigNumber(utilizationRate)
        .multipliedBy(multiplierPerBlockOrTimestamp)
        .dividedBy(expScale)
        .toFixed(0);

      expect(await interestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
        Number(value) + Number(baseRatePerBlockOrTimestamp),
      );
    });

    it("Supply Rate", async () => {
      const reserveMantissa = convertToUnit(1, 17);
      const oneMinusReserveFactor = Number(expScale) - Number(reserveMantissa);
      const borrowRate = (await interestRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).toString();
      const rateToPool = new BigNumber(borrowRate).multipliedBy(oneMinusReserveFactor).dividedBy(expScale).toFixed(0);
      const rate = new BigNumber(borrows)
        .multipliedBy(expScale)
        .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves));
      const supplyRate = new BigNumber(rateToPool).multipliedBy(rate).dividedBy(expScale).toFixed(0);

      expect(await interestRateModel.getSupplyRate(cash, borrows, reserves, convertToUnit(1, 17), badDebt)).equal(
        supplyRate,
      );
    });
  });
}

import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { WhitePaperInterestRateModel } from "../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("White paper interest rate model tests", () => {
  let whitePaperInterestRateModel: WhitePaperInterestRateModel;
  const expScale = convertToUnit(1, 18);
  const blocksPerYear = 10512000;
  const baseRatePerYear = convertToUnit(2, 12);
  const multiplierPerYear = convertToUnit(4, 14);

  const fixture = async () => {
    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModel");
    whitePaperInterestRateModel = await WhitePaperInterestRateModelFactory.deploy(baseRatePerYear, multiplierPerYear);
    await whitePaperInterestRateModel.deployed();
  };

  before(async () => {
    await loadFixture(fixture);
  });

  it("Model getters", async () => {
    const baseRatePerBlock = new BigNumber(baseRatePerYear).dividedBy(blocksPerYear).toFixed(0);
    const multiplierPerBlock = new BigNumber(multiplierPerYear).dividedBy(blocksPerYear).toFixed(0);

    expect(await whitePaperInterestRateModel.baseRatePerBlock()).equal(baseRatePerBlock);
    expect(await whitePaperInterestRateModel.multiplierPerBlock()).equal(multiplierPerBlock);
  });

  it("Borrow Rate", async () => {
    const multiplierPerBlock = (await whitePaperInterestRateModel.multiplierPerBlock()).toString();
    const baseRatePerBlock = (await whitePaperInterestRateModel.baseRatePerBlock()).toString();
    const utilizationRate = convertToUnit(3, 17);

    const value = new BigNumber(utilizationRate).multipliedBy(multiplierPerBlock).dividedBy(expScale).toFixed(0);

    expect(await whitePaperInterestRateModel.getBorrowRate(utilizationRate)).equal(
      Number(value) + Number(baseRatePerBlock),
    );
  });
});

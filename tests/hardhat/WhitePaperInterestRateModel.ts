import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { WhitePaperInterestRateModel } from "../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("White paper interest rate model tests", () => {
  let whitePaperInterestRateModel: WhitePaperInterestRateModel;

  const fixture = async () => {
    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModel");
    whitePaperInterestRateModel = await WhitePaperInterestRateModelFactory.deploy(
      convertToUnit(2, 12),
      convertToUnit(4, 14),
    );
    await whitePaperInterestRateModel.deployed();
  };

  before(async () => {
    await loadFixture(fixture);
  });

  it("Model getters", async () => {
    expect(await whitePaperInterestRateModel.baseRatePerBlock()).equal("190258");
    expect(await whitePaperInterestRateModel.multiplierPerBlock()).equal("38051750");
  });

  it("Utilization rate: borrows and badDebt is zero", async () => {
    expect(
      await whitePaperInterestRateModel.utilizationRate(
        convertToUnit(10, 19),
        convertToUnit(0, 17),
        convertToUnit(1, 19),
        convertToUnit(0, 19),
      ),
    ).equal(0);
  });

  it("Utilization rate", async () => {
    expect(
      await whitePaperInterestRateModel.utilizationRate(
        convertToUnit(10, 19),
        convertToUnit(4, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 19),
      ),
    ).equal("384615384615384615");
  });

  it("Borrow Rate: below kink utilization", async () => {
    expect(
      await whitePaperInterestRateModel.getBorrowRate(
        convertToUnit(10, 19),
        convertToUnit(4, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 19),
      ),
    ).equal("14825546");
  });

  it("Supply Rate", async () => {
    expect(
      await whitePaperInterestRateModel.getSupplyRate(
        convertToUnit(10, 19),
        convertToUnit(4, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 17),
        convertToUnit(1, 19),
      ),
    ).equal("5131919");
  });
});

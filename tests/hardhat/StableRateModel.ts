import { FakeContract, MockContract, MockContractFactory, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { InterestRateModel, StableRateModel, StableRateModel__factory, VTokenHarness } from "../../typechain";
import { vTokenTestFixture } from "./util/TokenTestHelpers";

let stableRateModelFactory: MockContractFactory<StableRateModel__factory>;
let stableRateModel: MockContract<StableRateModel>;
let vToken: MockContract<VTokenHarness>;
let interestRateModel: FakeContract<InterestRateModel>;

const fixture = async (): Promise<void> => {
  const [owner] = await ethers.getSigners();
  stableRateModelFactory = await smock.mock<StableRateModel__factory>("StableRateModel");
  stableRateModel = await stableRateModelFactory.deploy(
    convertToUnit(1, 10),
    convertToUnit(1, 8),
    convertToUnit(1, 9),
    convertToUnit(1, 10),
    convertToUnit(6, 17),
    convertToUnit(1, 12),
    convertToUnit(4, 17),
    owner.address,
  );
  await stableRateModel.deployed();

  const contracts = await loadFixture(vTokenTestFixture);
  ({ vToken, interestRateModel } = contracts);
};

describe("StableRateModel: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  before(async function () {
    await loadFixture(fixture);
  });

  it("Update the stable rate model", async function () {
    let baseRate = await stableRateModel.baseRatePerBlockForStable();
    let multiplier = await stableRateModel.multiplierPerBlock();
    let multiplierForStable = await stableRateModel.multiplierPerBlockForStable();
    let jumpMultiplierForStable = await stableRateModel.jumpMultiplierPerBlockForStable();
    let kink = await stableRateModel.kink();
    let premiumRate = await stableRateModel.stableRatePremium();
    let optimalRate = await stableRateModel.optimalStableLoanRate();

    expect(baseRate).equals(4756);
    expect(multiplier).equals(79);
    expect(multiplierForStable).equals(792);
    expect(jumpMultiplierForStable).equals(4756);
    expect(kink).equals(convertToUnit(6, 17));
    expect(premiumRate).equals(convertToUnit(1, 12));
    expect(optimalRate).equals(convertToUnit(4, 17));

    await stableRateModel.updateStableRateModel(
      convertToUnit(1, 12),
      convertToUnit(1, 9),
      convertToUnit(1, 8),
      convertToUnit(1, 12),
      convertToUnit(6, 17),
      convertToUnit(1, 12),
      convertToUnit(4, 17),
    );

    baseRate = await stableRateModel.baseRatePerBlockForStable();
    multiplier = await stableRateModel.multiplierPerBlock();
    multiplierForStable = await stableRateModel.multiplierPerBlockForStable();
    jumpMultiplierForStable = await stableRateModel.jumpMultiplierPerBlockForStable();
    kink = await stableRateModel.kink();
    premiumRate = await stableRateModel.stableRatePremium();
    optimalRate = await stableRateModel.optimalStableLoanRate();

    expect(baseRate).equals(475646);
    expect(multiplier).equals(792);
    expect(multiplierForStable).equals(79);
    expect(jumpMultiplierForStable).equals(475646);
    expect(kink).equals(convertToUnit(6, 17));
    expect(premiumRate).equals(convertToUnit(1, 12));
    expect(optimalRate).equals(convertToUnit(4, 17));
  });

  it("Return 0 as utilizationRate for borrows equal to zero", async function () {
    const ut = await stableRateModel.utilizationRate(convertToUnit(9, 20), 0, convertToUnit(2, 18));
    expect(ut).equals(0);
  });

  it("Utilization Rate", async function () {
    const ut = await stableRateModel.utilizationRate(convertToUnit(8, 20), convertToUnit(2, 20), convertToUnit(2, 20));
    expect(ut).equals(convertToUnit(25, 16));
  });

  it("Return 0 as stableLoanRatio for borrows equal to zero", async function () {
    const loanRatio = await stableRateModel.stableLoanRatio(0, 0);
    expect(loanRatio).equals(0);
  });

  it("Stable loan Rate", async function () {
    const loanRatio = await stableRateModel.stableLoanRatio(convertToUnit(8, 20), convertToUnit(80, 20));
    expect(loanRatio).equals(convertToUnit(10, 16));
  });

  it("Calculate stable borrow rate when utilization rate is below kink", async function () {
    const rate = await stableRateModel.getBorrowRate(
      convertToUnit(8, 20),
      convertToUnit(2, 20),
      convertToUnit(4, 20),
      convertToUnit(2, 20),
    );
    expect(rate).to.be.closeTo(Number(convertToUnit(16, 10)), Number(convertToUnit(1, 10)));
  });

  it("Calculate stable borrow rate when utilization rate is above kink", async function () {
    const rate = await stableRateModel.getBorrowRate(
      convertToUnit(8, 20),
      convertToUnit(3, 20),
      convertToUnit(4, 20),
      convertToUnit(2, 20),
    );
    expect(rate).to.be.closeTo(Number(convertToUnit(58, 10)), Number(convertToUnit(1, 10)));
  });

  it("Return 0 as TotalBorrows for supply equal to zero", async function () {
    const sr = await vToken.supplyRatePerBlock();
    expect(sr).equals(0);
  });

  it("Calculate Supply rate of the market", async function () {
    interestRateModel.utilizationRate.returns(convertToUnit(5, 17));
    interestRateModel.getBorrowRate.returns(convertToUnit(3, 17));
    await vToken.harnessSetTotalBorrows(convertToUnit(2, 20));
    await vToken.harnessSetReserveFactorFresh(convertToUnit(1, 17));
    await vToken.harnessSetAvgStableBorrowRate(convertToUnit(4, 17));
    await vToken.harnessStableBorrows(convertToUnit(2, 18));

    expect((await vToken.supplyRatePerBlock()).toString()).to.equal("135450000000000000");
  });
});

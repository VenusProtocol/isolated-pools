import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { AccessControlManager, JumpRateModelV2 } from "../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("Jump rate model tests", () => {
  let jumpRateModel: JumpRateModelV2;
  let accessControlManager: FakeContract<AccessControlManager>;

  const kink = convertToUnit(8, 17);
  const cash = convertToUnit(10, 19);
  const borrows = convertToUnit(4, 19);
  const reserves = convertToUnit(2, 19);
  const badDebt = convertToUnit(1, 19);
  const expScale = convertToUnit(1, 18);
  const secondsPerYear = 31536000;
  const baseRatePerYear = convertToUnit(2, 12);
  const multiplierPerYear = convertToUnit(4, 14);
  const jumpMultiplierPerYear = convertToUnit(2, 18);

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
    );
    await jumpRateModel.deployed();
  };

  before(async () => {
    await loadFixture(fixture);
  });

  it("Update jump rate model", async () => {
    let baseRatePerBlock = new BigNumber(baseRatePerYear).dividedBy(secondsPerYear).toFixed(0);
    let multiplierPerBlock = new BigNumber(multiplierPerYear).dividedBy(new BigNumber(secondsPerYear)).toFixed(0);
    let jumpMultiplierPerBlock = new BigNumber(jumpMultiplierPerYear).dividedBy(secondsPerYear).toFixed(0);

    expect(await jumpRateModel.baseRatePerSecond()).equal(baseRatePerBlock);
    expect(await jumpRateModel.multiplierPerSecond()).equal(multiplierPerBlock);
    expect(await jumpRateModel.jumpMultiplierPerSecond()).equal(jumpMultiplierPerBlock);
    expect(await jumpRateModel.kink()).equal(kink);

    await jumpRateModel.updateJumpRateModel(convertToUnit(3, 12), convertToUnit(5, 14), convertToUnit(2.2, 18), kink);

    baseRatePerBlock = new BigNumber(convertToUnit(3, 12)).dividedBy(secondsPerYear).toFixed(0);
    multiplierPerBlock = new BigNumber(convertToUnit(5, 14)).dividedBy(new BigNumber(secondsPerYear)).toFixed(0);
    jumpMultiplierPerBlock = new BigNumber(convertToUnit(2.2, 18)).dividedBy(secondsPerYear).toFixed(0);

    expect(await jumpRateModel.baseRatePerSecond()).equal(baseRatePerBlock);
    expect(await jumpRateModel.multiplierPerSecond()).equal(multiplierPerBlock);
    expect(await jumpRateModel.jumpMultiplierPerSecond()).equal(jumpMultiplierPerBlock);
    expect(await jumpRateModel.kink()).equal(kink);
  });

  it("Utilization rate: borrows and badDebt is zero", async () => {
    expect(await jumpRateModel.utilizationRate(cash, 0, reserves, 0)).equal(0);
  });

  it("Utilization rate", async () => {
    const utilizationRate = new BigNumber(Number(borrows) + Number(badDebt))
      .multipliedBy(expScale)
      .dividedBy(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves))
      .toFixed(0);

    expect(await jumpRateModel.utilizationRate(cash, borrows, reserves, badDebt)).equal(utilizationRate);
  });

  it("Borrow Rate: below kink utilization", async () => {
    const multiplierPerBlock = (await jumpRateModel.multiplierPerSecond()).toString();
    const baseRatePerBlock = (await jumpRateModel.baseRatePerSecond()).toString();
    const utilizationRate = (await jumpRateModel.utilizationRate(cash, borrows, reserves, badDebt)).toString();

    const value = new BigNumber(utilizationRate).multipliedBy(multiplierPerBlock).dividedBy(expScale).toFixed(0);

    expect(await jumpRateModel.getBorrowRate(cash, borrows, reserves, badDebt)).equal(
      Number(value) + Number(baseRatePerBlock),
    );
  });

  it("Borrow Rate: above kink utilization", async () => {
    const multiplierPerBlock = (await jumpRateModel.multiplierPerSecond()).toString();
    const jumpMultiplierPerBlock = (await jumpRateModel.jumpMultiplierPerSecond()).toString();
    const baseRatePerBlock = (await jumpRateModel.baseRatePerSecond()).toString();
    const utilizationRate = (
      await jumpRateModel.utilizationRate(convertToUnit(6, 19), convertToUnit(16, 19), reserves, badDebt)
    ).toString();

    const value = new BigNumber(kink).multipliedBy(multiplierPerBlock).dividedBy(expScale).toFixed(0);

    const normalRate = Number(value) + Number(baseRatePerBlock);
    const excessUtil = Number(utilizationRate) - Number(kink);

    const jumpValue = new BigNumber(excessUtil).multipliedBy(jumpMultiplierPerBlock).dividedBy(expScale).toFixed(0);

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

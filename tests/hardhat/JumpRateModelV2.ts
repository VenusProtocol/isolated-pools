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
  const expScale = convertToUnit(1, 18);
  const blocksPerYear = 10512000;
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
    let baseRatePerBlock = new BigNumber(baseRatePerYear).dividedBy(blocksPerYear).toFixed(0);
    let multiplierPerBlock = new BigNumber(multiplierPerYear).dividedBy(new BigNumber(blocksPerYear)).toFixed(0);
    let jumpMultiplierPerBlock = new BigNumber(jumpMultiplierPerYear).dividedBy(blocksPerYear).toFixed(0);

    expect(await jumpRateModel.baseRatePerBlock()).equal(baseRatePerBlock);
    expect(await jumpRateModel.multiplierPerBlock()).equal(multiplierPerBlock);
    expect(await jumpRateModel.jumpMultiplierPerBlock()).equal(jumpMultiplierPerBlock);
    expect(await jumpRateModel.kink()).equal(kink);

    await jumpRateModel.updateJumpRateModel(convertToUnit(3, 12), convertToUnit(5, 14), convertToUnit(2.2, 18), kink);

    baseRatePerBlock = new BigNumber(convertToUnit(3, 12)).dividedBy(blocksPerYear).toFixed(0);
    multiplierPerBlock = new BigNumber(convertToUnit(5, 14)).dividedBy(new BigNumber(blocksPerYear)).toFixed(0);
    jumpMultiplierPerBlock = new BigNumber(convertToUnit(2.2, 18)).dividedBy(blocksPerYear).toFixed(0);

    expect(await jumpRateModel.baseRatePerBlock()).equal(baseRatePerBlock);
    expect(await jumpRateModel.multiplierPerBlock()).equal(multiplierPerBlock);
    expect(await jumpRateModel.jumpMultiplierPerBlock()).equal(jumpMultiplierPerBlock);
    expect(await jumpRateModel.kink()).equal(kink);
  });

  it("Borrow Rate: below kink utilization", async () => {
    const multiplierPerBlock = (await jumpRateModel.multiplierPerBlock()).toString();
    const baseRatePerBlock = (await jumpRateModel.baseRatePerBlock()).toString();
    const utilizationRate = convertToUnit(3, 17);
    const value = new BigNumber(utilizationRate).multipliedBy(multiplierPerBlock).dividedBy(expScale).toFixed(0);

    expect(await jumpRateModel.getBorrowRate(utilizationRate)).equal(Number(value) + Number(baseRatePerBlock));
  });

  it("Borrow Rate: above kink utilization", async () => {
    const multiplierPerBlock = (await jumpRateModel.multiplierPerBlock()).toString();
    const jumpMultiplierPerBlock = (await jumpRateModel.jumpMultiplierPerBlock()).toString();
    const baseRatePerBlock = (await jumpRateModel.baseRatePerBlock()).toString();
    const utilizationRate = convertToUnit(8, 17);

    const value = new BigNumber(kink).multipliedBy(multiplierPerBlock).dividedBy(expScale).toFixed(0);

    const normalRate = Number(value) + Number(baseRatePerBlock);
    const excessUtil = Number(utilizationRate) - Number(kink);

    const jumpValue = new BigNumber(excessUtil).multipliedBy(jumpMultiplierPerBlock).dividedBy(expScale).toFixed(0);

    expect(await jumpRateModel.getBorrowRate(utilizationRate)).equal(Number(jumpValue) + Number(normalRate));
  });
});

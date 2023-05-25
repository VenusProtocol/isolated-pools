import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
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

  const fixture = async () => {
    accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    accessControlManager.isAllowedToCall.returns(true);

    const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelV2");
    jumpRateModel = await JumpRateModelFactory.deploy(
      convertToUnit(2, 12),
      convertToUnit(4, 14),
      convertToUnit(2, 18),
      kink,
      accessControlManager.address,
    );
    await jumpRateModel.deployed();
  };

  before(async () => {
    await loadFixture(fixture);
  });

  it("Update jump rate model", async () => {
    expect(await jumpRateModel.baseRatePerBlock()).equal("190258");
    expect(await jumpRateModel.multiplierPerBlock()).equal("47564687");
    expect(await jumpRateModel.jumpMultiplierPerBlock()).equal("190258751902");
    expect(await jumpRateModel.kink()).equal(kink);

    await jumpRateModel.updateJumpRateModel(convertToUnit(3, 12), convertToUnit(5, 14), convertToUnit(2.2, 18), kink);

    expect(await jumpRateModel.baseRatePerBlock()).equal("285388");
    expect(await jumpRateModel.multiplierPerBlock()).equal("59455859");
    expect(await jumpRateModel.jumpMultiplierPerBlock()).equal("209284627092");
    expect(await jumpRateModel.kink()).equal(kink);
  });

  it("Utilization rate: borrows and badDebt is zero", async () => {
    expect(
      await jumpRateModel.utilizationRate(
        convertToUnit(10, 19),
        convertToUnit(0, 17),
        convertToUnit(1, 19),
        convertToUnit(0, 19),
      ),
    ).equal(0);
  });

  it("Utilization rate", async () => {
    expect(
      await jumpRateModel.utilizationRate(
        convertToUnit(10, 19),
        convertToUnit(4, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 19),
      ),
    ).equal("384615384615384615");
  });

  it("Borrow Rate: below kink utilization", async () => {
    expect(
      await jumpRateModel.getBorrowRate(
        convertToUnit(10, 19),
        convertToUnit(4, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 19),
      ),
    ).equal("23153026");
  });

  it("Borrow Rate: above kink utilization", async () => {
    expect(
      await jumpRateModel.getBorrowRate(
        convertToUnit(6, 19),
        convertToUnit(16, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 19),
      ),
    ).equal("2041036999");
  });

  it("Supply Rate", async () => {
    expect(
      await jumpRateModel.getSupplyRate(
        convertToUnit(10, 19),
        convertToUnit(4, 19),
        convertToUnit(2, 19),
        convertToUnit(1, 17),
        convertToUnit(1, 19),
      ),
    ).equal("8014508");
  });
});

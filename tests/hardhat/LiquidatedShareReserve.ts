import { ethers } from "hardhat";
import { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  MockToken,
  RiskFund,
  LiquidatedShareReserve,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let mockDAI: MockToken;
let fakeRiskFund: FakeContract<RiskFund>;
let fakeLiquidatedShares: FakeContract<RiskFund>;
let liquidatedShareReserve: LiquidatedShareReserve;

const fixture = async (): Promise<void> => {
  const MockDAI = await ethers.getContractFactory("MockToken");
  mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
  await mockDAI.faucet(convertToUnit(1000, 18));

  // Fake contracts
  fakeRiskFund = await smock.fake<RiskFund>("RiskFund");
  fakeLiquidatedShares = await smock.fake<RiskFund>("RiskFund");

  // LiquidatedShareReserve contract deployment
  const LiquidatedShareReserve = await ethers.getContractFactory(
    "LiquidatedShareReserve"
  );
  liquidatedShareReserve = await LiquidatedShareReserve.deploy();
  await liquidatedShareReserve.deployed();

  await liquidatedShareReserve.initialize(
    fakeLiquidatedShares.address,
    fakeRiskFund.address
  );
};

describe("Liquidated shares reserves: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  before(async function () {
    await loadFixture(fixture);
  });

  it("Revert on invalid asset address.", async function () {
    await expect(
      liquidatedShareReserve.releaseFunds(
        "0x0000000000000000000000000000000000000000",
        10
      )
    ).to.be.rejectedWith("Liquidated shares Reserves: Asset address invalid");
  });

  it("Revert on Insufficient balance.", async function () {
    await expect(
      liquidatedShareReserve.releaseFunds(mockDAI.address, 10)
    ).to.be.rejectedWith("Liquidated shares Reserves: Insufficient balance");
  });

  it("Release liquidated share reserve", async function () {
    await mockDAI.transfer(
      liquidatedShareReserve.address,
      convertToUnit(100, 18)
    );
    const balance = await mockDAI.balanceOf(liquidatedShareReserve.address);

    expect(balance).equal(convertToUnit(100, 18));

    await liquidatedShareReserve.releaseFunds(
      mockDAI.address,
      convertToUnit(100, 18)
    );

    const riskFundBal = await mockDAI.balanceOf(fakeRiskFund.address);
    const liquidatedShareBal = await mockDAI.balanceOf(
      fakeLiquidatedShares.address
    );
    const liquidatedShareReserveBal = await mockDAI.balanceOf(
      liquidatedShareReserve.address
    );

    expect(riskFundBal).equal(convertToUnit(30, 18));
    expect(liquidatedShareBal).equal(convertToUnit(70, 18));
    expect(liquidatedShareReserveBal).equal("0");
  });
});

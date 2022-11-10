import { ethers } from "hardhat";
import { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  MockToken,
  RiskFund,
  ProtocolShareReserve,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let mockDAI: MockToken;
let fakeRiskFund: FakeContract<RiskFund>;
let fakeLiquidatedShares: FakeContract<RiskFund>;
let protocolShareReserve: ProtocolShareReserve;

const fixture = async (): Promise<void> => {
  const MockDAI = await ethers.getContractFactory("MockToken");
  mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
  await mockDAI.faucet(convertToUnit(1000, 18));

  // Fake contracts
  fakeRiskFund = await smock.fake<RiskFund>("RiskFund");
  fakeLiquidatedShares = await smock.fake<RiskFund>("RiskFund");

  // ProtocolShareReserve contract deployment
  const ProtocolShareReserve = await ethers.getContractFactory(
    "ProtocolShareReserve"
  );
  protocolShareReserve = await ProtocolShareReserve.deploy();
  await protocolShareReserve.deployed();

  await protocolShareReserve.initialize(
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
      protocolShareReserve.releaseFunds(
        "0x0000000000000000000000000000000000000111",
        "0x0000000000000000000000000000000000000000",
        10
      )
    ).to.be.rejectedWith("Liquidated shares Reserves: Asset address invalid");
  });

  it("Revert on Insufficient balance.", async function () {
    await expect(
      protocolShareReserve.releaseFunds(
        "0x0000000000000000000000000000000000000111", // Mock comptroller address
        mockDAI.address,
        10
      )
    ).to.be.rejectedWith(
      "Liquidated shares Reserves: Insufficient pool balance"
    );
  });

  it("Release liquidated share reserve", async function () {
    await mockDAI.transfer(
      protocolShareReserve.address,
      convertToUnit(100, 18)
    );

    await protocolShareReserve.updateAssetsState(
      "0x0000000000000000000000000000000000000111", // Mock comptroller address
      mockDAI.address
    );

    const balance = await mockDAI.balanceOf(protocolShareReserve.address);

    expect(balance).equal(convertToUnit(100, 18));

    await protocolShareReserve.releaseFunds(
      "0x0000000000000000000000000000000000000111", // Mock comptroller address
      mockDAI.address,
      convertToUnit(100, 18)
    );

    const riskFundBal = await mockDAI.balanceOf(fakeRiskFund.address);
    const liquidatedShareBal = await mockDAI.balanceOf(
      fakeLiquidatedShares.address
    );
    const protocolShareReserveBal = await mockDAI.balanceOf(
      protocolShareReserve.address
    );

    expect(riskFundBal).equal(convertToUnit(30, 18));
    expect(liquidatedShareBal).equal(convertToUnit(70, 18));
    expect(protocolShareReserveBal).equal("0");
  });
});

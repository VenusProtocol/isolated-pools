import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { Comptroller, MockToken, PoolRegistry, ProtocolShareReserve, RiskFund } from "../../typechain";

let mockDAI: MockToken;
let fakeRiskFund: FakeContract<RiskFund>;
let poolRegistry: FakeContract<PoolRegistry>;
let fakeProtocolIncome: FakeContract<RiskFund>;
let fakeComptroller: FakeContract<Comptroller>;
let protocolShareReserve: ProtocolShareReserve;

const fixture = async (): Promise<void> => {
  const MockDAI = await ethers.getContractFactory("MockToken");
  mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
  await mockDAI.faucet(convertToUnit(1000, 18));

  // Fake contracts
  fakeRiskFund = await smock.fake<RiskFund>("RiskFund");
  await fakeRiskFund.updateAssetsState.returns();

  poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  poolRegistry.getVTokenForAsset.returns("0x0000000000000000000000000000000000000001");

  fakeProtocolIncome = await smock.fake<RiskFund>("RiskFund");
  fakeComptroller = await smock.fake<Comptroller>("Comptroller");

  // ProtocolShareReserve contract deployment
  const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
  protocolShareReserve = await upgrades.deployProxy(ProtocolShareReserve, [
    fakeProtocolIncome.address,
    fakeRiskFund.address,
  ]);

  await protocolShareReserve.setPoolRegistry(poolRegistry.address);
};

describe("ProtocolShareReserve: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  before(async function () {
    await loadFixture(fixture);
  });

  it("Revert on invalid asset address.", async function () {
    await expect(
      protocolShareReserve.releaseFunds(fakeComptroller.address, "0x0000000000000000000000000000000000000000", 10),
    ).to.be.rejectedWith("ProtocolShareReserve: Asset address invalid");
  });

  it("Revert on Insufficient balance.", async function () {
    await expect(
      protocolShareReserve.releaseFunds(
        fakeComptroller.address, // Mock comptroller address
        mockDAI.address,
        10,
      ),
    ).to.be.rejectedWith("ProtocolShareReserve: Insufficient pool balance");
  });

  it("Release liquidated share reserve", async function () {
    await mockDAI.transfer(protocolShareReserve.address, convertToUnit(100, 18));

    fakeComptroller.isComptroller.returns(true);
    await protocolShareReserve.updateAssetsState(
      fakeComptroller.address, // Mock comptroller address
      mockDAI.address,
    );

    const balance = await mockDAI.balanceOf(protocolShareReserve.address);

    expect(balance).equal(convertToUnit(100, 18));

    let protocolUSDT = await protocolShareReserve.getPoolAssetReserve(fakeComptroller.address, mockDAI.address);

    expect(protocolUSDT).equal(convertToUnit(100, 18));

    await protocolShareReserve.releaseFunds(
      fakeComptroller.address, // Mock comptroller address
      mockDAI.address,
      convertToUnit(90, 18),
    );

    protocolUSDT = await protocolShareReserve.getPoolAssetReserve(fakeComptroller.address, mockDAI.address);

    expect(protocolUSDT).equal(convertToUnit(10, 18));

    const riskFundBal = await mockDAI.balanceOf(fakeRiskFund.address);
    const liquidatedShareBal = await mockDAI.balanceOf(fakeProtocolIncome.address);
    const protocolShareReserveBal = await mockDAI.balanceOf(protocolShareReserve.address);

    expect(riskFundBal).equal(convertToUnit(27, 18));
    expect(liquidatedShareBal).equal(convertToUnit(63, 18));
    expect(protocolShareReserveBal).equal(convertToUnit(10, 18));
  });
});

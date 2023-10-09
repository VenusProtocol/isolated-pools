import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { Comptroller, MockToken, PoolRegistry, ProtocolShareReserve, RiskFund } from "../../typechain";

let mockDAI: MockToken;
let fakeRiskFund: FakeContract<RiskFund>;
let poolRegistry: FakeContract<PoolRegistry>;
let fakeProtocolIncome: FakeContract<RiskFund>;
let fakeComptroller: FakeContract<Comptroller>;
let protocolShareReserve: ProtocolShareReserve;
let fakeCorePoolComptroller: FakeContract<Comptroller>;

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
  fakeCorePoolComptroller = await smock.fake<Comptroller>("Comptroller");

  // ProtocolShareReserve contract deployment
  const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
  protocolShareReserve = await upgrades.deployProxy(ProtocolShareReserve, [
    fakeProtocolIncome.address,
    fakeRiskFund.address,
  ], {
    constructorArgs: [
      fakeCorePoolComptroller.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    ],
  });

  await protocolShareReserve.setPoolRegistry(poolRegistry.address);
};

describe("ProtocolShareReserve: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  let signer2: SignerWithAddress;
  before(async function () {
    await loadFixture(fixture);
    [, signer2] = await ethers.getSigners();
  });

  it("Revert on invalid asset address.", async function () {
    await expect(
      protocolShareReserve.releaseFunds(fakeComptroller.address, constants.AddressZero, 10),
    ).to.be.revertedWithCustomError(protocolShareReserve, "ZeroAddressNotAllowed");
  });

  it("Revert on Insufficient balance.", async function () {
    await expect(
      protocolShareReserve.releaseFunds(
        fakeComptroller.address, // Mock comptroller address
        mockDAI.address,
        10,
      ),
    ).to.be.revertedWith("ProtocolShareReserve: Insufficient pool balance");
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

    expect(riskFundBal).equal(convertToUnit(45, 18));
    expect(liquidatedShareBal).equal(convertToUnit(45, 18));
    expect(protocolShareReserveBal).equal(convertToUnit(10, 18));
  });

  it("Revert if try to sweep tokens by non admin", async function () {
    await expect(protocolShareReserve.connect(signer2).sweepToken(mockDAI.address, signer2.address)).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });

  it("Revert if recipient address is zero", async function () {
    await expect(
      protocolShareReserve.sweepToken(mockDAI.address, ethers.constants.AddressZero),
    ).to.be.revertedWithCustomError(protocolShareReserve, "ZeroAddressNotAllowed");
  });

  it("Revert if there are no surplus tokens to sweep", async function () {
    await mockDAI.transfer(protocolShareReserve.address, convertToUnit(100, 18));

    fakeComptroller.isComptroller.returns(true);
    // Update assetReserves with all available balance
    await protocolShareReserve.updateAssetsState(
      fakeComptroller.address, // Mock comptroller address
      mockDAI.address,
    );

    await expect(protocolShareReserve.sweepToken(mockDAI.address, signer2.address)).to.be.revertedWith(
      "ReserveHelpers: Zero surplus tokens",
    );
  });

  it("Success on sweep tokens", async function () {
    const amount = convertToUnit(100, 18);
    const excessAmount = convertToUnit(50, 18);
    const protocolShareReserveBalPrev = await mockDAI.balanceOf(protocolShareReserve.address);
    await mockDAI.transfer(protocolShareReserve.address, amount);

    fakeComptroller.isComptroller.returns(true);
    // Update assetReserves with all available balance
    await protocolShareReserve.updateAssetsState(
      fakeComptroller.address, // Mock comptroller address
      mockDAI.address,
    );
    let protocolShareReserveBal = await mockDAI.balanceOf(protocolShareReserve.address);
    expect(protocolShareReserveBal.sub(protocolShareReserveBalPrev)).equal(amount);

    // Sending some extra funds but not updating assetReserves
    await mockDAI.transfer(protocolShareReserve.address, excessAmount);

    await protocolShareReserve.sweepToken(mockDAI.address, signer2.address);
    protocolShareReserveBal = await mockDAI.balanceOf(protocolShareReserve.address);
    expect(protocolShareReserveBal).equal(protocolShareReserveBalPrev.add(amount));

    const recipientBal = await mockDAI.balanceOf(signer2.address);
    expect(recipientBal).equal(excessAmount);
  });
});

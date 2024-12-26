import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  ERC20Harness,
  InterestRateModel,
  MockFlashloanReceiver,
  MockFlashloanReceiver__factory,
  PoolRegistry,
  ProtocolShareReserve,
  VTokenHarness,
  VTokenHarness__factory,
} from "../../../typechain";
import { makeVToken, mockUnderlying } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const MAX_LOOP_LIMIT = 150;

const flashloanAmount1 = parseUnits("20", 18);
const flashloanAmount2 = parseUnits("30", 18);
const feeMantissaTokenA = parseUnits("0.01", 18);
const feeMantissaTokenB = parseUnits("0.02", 18);

// Declare the types here
type FlashloanContractsFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  protocolShareReserve: FakeContract<ProtocolShareReserve>;
  interestRateModel: FakeContract<InterestRateModel>;
  poolRegistry: FakeContract<PoolRegistry>;
  comptroller: Comptroller;
  underlyingA: MockContract<ERC20Harness>;
  underlyingB: MockContract<ERC20Harness>;
  VTokenA: VTokenHarness;
  VTokenB: VTokenHarness;
};

// Create a fixture will deploy all the required contracts for flashloan
const flashLoanTestFixture = async (): Promise<FlashloanContractsFixture> => {
  const [admin] = await ethers.getSigners();
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);
  const protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");
  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);

  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");

  const underlyingA = await mockUnderlying("Mock AAVE", "AAVE");
  const underlyingB = await mockUnderlying("Mock UNI", "UNI");

  const Comptroller = await ethers.getContractFactory("Comptroller");
  const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

  const comptroller = await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
    MAX_LOOP_LIMIT,
    accessControlManager.address,
  ]);

  const VTokenA = await makeVToken<VTokenHarness__factory>(
    {
      underlying: underlyingA,
      comptroller,
      accessControlManager,
      admin,
      interestRateModel,
      protocolShareReserve,
      isFlashloanAllowed: true,
      flashloanFeeMantissa: feeMantissaTokenA,
    },
    { kind: "VTokenHarness" },
  );

  const VTokenB = await makeVToken<VTokenHarness__factory>(
    {
      underlying: underlyingB,
      comptroller,
      accessControlManager,
      admin,
      interestRateModel,
      protocolShareReserve,
      isFlashloanAllowed: true,
      flashloanFeeMantissa: feeMantissaTokenB,
    },
    { kind: "VTokenHarness" },
  );

  await comptroller.setMarketSupplyCaps(
    [VTokenA.address, VTokenB.address],
    [convertToUnit(1, 50), convertToUnit(1, 50)],
  );

  await setBalance(poolRegistry.address, parseEther("1"));
  await comptroller.connect(poolRegistry.wallet).supportMarket(VTokenA.address);
  await comptroller.connect(poolRegistry.wallet).supportMarket(VTokenB.address);

  return {
    accessControlManager,
    protocolShareReserve,
    interestRateModel,
    poolRegistry,
    comptroller,
    underlyingA,
    underlyingB,
    VTokenA,
    VTokenB,
  };
};

describe("Flashloan", async () => {
  let alice: SignerWithAddress;
  let acmUser: SignerWithAddress;
  let contracts: FlashloanContractsFixture;
  let VTokenA: VTokenHarness;
  let VTokenB: VTokenHarness;
  let underlyingA: MockContract<ERC20Harness>;
  let underlyingB: MockContract<ERC20Harness>;
  let comptroller: Comptroller;
  let mockReceiverContract: MockFlashloanReceiver;

  beforeEach(async () => {
    [alice, acmUser] = await ethers.getSigners();
    contracts = await loadFixture(flashLoanTestFixture);
    ({ comptroller, VTokenA, VTokenB, underlyingA, underlyingB } = contracts);
  });

  describe("Flashloan Multi-Assets", async () => {
    beforeEach(async () => {
      const MockFlashloanReceiver = await ethers.getContractFactory<MockFlashloanReceiver__factory>(
        "MockFlashloanReceiver",
      );
      mockReceiverContract = await MockFlashloanReceiver.deploy(comptroller.address);
      await mockReceiverContract.deployed();
    });

    it("Should revert if flashloan is not enabled", async () => {
      await VTokenA.connect(acmUser).toggleFlashloan();
      expect(await VTokenA.isFlashloanEnabled()).to.be.false;

      await expect(
        mockReceiverContract.requestFlashloan(
          [VTokenA.address.toString(), VTokenB.address.toString()],
          [flashloanAmount1, flashloanAmount2],
        ),
      ).to.be.revertedWithCustomError(comptroller, "FlashLoanNotEnabled");
    });

    it("Flashloan for multiple underlying", async () => {
      // Admin Enable flashLoan for multiple vToken
      expect(await VTokenA.isFlashloanEnabled()).to.be.true;
      expect(await VTokenB.isFlashloanEnabled()).to.be.true;

      // Set the balance of mockReceiver in order to pay for flashloan fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, parseUnits("10", 18));
      await underlyingB.harnessSetBalance(mockReceiverContract.address, parseUnits("20", 18));

      await underlyingA.harnessSetBalance(VTokenA.address, parseUnits("50", 18));
      await underlyingB.harnessSetBalance(VTokenB.address, parseUnits("50", 18));

      // Get the balance before the flashloan
      const beforeBalanceVTokenA = await underlyingA.balanceOf(VTokenA.address);
      const beforeBalanceVTokenB = await underlyingB.balanceOf(VTokenB.address);

      // Execute the flashloan from the mockReceiverContract
      const flashloan = await mockReceiverContract
        .connect(alice)
        .requestFlashloan([VTokenA.address, VTokenB.address], [flashloanAmount1, flashloanAmount2]);

      // Get the balance after the flashloan
      const afterBalanceVTokenA = await underlyingA.balanceOf(VTokenA.address);
      const afterBalanceVTokenB = await underlyingB.balanceOf(VTokenB.address);

      const feeOnFlashLoanTokenA = BigNumber.from(flashloanAmount1).mul(feeMantissaTokenA).div(parseUnits("1", 18));
      const feeOnFlashLoanTokenB = BigNumber.from(flashloanAmount2).mul(feeMantissaTokenB).div(parseUnits("1", 18));

      expect(afterBalanceVTokenA).to.be.equal(beforeBalanceVTokenA.add(feeOnFlashLoanTokenA));
      expect(afterBalanceVTokenB).to.be.equal(beforeBalanceVTokenB.add(feeOnFlashLoanTokenB));

      await expect(flashloan)
        .to.emit(comptroller, "FlashloanExecuted")
        .withArgs(
          mockReceiverContract.address,
          [VTokenA.address, VTokenB.address],
          [flashloanAmount1, flashloanAmount2],
        );
    });
  });
});

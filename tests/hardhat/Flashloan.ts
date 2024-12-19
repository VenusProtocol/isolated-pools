import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../helpers/utils";
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
} from "../../typechain";
import { makeVToken, mockUnderlying, preApprove } from "./util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const MAX_LOOP_LIMIT = 150;

const exchangeRate = parseUnits("50000", 18).toBigInt();
const flashloanAmount1 = parseUnits("1000", 18).toBigInt();
const flashloanAmount2 = parseUnits("2000", 18).toBigInt();
const mintAmount1 = parseUnits("5000", 18).toBigInt();
const mintAmount2 = parseUnits("5000", 18).toBigInt();

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

async function preMint(
  contracts: FlashloanContractsFixture,
  minter: SignerWithAddress,
  mintAmountA: BigNumberish,
  mintAmountB: BigNumberish,
  exchangeRate: BigNumberish,
) {
  const { interestRateModel, underlyingA, underlyingB, VTokenA, VTokenB } = contracts;
  await preApprove(underlyingA, VTokenA, minter, mintAmountA, { faucet: true });
  await preApprove(underlyingB, VTokenB, minter, mintAmountB, { faucet: true });

  // await comptroller.premintHook.reset
  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const minterAddress = minter.address;
  await underlyingA.harnessSetFailTransferFromAddress(minterAddress, false);
  await underlyingB.harnessSetFailTransferFromAddress(minterAddress, false);
  await VTokenA.harnessSetBalance(minterAddress, 0);
  await VTokenB.harnessSetBalance(minterAddress, 0);
  await VTokenA.harnessSetExchangeRate(exchangeRate);
  await VTokenB.harnessSetExchangeRate(exchangeRate);
}

async function quickMint(
  underlying: MockContract<ERC20Harness>,
  vToken: VTokenHarness,
  minter: SignerWithAddress,
  mintAmount: BigNumberish,
  opts: { approve?: boolean; exchangeRate?: BigNumberish; faucet?: boolean } = { approve: true, faucet: true },
) {
  // make sure to accrue interest
  await vToken.harnessFastForward(1);

  if (opts.approve || opts.approve === undefined) {
    await preApprove(underlying, vToken, minter, mintAmount, opts);
  }
  if (opts.exchangeRate !== undefined) {
    await vToken.harnessSetExchangeRate(opts.exchangeRate);
  }
  return vToken.connect(minter).mint(mintAmount);
}

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
    },
    { kind: "VTokenHarness" },
  );

  console.log(`Market Name and Address ${await VTokenA.name()} & ${VTokenA.address}`);
  console.log(`Market Name and Address ${await VTokenB.name()} & ${VTokenB.address}`);

  await comptroller.setMarketSupplyCaps(
    [VTokenA.address, VTokenB.address],
    [convertToUnit(1, 50), convertToUnit(1, 50)],
  );

  await setBalance(poolRegistry.address, parseEther("1"));
  await comptroller.connect(poolRegistry.wallet).supportMarket(VTokenA.address);
  await comptroller.connect(poolRegistry.wallet).supportMarket(VTokenB.address);

  // await comptroller.enterMarkets([VTokenA.address, VTokenB.address]);
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
  let admin: SignerWithAddress;
  let minter: SignerWithAddress;
  let alice: SignerWithAddress;
  let contracts: FlashloanContractsFixture;
  let VTokenA: VTokenHarness;
  let VTokenB: VTokenHarness;
  let underlyingA: MockContract<ERC20Harness>;
  let underlyingB: MockContract<ERC20Harness>;
  let comptroller: Comptroller;
  let mockReceiverContract: MockFlashloanReceiver;

  beforeEach(async () => {
    [admin, minter, alice] = await ethers.getSigners();
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
      await expect(
        mockReceiverContract.requestFlashloan(
          [VTokenA.address.toString(), VTokenB.address.toString()],
          [flashloanAmount1, flashloanAmount2],
        ),
      ).to.be.revertedWithCustomError(comptroller, "FlashLoanNotEnabled");
    });

    it("Should be able to toggle flashloan feature", async () => {
      await VTokenA.connect(admin).toggleFlashloan();
      await VTokenB.connect(admin).toggleFlashloan();
      expect(await VTokenA.isFlashloanEnabled()).to.be.true;
      expect(await VTokenB.isFlashloanEnabled()).to.be.true;
    });

    it("Flashloan for multiple underlying", async () => {
      // Admin Enable flashLoan for multiple vToken
      await VTokenA.toggleFlashloan();
      expect(await VTokenA.isFlashloanEnabled()).to.be.true;
      await VTokenB.toggleFlashloan();
      expect(await VTokenB.isFlashloanEnabled()).to.be.true;

      // Before Mint State Setup we need to mint for multiple vToken
      await preMint(contracts, minter, mintAmount1, mintAmount2, exchangeRate);

      // Now supplying underlying to VToken1
      await quickMint(underlyingA, VTokenA, minter, mintAmount1, { approve: true, exchangeRate, faucet: false });
      await quickMint(underlyingB, VTokenB, minter, mintAmount2, { approve: true, exchangeRate, faucet: false });

      // Set the balance of mockReceiver in order to pay for flashloan fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, parseUnits("10", 18));
      await underlyingB.harnessSetBalance(mockReceiverContract.address, parseUnits("20", 18));

      // Get the balance before the flashloan
      const beforeBalanceA = await underlyingA.balanceOf(mockReceiverContract.address);
      const beforeBalanceB = await underlyingA.balanceOf(mockReceiverContract.address);

      console.log(
        `Underlying Balances Alice Receiver Contract ${beforeBalanceA.toString()} & ${beforeBalanceB.toString()}`,
      );

      // Execute the flashloan from the mockReceiverContract
      await mockReceiverContract
        .connect(alice)
        .requestFlashloan(
          [VTokenA.address.toString(), VTokenB.address.toString()],
          [flashloanAmount1, flashloanAmount2],
        );

      // Get the balance after the flashloan
      const afterBalanceA = await underlyingA.balanceOf(mockReceiverContract.address);
      const afterBalanceB = await underlyingA.balanceOf(mockReceiverContract.address);

      console.log(
        `Underlying Balances Alice Receiver Contract ${afterBalanceA.toString()} & ${afterBalanceB.toString()}`,
      );

      expect(afterBalanceA).to.be.equal(0);
      expect(afterBalanceB).to.be.equal(0);
    });
  });
});

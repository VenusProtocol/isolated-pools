import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish } from "ethers";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ERC20Harness,
  MockFlashloanSimpleReceiver,
  MockFlashloanSimpleReceiver__factory,
  VTokenHarness,
} from "../../typechain";
import { VTokenTestFixture, preApprove, vTokenTestFixture } from "./util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const exchangeRate = parseUnits("50000", 18).toBigInt();
const mintAmount = parseUnits("10000", 18).toBigInt();
const flashloanAmount = parseUnits("200", 18).toBigInt();

async function preMint(
  contracts: VTokenTestFixture,
  minter: SignerWithAddress,
  mintAmount: BigNumberish,
  exchangeRate: BigNumberish,
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  await preApprove(underlying, vToken, minter, mintAmount, { faucet: true });

  comptroller.preMintHook.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const minterAddress = minter.address;
  await underlying.harnessSetFailTransferFromAddress(minterAddress, false);
  await vToken.harnessSetBalance(minterAddress, 0);
  await vToken.harnessSetExchangeRate(exchangeRate);
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
describe("Flashloan Simple", () => {
  let minter: SignerWithAddress;
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let contracts: VTokenTestFixture;
  let underlying: MockContract<ERC20Harness>;
  let vToken: VTokenHarness;
  let mockReceiverSimple: MockFlashloanSimpleReceiver;

  beforeEach(async () => {
    [admin, minter, alice] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ vToken, underlying } = contracts);
  });
  describe("Flashloan Single Asset", () => {
    beforeEach(async () => {
      // TODO: Initial Setup
      // 1. There should be underlying in the VToken in order to take flashloan (mint underlying supply)
      const MockFlashloanSimpleReceiver = await ethers.getContractFactory<MockFlashloanSimpleReceiver__factory>(
        "MockFlashloanSimpleReceiver",
      );
      mockReceiverSimple = await MockFlashloanSimpleReceiver.deploy(vToken.address);
      await mockReceiverSimple.deployed();
    });
    it("Should revert if the flashloan is not enabled", async () => {
      await expect(mockReceiverSimple.requestFlashloan(flashloanAmount)).to.be.revertedWithCustomError(
        vToken,
        "FlashLoanNotEnabled",
      );
    });

    it("Should be able to toggle flashloan feature", async () => {
      await vToken.connect(admin).toggleFlashloan();
      expect(await vToken.isFlashloanEnabled()).to.be.true;
    });

    it("Flashloan for single underlying", async () => {
      // Enable flashloan feature
      await vToken.connect(admin).toggleFlashloan();
      // Before mint state setup
      await preMint(contracts, minter, mintAmount, exchangeRate);
      // Now supplying underlying to vToken
      await quickMint(underlying, vToken, minter, mintAmount, {
        approve: true,
        exchangeRate: exchangeRate,
        faucet: false,
      });
      // Now alice will use the flashloan feature and should have underlying in receiver contract to pay for fee
      await underlying.harnessSetBalance(mockReceiverSimple.address, parseUnits("2", 18));
      const balanceBeforeAliceReceiver = await underlying.balanceOf(mockReceiverSimple.address);
      console.log(`Underlying Balance Alice's Receiver contract ${formatUnits(balanceBeforeAliceReceiver, "18")}`);
      let balanceBeforeVToken = await underlying.balanceOf(vToken.address);
      console.log(`Underlying Balance vToken Before Flashloan ${formatUnits(balanceBeforeVToken, "18")}`);
      expect(await mockReceiverSimple.VTOKEN()).to.be.equals(vToken.address);
      await mockReceiverSimple.connect(alice).requestFlashloan(flashloanAmount);
      balanceBeforeVToken = await underlying.balanceOf(vToken.address);
      console.log(`Underlying Balance vToken After Flashloan ${formatUnits(balanceBeforeVToken, "18")}`);
    });
  });
});

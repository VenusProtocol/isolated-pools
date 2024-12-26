import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  Comptroller,
  ERC20Harness,
  MockFlashloanSimpleReceiver,
  MockFlashloanSimpleReceiver__factory,
  VTokenHarness,
} from "../../../typechain";
import { initMainnetUser } from "../Fork/utils";
import { VTokenTestFixture, vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const flashloanAmount = parseUnits("2", 18).toBigInt();
const feeMantissa = parseUnits("0.01", 18);

describe.only("Flashloan Simple", () => {
  let minter: SignerWithAddress;
  let alice: SignerWithAddress;
  let receiver: SignerWithAddress;
  let acmUser: SignerWithAddress;
  let contracts: VTokenTestFixture;
  let underlying: MockContract<ERC20Harness>;
  let vToken: VTokenHarness;
  let mockReceiverSimple: MockFlashloanSimpleReceiver;
  let accessControlManager: FakeContract<AccessControlManager>;
  let comptroller: FakeContract<Comptroller>;
  let comptrollerSigner: SignerWithAddress;

  beforeEach(async () => {
    [minter, alice, acmUser, receiver] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ vToken, underlying, accessControlManager, comptroller } = contracts);
    comptrollerSigner = await initMainnetUser(comptroller.address, ethers.utils.parseUnits("2"));
  });

  describe("Enable/disable flash loan feature", () => {
    it("Should have access to toggle falsh loan feature", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      expect(await vToken.isFlashloanEnabled()).to.be.false;
      await expect(vToken.connect(acmUser).toggleFlashloan()).to.be.revertedWithCustomError(vToken, "Unauthorized");
      expect(await vToken.isFlashloanEnabled()).to.be.false;
    });

    it("Enable flashloan feature", async () => {
      accessControlManager.isAllowedToCall.returns(true);

      expect(await vToken.isFlashloanEnabled()).to.be.false;
      await vToken.connect(acmUser).toggleFlashloan();
      expect(await vToken.isFlashloanEnabled()).to.be.true;
    });

    it("Disable flashloan feature", async () => {
      expect(await vToken.isFlashloanEnabled()).to.be.false;
      await vToken.connect(acmUser).toggleFlashloan();
      expect(await vToken.isFlashloanEnabled()).to.be.true;

      await vToken.connect(acmUser).toggleFlashloan();
      expect(await vToken.isFlashloanEnabled()).to.be.false;
    });

    it("Emit ToggleFlashloanEnabled event on toggle flashloan feature", async () => {
      let result = await vToken.connect(acmUser).toggleFlashloan();
      await expect(result).to.emit(vToken, "ToggleFlashloanEnabled").withArgs(false, true);

      result = await vToken.connect(acmUser).toggleFlashloan();
      await expect(result).to.emit(vToken, "ToggleFlashloanEnabled").withArgs(true, false);
    });
  });

  describe("Set fee on flashloan", () => {
    it("Should have access to set fee on flashloan", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(vToken.connect(acmUser).setFlashloanFeeMantissa(feeMantissa)).to.be.revertedWithCustomError(
        vToken,
        "Unauthorized",
      );
    });

    it("Set fee on flashloan", async () => {
      accessControlManager.isAllowedToCall.returns(true);

      await vToken.connect(acmUser).setFlashloanFeeMantissa(feeMantissa);
      expect(await vToken.flashloanFeeMantissa()).to.be.equal(feeMantissa);
    });

    it("Emit FlashloanFeeUpdated event on set fee on flashloan", async () => {
      const result = await vToken.connect(acmUser).setFlashloanFeeMantissa(feeMantissa);
      await expect(result).to.emit(vToken, "FlashloanFeeUpdated").withArgs(0, feeMantissa);
    });
  });

  describe("Transfer underlying assets to receiver contract", () => {
    beforeEach(async () => {
      await underlying.harnessSetBalance(vToken.address, parseUnits("1", 18));
    });

    it("Revert if not comptroller", async () => {
      await expect(
        vToken.connect(acmUser).transferUnderlying(minter.address, parseUnits("1", 18)),
      ).to.be.revertedWithCustomError(vToken, "InvalidComptroller");
    });

    it("Only comptroller can transfer underlying assets to receiver contract", async () => {
      await vToken.connect(comptrollerSigner).transferUnderlying(minter.address, parseUnits("1", 18));
      expect(await underlying.balanceOf(minter.address)).to.be.equal(parseUnits("1", 18));
    });

    it("Emit TransferUnderlying event on transfer underlying assets to receiver contract", async () => {
      const result = await vToken.connect(comptrollerSigner).transferUnderlying(receiver.address, parseUnits("1", 18));
      await expect(result)
        .to.emit(vToken, "FlashloanAmountTransferred")
        .withArgs(underlying.address, receiver.address, parseUnits("1", 18));
    });
  });

  describe("Flashloan Single Asset", () => {
    beforeEach(async () => {
      const MockFlashloanSimpleReceiver = await ethers.getContractFactory<MockFlashloanSimpleReceiver__factory>(
        "MockFlashloanSimpleReceiver",
      );
      mockReceiverSimple = await MockFlashloanSimpleReceiver.deploy(vToken.address);
      await mockReceiverSimple.deployed();

      await vToken.connect(acmUser).setFlashloanFeeMantissa(feeMantissa);
      await underlying.harnessSetBalance(mockReceiverSimple.address, parseUnits("1", 18));
      await underlying.harnessSetBalance(vToken.address, parseUnits("10", 18));
    });

    it("Should revert if the flashloan is not enabled", async () => {
      await expect(mockReceiverSimple.requestFlashloan(flashloanAmount)).to.be.revertedWithCustomError(
        vToken,
        "FlashLoanNotEnabled",
      );
    });

    it("Flashloan for single underlying", async () => {
      await vToken.connect(acmUser).toggleFlashloan();

      const balanceBeforeflashLoan = await underlying.balanceOf(vToken.address);
      const flashloan = await mockReceiverSimple.connect(alice).requestFlashloan(flashloanAmount);
      const balanceAfterflashLoan = await underlying.balanceOf(vToken.address);

      const fee = BigNumber.from(flashloanAmount).mul(feeMantissa).div(parseUnits("1", 18));

      expect(balanceAfterflashLoan).to.be.equal(balanceBeforeflashLoan.add(fee));
      await expect(flashloan)
        .to.emit(vToken, "FlashloanExecuted")
        .withArgs(mockReceiverSimple.address, underlying.address, flashloanAmount);
    });
  });
});

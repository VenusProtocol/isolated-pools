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
  IProtocolShareReserve,
  MockFlashLoanSimpleReceiver,
  MockFlashLoanSimpleReceiver__factory,
  VTokenHarness,
} from "../../../typechain";
import { initMainnetUser } from "../Fork/utils";
import { VTokenTestFixture, vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const flashLoanAmount = parseUnits("2", 18).toBigInt();
const protocolFeeMantissa = parseUnits("0.01", 18);
const supplierFeeMantissa = parseUnits("0.01", 18);

describe("FlashLoan Simple", () => {
  let minter: SignerWithAddress;
  let alice: SignerWithAddress;
  let receiver: SignerWithAddress;
  let acmUser: SignerWithAddress;
  let contracts: VTokenTestFixture;
  let underlying: MockContract<ERC20Harness>;
  let vToken: VTokenHarness;
  let mockReceiverSimple: MockFlashLoanSimpleReceiver;
  let accessControlManager: FakeContract<AccessControlManager>;
  let comptroller: FakeContract<Comptroller>;
  let comptrollerSigner: SignerWithAddress;
  let protocolShareReserveMock: FakeContract<IProtocolShareReserve>;

  beforeEach(async () => {
    [minter, alice, acmUser, receiver] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ vToken, underlying, accessControlManager, comptroller } = contracts);
    comptrollerSigner = await initMainnetUser(comptroller.address, ethers.utils.parseUnits("2"));

    protocolShareReserveMock = await smock.fake<IProtocolShareReserve>(
      "contracts/InterfacesV8.sol:IProtocolShareReserve",
    );
    protocolShareReserveMock.updateAssetsState.returns(true);

    await vToken.setProtocolShareReserve(protocolShareReserveMock.address);
  });

  describe("Enable/disable flash loan feature", () => {
    it("Should have access to toggle flash loan feature", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      expect(await vToken.isFlashLoanEnabled()).to.be.false;
      await expect(vToken.connect(acmUser).toggleFlashLoan()).to.be.revertedWithCustomError(vToken, "Unauthorized");
      expect(await vToken.isFlashLoanEnabled()).to.be.false;
    });

    it("Enable flashLoan feature", async () => {
      accessControlManager.isAllowedToCall.returns(true);

      expect(await vToken.isFlashLoanEnabled()).to.be.false;
      await vToken.connect(acmUser).toggleFlashLoan();
      expect(await vToken.isFlashLoanEnabled()).to.be.true;
    });

    it("Disable flashLoan feature", async () => {
      expect(await vToken.isFlashLoanEnabled()).to.be.false;
      await vToken.connect(acmUser).toggleFlashLoan();
      expect(await vToken.isFlashLoanEnabled()).to.be.true;

      await vToken.connect(acmUser).toggleFlashLoan();
      expect(await vToken.isFlashLoanEnabled()).to.be.false;
    });

    it("Emit ToggleFlashLoanEnabled event on toggle flashLoan feature", async () => {
      let result = await vToken.connect(acmUser).toggleFlashLoan();
      await expect(result).to.emit(vToken, "ToggleFlashLoanEnabled").withArgs(false, true);

      result = await vToken.connect(acmUser).toggleFlashLoan();
      await expect(result).to.emit(vToken, "ToggleFlashLoanEnabled").withArgs(true, false);
    });
  });

  describe("Set fee on flashLoan", () => {
    it("Should have access to set fee on flashLoan", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(
        vToken.connect(acmUser).setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa),
      ).to.be.revertedWithCustomError(vToken, "Unauthorized");
    });

    it("Set fee on flashLoan", async () => {
      accessControlManager.isAllowedToCall.returns(true);

      await vToken.connect(acmUser).setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa);
      expect(await vToken.flashLoanProtocolFeeMantissa()).to.be.equal(protocolFeeMantissa);
      expect(await vToken.flashLoanSupplierFeeMantissa()).to.be.equal(supplierFeeMantissa);
    });

    it("Emit FlashLoanFeeUpdated event on set fee on flashLoan", async () => {
      const result = await vToken.connect(acmUser).setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa);
      await expect(result)
        .to.emit(vToken, "FlashLoanFeeUpdated")
        .withArgs(0, protocolFeeMantissa, 0, supplierFeeMantissa);
    });
  });

  describe("Transfer underlying assets to receiver contract", () => {
    beforeEach(async () => {
      await underlying.harnessSetBalance(vToken.address, parseUnits("1", 18));
    });

    it("Revert if not comptroller", async () => {
      await expect(
        vToken.connect(acmUser).transferOutUnderlying(minter.address, parseUnits("1", 18)),
      ).to.be.revertedWithCustomError(vToken, "InvalidComptroller");
    });

    it("Only comptroller can transfer underlying assets to receiver contract", async () => {
      await vToken.connect(comptrollerSigner).transferOutUnderlying(minter.address, parseUnits("1", 18));
      expect(await underlying.balanceOf(minter.address)).to.be.equal(parseUnits("1", 18));
    });

    it("Emit TransferUnderlying event on transfer underlying assets to receiver contract", async () => {
      const result = await vToken
        .connect(comptrollerSigner)
        .transferOutUnderlying(receiver.address, parseUnits("1", 18));
      await expect(result)
        .to.emit(vToken, "TransferOutUnderlying")
        .withArgs(underlying.address, receiver.address, parseUnits("1", 18));
    });
  });

  describe("FlashLoan Single Asset", () => {
    beforeEach(async () => {
      const MockFlashLoanSimpleReceiver = await ethers.getContractFactory<MockFlashLoanSimpleReceiver__factory>(
        "MockFlashLoanSimpleReceiver",
      );
      mockReceiverSimple = await MockFlashLoanSimpleReceiver.deploy(vToken.address);
      await mockReceiverSimple.deployed();

      await vToken.connect(acmUser).setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa);
      await underlying.harnessSetBalance(mockReceiverSimple.address, parseUnits("1", 18));
      await underlying.harnessSetBalance(vToken.address, parseUnits("10", 18));
    });

    it("Should revert if the flashLoan is not enabled", async () => {
      await expect(mockReceiverSimple.requestFlashLoan(flashLoanAmount, "0x")).to.be.revertedWithCustomError(
        vToken,
        "FlashLoanNotEnabled",
      );
    });

    it("FlashLoan for single underlying", async () => {
      await vToken.connect(acmUser).toggleFlashLoan();

      const vTokenBalanceBefore = await underlying.balanceOf(vToken.address);
      const psrBalanceBefore = await underlying.balanceOf(protocolShareReserveMock.address);

      const flashLoan = await mockReceiverSimple.connect(alice).requestFlashLoan(flashLoanAmount, "0x");

      const vTokenBalanceAfter = await underlying.balanceOf(vToken.address);
      const psrBalanceAfter = await underlying.balanceOf(protocolShareReserveMock.address);

      const protocolFee = BigNumber.from(flashLoanAmount).mul(protocolFeeMantissa).div(parseUnits("1", 18));
      const supplierFee = BigNumber.from(flashLoanAmount).mul(supplierFeeMantissa).div(parseUnits("1", 18));

      expect(vTokenBalanceAfter).to.be.equal(vTokenBalanceBefore.add(supplierFee));

      expect(psrBalanceAfter).to.equal(psrBalanceBefore.add(protocolFee));

      await expect(flashLoan)
        .to.emit(vToken, "FlashLoanExecuted")
        .withArgs(mockReceiverSimple.address, underlying.address, flashLoanAmount);

      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlying.address,
        2,
      );
    });
  });
});

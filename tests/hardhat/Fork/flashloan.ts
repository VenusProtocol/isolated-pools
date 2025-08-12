import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { getMaxBorrowRateMantissa } from "../../../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo } from "../../../helpers/deploymentUtils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  Comptroller,
  Comptroller__factory,
  ERC20,
  ERC20__factory,
  MockFlashLoanReceiver,
  MockFlashLoanReceiver__factory,
  UpgradeableBeacon__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";
const { ACC2, TOKEN1, TOKEN2, VTOKEN2, ACM, VTOKEN1, POOL_REGISTRY, COMPTROLLER, TOKEN1_HOLDER, BLOCK_NUMBER, ADMIN } =
  getContractAddresses(FORKED_NETWORK as string);

const blocksToMine: number = 30000;

const AddressZero = "0x0000000000000000000000000000000000000000";
const WETH_HOLDER = "0xd7512902999b34af2B2940Eb8827CC8345DC77C6";
const COMPTROLLER_BEACON = "0x12Dcb8D9F1eE7Ad7410F5B36B07bcC7891ab4cEf";
const VTOKEN_BEACON = "0x74ae9919F5866cE148c81331a5FCdE71b81c4056";
const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(network.name);
const MAX_BORROW_RATE_MANTISSA = getMaxBorrowRateMantissa(network.name);

const ARBFlashLoanProtocolFeeMantissa = parseUnits("0.01", 18);
const WETHFlashLoanProtocolFeeMantissa = parseUnits("0.03", 18);
const ARBFlashLoanSupplierFeeMantissa = parseUnits("0.01", 18);
const WETHFlashLoanSupplierFeeMantissa = parseUnits("0.03", 18);
const ARBFlashLoanAmount = parseUnits("50", 18);
const WETHFlashLoanAmount = parseUnits("20", 18);

// Giving permission to Timelock to call chainlink setDirectPrice and setTokenConfig
async function grantPermissions() {
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vARB.address, "toggleFlashLoan()", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vARB.address, "setFlashLoanFeeMantissa(uint256, uint256)", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vWETH.address, "toggleFlashLoan()", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vWETH.address, "setFlashLoanFeeMantissa(uint256, uint256)", ADMIN);
  await tx.wait();
}

let impersonatedTimelock: SignerWithAddress;
let john: SignerWithAddress;
let comptroller: Comptroller;
let arbHolder: SignerWithAddress;
let wETHHolder: SignerWithAddress;
let accessControlManager: AccessControlManager;
let ARB: ERC20;
let WETH: ERC20;
let vARB: VToken;
let vWETH: VToken;
let mockFlashLoanReceiver: MockFlashLoanReceiver;

async function setup() {
  await setForkBlock(BLOCK_NUMBER);

  impersonatedTimelock = await initMainnetUser(ADMIN, parseUnits("2"));
  john = await initMainnetUser(ACC2, parseUnits("2"));
  arbHolder = await initMainnetUser(TOKEN1_HOLDER, parseUnits("2"));
  wETHHolder = await initMainnetUser(WETH_HOLDER, parseUnits("2"));
  ARB = ERC20__factory.connect(TOKEN2, impersonatedTimelock);
  WETH = ERC20__factory.connect(TOKEN1, impersonatedTimelock);
  vARB = VToken__factory.connect(VTOKEN2, impersonatedTimelock);
  vWETH = VToken__factory.connect(VTOKEN1, impersonatedTimelock);
  comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);

  // Deploy the comptroller and VToken
  const Comptroller = await ethers.getContractFactory("Comptroller", impersonatedTimelock);
  const upgradeComptrollerImpl = await Comptroller.deploy(POOL_REGISTRY);
  await upgradeComptrollerImpl.deployed();

  const VToken = await ethers.getContractFactory("VToken", impersonatedTimelock);
  const upgradeVTokenImpl = await VToken.deploy(isTimeBased, blocksPerYear, MAX_BORROW_RATE_MANTISSA);
  await upgradeVTokenImpl.deployed();

  // Upgrade the comptroller implementation
  const comptrollerBeacon = UpgradeableBeacon__factory.connect(COMPTROLLER_BEACON, impersonatedTimelock);
  const vTokenBeacon = UpgradeableBeacon__factory.connect(VTOKEN_BEACON, impersonatedTimelock);

  await comptrollerBeacon.connect(impersonatedTimelock).upgradeTo(upgradeComptrollerImpl.address);
  await vTokenBeacon.connect(impersonatedTimelock).upgradeTo(upgradeVTokenImpl.address);

  expect(await comptrollerBeacon.implementation()).to.be.equal(upgradeComptrollerImpl.address);
  expect(await vTokenBeacon.implementation()).to.be.equal(upgradeVTokenImpl.address);

  await grantPermissions();
}

if (FORK) {
  describe("FlashLoan Fork Test", async () => {
    beforeEach(async () => {
      // Run the setup function before each test to initialize the environment
      await setup();

      // Deploy a mock flashLoan receiver contract to simulate flashLoan interactions in tests
      const MockFlashLoanReceiver = await ethers.getContractFactory<MockFlashLoanReceiver__factory>(
        "MockFlashLoanReceiver",
      );
      mockFlashLoanReceiver = await MockFlashLoanReceiver.deploy(comptroller.address);
    });

    it("Should revert if flashLoan not enabled", async () => {
      // Attempt to execute a flashLoan when the flashLoan feature is disabled, which should revert
      await expect(
        comptroller
          .connect(john)
          .executeFlashLoan(
            mockFlashLoanReceiver.address,
            [vARB.address, vWETH.address],
            [ARBFlashLoanAmount, WETHFlashLoanAmount],
          ),
      ).to.be.revertedWithCustomError(vARB, "FlashLoanNotEnabled");
    });

    it("Should revert if asset and amount arrays are mismatched", async () => {
      // Attempt to execute a flashLoan with mismatched arrays for assets and amounts, which should revert
      await expect(
        comptroller.connect(john).executeFlashLoan(
          mockFlashLoanReceiver.address,
          [vARB.address], // Only one asset provided
          [ARBFlashLoanAmount, WETHFlashLoanAmount], // Two loan amounts provided
        ),
      ).to.be.revertedWithCustomError(comptroller, "InvalidFlashLoanParams");
    });

    it("Should revert if receiver is zero address", async () => {
      // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
      await expect(
        comptroller.connect(john).executeFlashLoan(
          mockFlashLoanReceiver.address,
          [AddressZero], // Zero address as an asset, which is invalid
          [ARBFlashLoanAmount, WETHFlashLoanAmount],
        ),
      ).to.be.revertedWithCustomError(comptroller, "InvalidFlashLoanParams");
    });

    it("Should be able to do flashLoan for ARB & WETH", async () => {
      // Transfer ARB and WETH tokens to Alice to set up initial balances
      await ARB.connect(arbHolder).transfer(vARB.address, parseUnits("100", 18));
      await ARB.connect(arbHolder).transfer(mockFlashLoanReceiver.address, parseUnits("10", 18));
      await WETH.connect(wETHHolder).transfer(vWETH.address, parseUnits("50", 18));
      await WETH.connect(wETHHolder).transfer(mockFlashLoanReceiver.address, parseUnits("5", 18));

      // Mine blocks as required by the test setup
      await mine(blocksToMine);

      const balanceBeforeARB = await ARB.balanceOf(vARB.address);
      const balanceBeforeWETH = await WETH.balanceOf(vWETH.address);

      // Enable the flashLoan and set fee mantissa on vARB and vWETH contracts
      await vARB.connect(impersonatedTimelock).toggleFlashLoan();
      await vWETH.connect(impersonatedTimelock).toggleFlashLoan();

      await vARB
        .connect(impersonatedTimelock)
        .setFlashLoanFeeMantissa(ARBFlashLoanProtocolFeeMantissa, ARBFlashLoanSupplierFeeMantissa);
      await vWETH
        .connect(impersonatedTimelock)
        .setFlashLoanFeeMantissa(WETHFlashLoanProtocolFeeMantissa, WETHFlashLoanSupplierFeeMantissa);

      // John initiates a flashLoan of ARB and WETH through the comptroller contract
      await comptroller
        .connect(john)
        .executeFlashLoan(
          mockFlashLoanReceiver.address,
          [vARB.address, vWETH.address],
          [ARBFlashLoanAmount, WETHFlashLoanAmount],
        );

      // Record ARB and WETH balances in vARB and vWETH contracts after flashLoan
      const balanceAfterARB = await ARB.balanceOf(vARB.address);
      const balanceAfterWETH = await WETH.balanceOf(vWETH.address);

      const ARBFlashLoanFee = ARBFlashLoanAmount.mul(
        ARBFlashLoanProtocolFeeMantissa.add(ARBFlashLoanSupplierFeeMantissa),
      ).div(parseUnits("1", 18));
      const WETHFlashLoanFee = WETHFlashLoanAmount.mul(
        WETHFlashLoanProtocolFeeMantissa.add(WETHFlashLoanSupplierFeeMantissa),
      ).div(parseUnits("1", 18));

      // Validate that ARB and WETH balances in the contracts increased, confirming repayment plus fees
      expect(balanceAfterARB).to.be.equal(balanceBeforeARB.add(ARBFlashLoanFee));
      expect(balanceAfterWETH).to.be.equal(balanceBeforeWETH.add(WETHFlashLoanFee));
    });
  });
}

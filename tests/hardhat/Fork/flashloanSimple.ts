import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { getMaxBorrowRateMantissa } from "../../../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo } from "../../../helpers/deploymentUtils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  IERC20,
  IERC20__factory,
  MockFlashloanSimpleReceiver,
  MockFlashloanSimpleReceiver__factory,
  UpgradeableBeacon__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const blocksToMine: number = 30000;

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

let john: SignerWithAddress;
let impersonatedTimelock: SignerWithAddress;
let ARB: IERC20;
let vARB: VToken;
let accessControlManager: AccessControlManager;
let arbHolder: SignerWithAddress;
let mockReceiverSimpleFlashloan: MockFlashloanSimpleReceiver;

const AddressZero = "0x0000000000000000000000000000000000000000";
const VTOKEN_BEACON_ARB = "0x74ae9919F5866cE148c81331a5FCdE71b81c4056";
const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(network.name);
const MAX_BORROW_RATE_MANTISSA = getMaxBorrowRateMantissa(network.name);

const { VTOKEN2, ACM, ACC1, TOKEN2, ADMIN, BLOCK_NUMBER, TOKEN1_HOLDER } = getContractAddresses(
  FORKED_NETWORK as string,
);

const flashloanFeeMantissa = parseUnits("0.01", 18);
const flashloanAmount = parseUnits("100", 18);

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

// Giving permission to Timelock to interact with the contracts
async function grantPermissions() {
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vARB.address, "toggleFlashloan()", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vARB.address, "setFlashloanFeeMantissa(uint256)", ADMIN);
  await tx.wait();
}

if (FORK) {
  describe("Flashloan Fork Test", async () => {
    async function setup() {
      // Set the forked blockchain to a specific block number to create a consistent testing environment
      await setForkBlock(BLOCK_NUMBER);

      // Configure the timelock address, typically the admin account, by funding it with tokens
      await configureTimelock();

      john = await initMainnetUser(ACC1, parseUnits("2", 18));
      arbHolder = await initMainnetUser(TOKEN1_HOLDER, parseUnits("2", 18));

      ARB = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      vARB = VToken__factory.connect(VTOKEN2, impersonatedTimelock);

      // Deploy a new VToken implementation to upgrade the current VToken contract
      const VTOKEN_IMPL = await ethers.getContractFactory("VToken", impersonatedTimelock);
      const upgradeImpl = await VTOKEN_IMPL.deploy(isTimeBased, blocksPerYear, MAX_BORROW_RATE_MANTISSA);
      await upgradeImpl.deployed();

      // Connect to the upgradeable beacon managing VToken implementations for ARB and upgrade it
      const beaconVToken = UpgradeableBeacon__factory.connect(VTOKEN_BEACON_ARB, impersonatedTimelock);
      await beaconVToken.connect(impersonatedTimelock).upgradeTo(upgradeImpl.address);

      expect(await beaconVToken.callStatic.implementation()).to.be.equal(upgradeImpl.address);

      // Grant necessary permissions to users or contracts
      await grantPermissions();
    }

    beforeEach(async () => {
      // Run setup before each test to reset the environment
      await setup();

      // Deploy a mock flashloan receiver to test flashloan functionality
      const MockFlashloanSimpleReceiver = await ethers.getContractFactory<MockFlashloanSimpleReceiver__factory>(
        "MockFlashloanSimpleReceiver",
      );
      mockReceiverSimpleFlashloan = await MockFlashloanSimpleReceiver.deploy(vARB.address);
    });

    it("Should revert if flashloan not enabled", async () => {
      // Attempt to take a flashloan when the flashloan feature is disabled should fail
      await expect(
        vARB.connect(john).executeFlashloan(mockReceiverSimpleFlashloan.address, flashloanAmount),
      ).to.be.revertedWithCustomError(vARB, "FlashLoanNotEnabled");
    });

    it("Should revert if receiver is zero address", async () => {
      // Enable flashloan feature for testing
      await vARB.connect(impersonatedTimelock).toggleFlashloan();

      // Attempt to take a flashloan with zero address as receiver should fail
      await expect(vARB.connect(john).executeFlashloan(AddressZero, flashloanAmount)).to.be.revertedWithCustomError(
        vARB,
        "ZeroAddressNotAllowed",
      );
    });

    it("Should flashloan ARB", async () => {
      // Transfer ARB tokens to test users for setting up the flashloan test
      await ARB.connect(arbHolder).transfer(vARB.address, parseUnits("1000", 18));
      await ARB.connect(arbHolder).transfer(mockReceiverSimpleFlashloan.address, parseUnits("50", 18));

      // Record vARB contract's ARB balance before flashloan
      const balanceBefore = await ARB.balanceOf(vARB.address);

      // Mine blocks if necessary for time-based operations
      await mine(blocksToMine);

      // Enable flashloan feature by the admin
      await vARB.connect(impersonatedTimelock).toggleFlashloan();
      await vARB.connect(impersonatedTimelock).setFlashloanFeeMantissa(flashloanFeeMantissa);

      // John initiates a flashloan of 2000 ARB through the mock receiver
      await vARB.connect(john).executeFlashloan(mockReceiverSimpleFlashloan.address, parseUnits("100", 18));

      // Check if the ARB balance in vARB increased, validating flashloan repayment with fees
      const balanceAfter = await ARB.balanceOf(vARB.address);
      const totalFlashloanFee = flashloanAmount.mul(flashloanFeeMantissa).div(parseUnits("1", 18));

      expect(balanceAfter).to.be.equal(balanceBefore.add(totalFlashloanFee));
    });
  });
}

import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ERC20,
  IComptroller,
  IProtocolShareReserve,
  IRewardsDistributor,
  MockVenusERC4626,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626", function () {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let venusERC4626: MockVenusERC4626;
  let asset: FakeContract<ERC20>;
  let xvs: FakeContract<ERC20>;
  let vToken: FakeContract<VToken>;
  let comptroller: FakeContract<IComptroller>;
  let rewardDistributor: FakeContract<IRewardsDistributor>;
  let rewardRecipient: string;
  let rewardRecipientPSR: FakeContract<IProtocolShareReserve>;

  beforeEach(async function () {
    [deployer, user] = await ethers.getSigners();

    // Create Smock Fake Contracts
    asset = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    xvs = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake<VToken>("VToken");
    comptroller = await smock.fake<IComptroller>("contracts/ERC4626/Interfaces/IComptroller.sol:IComptroller");
    rewardDistributor = await smock.fake<IRewardsDistributor>("IRewardsDistributor");

    rewardRecipient = deployer.address;

    rewardRecipientPSR = await smock.fake<IProtocolShareReserve>(
      "contracts/ERC4626/Interfaces/IProtocolShareReserve.sol:IProtocolShareReserve",
    );

    vToken.underlying.returns(asset.address);
    vToken.comptroller.returns(comptroller.address);

    // Deploy MockVenusERC4626 contract
    const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");
    venusERC4626 = await VenusERC4626Factory.deploy();
    await venusERC4626.initialize(vToken.address, rewardRecipient, 100); // Initialize with loopsLimit = 100

    await venusERC4626.deployed();
  });

  it("should deploy the VenusERC4626 contract", async function () {
    expect(venusERC4626.address).to.not.equal(ethers.constants.AddressZero);
    expect(await venusERC4626.asset()).to.equal(asset.address);
    expect(await venusERC4626.vToken()).to.equal(vToken.address);
    expect(await venusERC4626.comptroller()).to.equal(comptroller.address);
    expect(await venusERC4626.rewardRecipient()).to.equal(rewardRecipient);
  });

  it("should deposit assets into the vault", async function () {
    const depositAmount = ethers.utils.parseUnits("10", 18);
    const decimalsOffset = await venusERC4626.getDecimalsOffset();
    const expectedDepositAmount = depositAmount.mul(ethers.BigNumber.from(10).pow(decimalsOffset));

    // Mock the asset transfer
    asset.transferFrom.returns(true);
    asset.approve.returns(true);
    // Mock the vToken mint
    vToken.mint.returns(0); // NO_ERROR

    await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));

    // Deposit assets
    await expect(venusERC4626.connect(user).deposit(depositAmount, user.address))
      .to.emit(venusERC4626, "Deposit")
      .withArgs(user.address, user.address, depositAmount, expectedDepositAmount);

    // Verify the vToken mint was called
    expect(vToken.mint).to.have.been.calledWith(depositAmount);
  });

  it("should withdraw assets from the vault", async function () {
    const depositAmount = ethers.utils.parseEther("10");
    const withdrawAmount = ethers.utils.parseEther("5");

    const decimalsOffset = await venusERC4626.getDecimalsOffset();
    const expectedWithdrawAmount = withdrawAmount.mul(ethers.BigNumber.from(10).pow(decimalsOffset));

    asset.transferFrom.returns(true);
    asset.approve.returns(true);
    vToken.mint.returns(0);
    vToken.redeemUnderlying.returns(0);
    asset.transfer.returns(true);

    await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
    await venusERC4626.connect(user).deposit(depositAmount, user.address);
    await venusERC4626.setTotalAssets(depositAmount);

    await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("15"));
    await expect(venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address))
      .to.emit(venusERC4626, "Withdraw")
      .withArgs(user.address, user.address, user.address, withdrawAmount, expectedWithdrawAmount);

    expect(vToken.redeemUnderlying).to.have.been.calledWith(withdrawAmount);
  });

  it("should claim rewards when rewardRecipient is an EOA", async function () {
    comptroller.getRewardDistributors.returns([rewardDistributor.address]);

    const rewardAmount = ethers.utils.parseEther("10");
    rewardDistributor.rewardToken.returns(xvs.address);

    rewardDistributor.claimRewardToken.whenCalledWith(venusERC4626.address, [vToken.address]).returns(undefined);

    // Ensure balance reflects claimed rewards AFTER claiming
    xvs.balanceOf.whenCalledWith(venusERC4626.address).returns(rewardAmount);
    xvs.transfer.returns(true);

    await expect(venusERC4626.connect(user).claimRewards())
      .to.emit(venusERC4626, "ClaimRewards")
      .withArgs(rewardAmount);

    expect(rewardDistributor.claimRewardToken).to.have.been.calledWith(venusERC4626.address, [vToken.address]);

    expect(xvs.transfer).to.have.been.calledWith(rewardRecipient, rewardAmount);
  });

  it("should claim rewards and call updateAssetsState when rewardRecipient is a PSR contract", async () => {
    // Redeploy contract with PSR as rewardRecipient
    const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");
    venusERC4626 = await VenusERC4626Factory.deploy();
    await venusERC4626.initialize(vToken.address, rewardRecipientPSR.address, 10); // Initialize with loopsLimit = 10
    await venusERC4626.deployed();

    comptroller.getRewardDistributors.returns([rewardDistributor.address]);

    const rewardAmount = ethers.utils.parseEther("10");
    rewardDistributor.rewardToken.returns(xvs.address);

    // Ensure the balance reflects the claimed rewards
    xvs.balanceOf.whenCalledWith(venusERC4626.address).returns(rewardAmount);
    xvs.transfer.returns(true);

    await expect(venusERC4626.connect(user).claimRewards())
      .to.emit(venusERC4626, "ClaimRewards")
      .withArgs(rewardAmount);

    expect(rewardDistributor.claimRewardToken).to.have.been.calledWith(venusERC4626.address, [vToken.address]);

    expect(rewardRecipientPSR.updateAssetsState).to.have.been.calledWith(comptroller.address, xvs.address, 2);
  });

  it("should revert if vToken mint fails", async function () {
    const depositAmount = ethers.utils.parseEther("100");

    // Mock the asset transfer
    asset.transferFrom.returns(true);
    asset.approve.returns(true);

    // Mock the vToken mint to fail
    vToken.mint.returns(1); // Error code 1

    // Attempt to deposit and expect a revert
    await venusERC4626.setMaxDeposit(ethers.utils.parseEther("100"));
    await expect(venusERC4626.connect(user).deposit(depositAmount, user.address)).to.be.revertedWithCustomError(
      venusERC4626,
      "VenusERC4626__VenusError",
    );
  });

  it("should revert if vToken redeemUnderlying fails", async function () {
    const withdrawAmount = ethers.utils.parseEther("50");

    // Mock the vToken redeemUnderlying to fail
    vToken.redeemUnderlying.returns(1); // Error code 1

    await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("50"));
    // Attempt to withdraw and expect a revert
    await expect(
      venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address),
    ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
  });

  it("should fail deposit with no approval", async function () {
    await expect(venusERC4626.connect(user).deposit(ethers.utils.parseEther("1"), user.address)).to.be.reverted;
  });

  it("should fail deposit with insufficient balance", async function () {
    asset.transferFrom.returns(false);
    await expect(venusERC4626.connect(user).deposit(ethers.utils.parseEther("1000"), user.address)).to.be.reverted;
  });

  it("should fail withdraw with no balance", async function () {
    await expect(venusERC4626.connect(user).withdraw(ethers.utils.parseEther("1"), user.address, user.address)).to.be
      .reverted;
  });

  it("should fail redeem with no balance", async function () {
    await expect(venusERC4626.connect(user).redeem(ethers.utils.parseEther("1"), user.address, user.address)).to.be
      .reverted;
  });

  it("should fail deposit zero", async function () {
    await expect(venusERC4626.connect(user).deposit(0, user.address)).to.be.reverted;
  });

  it("should fail mint zero", async function () {
    await expect(venusERC4626.connect(user).mint(0, user.address)).to.be.reverted;
  });

  it("should fail withdraw zero", async function () {
    await expect(venusERC4626.connect(user).withdraw(0, user.address, user.address)).to.be.reverted;
  });

  it("should fail redeem zero", async function () {
    await expect(venusERC4626.connect(user).redeem(0, user.address, user.address)).to.be.reverted;
  });
});

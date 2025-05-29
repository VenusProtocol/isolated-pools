import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  ERC20,
  IComptroller,
  IProtocolShareReserve,
  IRewardsDistributor,
  MockVenusERC4626,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626", () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let vaultOwner: SignerWithAddress;
  let venusERC4626: MockVenusERC4626;
  let asset: FakeContract<ERC20>;
  let xvs: FakeContract<ERC20>;
  let vToken: FakeContract<VToken>;
  let comptroller: FakeContract<IComptroller>;
  let accessControlManager: FakeContract<AccessControlManager>;
  let rewardDistributor: FakeContract<IRewardsDistributor>;
  let rewardRecipient: string;
  let rewardRecipientPSR: FakeContract<IProtocolShareReserve>;

  beforeEach(async () => {
    [deployer, user, vaultOwner] = await ethers.getSigners();

    // Create Smock Fake Contracts
    asset = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    xvs = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake<VToken>("VToken");
    comptroller = await smock.fake<IComptroller>("contracts/ERC4626/Interfaces/IComptroller.sol:IComptroller");
    accessControlManager = await smock.fake("AccessControlManager");
    rewardDistributor = await smock.fake<IRewardsDistributor>("IRewardsDistributor");
    rewardRecipient = deployer.address;
    rewardRecipientPSR = await smock.fake<IProtocolShareReserve>(
      "contracts/ERC4626/Interfaces/IProtocolShareReserve.sol:IProtocolShareReserve",
    );

    // Configure mock behaviors
    accessControlManager.isAllowedToCall.returns(true);
    vToken.underlying.returns(asset.address);
    vToken.comptroller.returns(comptroller.address);

    // Deploy and initialize MockVenusERC4626
    const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");

    venusERC4626 = await upgrades.deployProxy(VenusERC4626Factory, [vToken.address], {
      initializer: "initialize",
    });
    await venusERC4626.initialize2(accessControlManager.address, rewardRecipient, 100, vaultOwner.address);
  });

  describe("Initialization", () => {
    it("should deploy with correct parameters", async () => {
      expect(venusERC4626.address).to.not.equal(ethers.constants.AddressZero);
      expect(await venusERC4626.asset()).to.equal(asset.address);
      expect(await venusERC4626.vToken()).to.equal(vToken.address);
      expect(await venusERC4626.comptroller()).to.equal(comptroller.address);
      expect(await venusERC4626.rewardRecipient()).to.equal(rewardRecipient);
      expect(await venusERC4626.accessControlManager()).to.equal(accessControlManager.address);
      expect(await venusERC4626.owner()).to.equal(vaultOwner.address);
    });
  });

  describe("Access Control", () => {
    it("should allow authorized accounts to update reward recipient", async () => {
      const newRecipient = ethers.Wallet.createRandom().address;
      await expect(venusERC4626.setRewardRecipient(newRecipient))
        .to.emit(venusERC4626, "RewardRecipientUpdated")
        .withArgs(rewardRecipient, newRecipient);
    });

    it("should allow authorized accounts to update maxLoopsLimit", async () => {
      const maxLoopsLimit = await venusERC4626.maxLoopsLimit();
      const newMaxLoopLimit = maxLoopsLimit.add(10);
      await expect(venusERC4626.setMaxLoopsLimit(newMaxLoopLimit))
        .to.emit(venusERC4626, "MaxLoopsLimitUpdated")
        .withArgs(maxLoopsLimit, newMaxLoopLimit);
    });
  });

  describe("Mint Operations", () => {
    const mintShares = ethers.utils.parseUnits("10", 18);
    let expectedAssets: ethers.BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      vToken.mint.returns(0); // NO_ERROR
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      await venusERC4626.setMaxDeposit(ethers.utils.parseUnits("100", 18)); // Sets max assets
      await venusERC4626.setMaxMint(ethers.utils.parseUnits("100", 18)); // Sets max shares
      await venusERC4626.setTotalSupply(ethers.utils.parseUnits("100", 18)); // sets total supply
      await venusERC4626.setTotalAssets(ethers.utils.parseUnits("100", 18)); // sets total assets

      expectedAssets = await venusERC4626.previewMint(mintShares);

      asset.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      asset.balanceOf.returnsAtCall(1, expectedAssets);

      vToken.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      vToken.balanceOf.returnsAtCall(1, expectedAssets);
    });

    it("should mint shares successfully with proper vToken accounting", async () => {
      const tx = await venusERC4626.connect(user).mint(mintShares, user.address);

      const receipt = await tx.wait();
      const depositEvent = receipt.events?.find(e => e.event === "Deposit");
      const [actualCaller, actualReceiver, actualAssets, actualShares] = depositEvent?.args || [];

      expect(actualCaller).to.equal(user.address);
      expect(actualReceiver).to.equal(user.address);
      expect(actualAssets).to.be.gte(expectedAssets);
      expect(actualShares).to.be.gte(mintShares);

      expect(vToken.mint).to.have.been.calledWith(actualAssets);

      expect(await venusERC4626.balanceOf(user.address)).to.equal(actualShares);
    });

    it("should return correct assets amount", async () => {
      const returnedAssets = await venusERC4626.connect(user).callStatic.mint(mintShares, user.address);
      expect(returnedAssets).to.equal(expectedAssets);
    });

    it("should revert if vToken mint fails", async () => {
      vToken.mint.returns(1); // Error code 1
      await expect(venusERC4626.connect(user).mint(mintShares, user.address)).to.be.revertedWithCustomError(
        venusERC4626,
        "VenusERC4626__VenusError",
      );
    });

    it("should fail mint with no approval", async () => {
      asset.transferFrom.returns(false);
      await expect(venusERC4626.connect(user).mint(mintShares, user.address)).to.be.reverted;
    });

    it("should fail mint zero shares", async () => {
      await expect(venusERC4626.connect(user).mint(0, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("mint");
    });
  });

  describe("Deposit Operations", () => {
    const depositAmount = ethers.utils.parseUnits("10", 18);
    let expectedShares: ethers.BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);

      asset.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      asset.balanceOf.returnsAtCall(1, depositAmount);

      vToken.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      vToken.balanceOf.returnsAtCall(1, depositAmount);

      vToken.mint.returns(0); // NO_ERROR
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("100")); // sets max deposit allowed
      await venusERC4626.setTotalSupply(ethers.utils.parseUnits("100", 18)); // sets total supply
      await venusERC4626.setTotalAssets(ethers.utils.parseUnits("100", 18)); // sets total assets
    });

    it("should deposit assets successfully", async () => {
      // Calculate shares using previewDeposit
      expectedShares = await venusERC4626.previewDeposit(depositAmount);

      const tx = await venusERC4626.connect(user).deposit(depositAmount, user.address);

      const receipt = await tx.wait();
      const depositEvent = receipt.events?.find(e => e.event === "Deposit");
      const [actualCaller, actualReceiver, actualAssets, actualShares] = depositEvent?.args || [];

      expect(actualCaller).to.equal(user.address);
      expect(actualReceiver).to.equal(user.address);
      expect(actualAssets).to.equal(depositAmount);
      expect(actualShares).to.be.gte(expectedShares);

      expect(vToken.mint).to.have.been.calledWith(depositAmount);
      expect(await venusERC4626.balanceOf(user.address)).to.be.gte(expectedShares);
    });

    it("should revert if vToken mint fails", async () => {
      vToken.mint.returns(1); // Error code 1
      await expect(
        venusERC4626.connect(user).deposit(ethers.utils.parseEther("50"), user.address),
      ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
    });

    it("should fail deposit with no approval", async () => {
      asset.transferFrom.returns(false);
      await expect(venusERC4626.connect(user).deposit(ethers.utils.parseEther("1"), user.address)).to.be.reverted;
    });

    it("should fail deposit zero amount", async () => {
      await expect(venusERC4626.connect(user).deposit(0, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("deposit");
    });
  });

  describe("Withdraw Operations", () => {
    const depositAmount = ethers.utils.parseEther("10");
    const withdrawAmount = ethers.utils.parseEther("5");
    let expectedShares: BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      asset.transfer.returns(true);

      vToken.mint.returns(0); // NO_ERROR
      vToken.redeemUnderlying.returns(0);
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      asset.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      asset.balanceOf.returnsAtCall(1, depositAmount);
      asset.balanceOf.returnsAtCall(2, ethers.utils.parseUnits("110", 18));
      asset.balanceOf.returnsAtCall(3, ethers.utils.parseUnits("110", 18).add(withdrawAmount));

      vToken.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      vToken.balanceOf.returnsAtCall(1, depositAmount);
      vToken.balanceOf.returnsAtCall(2, ethers.utils.parseUnits("110", 18));
      vToken.balanceOf.returnsAtCall(3, ethers.utils.parseUnits("105", 18));

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
      await venusERC4626.setTotalSupply(ethers.utils.parseUnits("100", 18)); // sets total supply
      await venusERC4626.setTotalAssets(ethers.utils.parseUnits("100", 18)); // sets total assets
      await venusERC4626.connect(user).deposit(depositAmount, user.address);
      await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("15"));
      await venusERC4626.setTotalAssets(ethers.utils.parseUnits("110", 18)); // sets total assets
    });

    it("should withdraw assets successfully", async () => {
      expectedShares = await venusERC4626.previewWithdraw(withdrawAmount);

      const tx = await venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address);

      const receipt = await tx.wait();
      const withdrawEvent = receipt.events?.find(e => e.event === "Withdraw");
      const [actualCaller, actualReceiver, actualOwner, actualAssets, actualShares] = withdrawEvent?.args || [];

      expect(actualCaller).to.equal(user.address);
      expect(actualReceiver).to.equal(user.address);
      expect(actualOwner).to.equal(user.address);
      expect(actualAssets).to.gte(withdrawAmount);
      expect(expectedShares).to.be.lte(actualShares);

      expect(vToken.redeemUnderlying).to.have.been.calledWith(withdrawAmount);
    });

    it("should revert if vToken redeemUnderlying fails", async () => {
      vToken.redeemUnderlying.returns(1); // Error code 1
      await expect(
        venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address),
      ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
    });

    it("should fail withdraw with no balance", async () => {
      await venusERC4626.setTotalAssets(0);
      await venusERC4626.setTotalSupply(0);
      await expect(venusERC4626.connect(user).withdraw(ethers.utils.parseEther("1"), user.address, user.address)).to.be
        .reverted;
    });

    it("should fail withdraw zero amount", async () => {
      await expect(venusERC4626.connect(user).withdraw(0, user.address, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("withdraw");
    });
  });

  describe("Redeem Operations", () => {
    const depositAmount = ethers.utils.parseEther("10");
    const redeemShares = ethers.utils.parseEther("5");
    let expectedRedeemAssets: ethers.BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      asset.transfer.returns(true);

      vToken.mint.returns(0); // NO_ERROR
      vToken.redeem.returns(0);
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      asset.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      asset.balanceOf.returnsAtCall(1, depositAmount);
      asset.balanceOf.returnsAtCall(2, ethers.utils.parseUnits("110", 18));
      asset.balanceOf.returnsAtCall(3, ethers.utils.parseUnits("110", 18).add(redeemShares));

      vToken.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      vToken.balanceOf.returnsAtCall(1, depositAmount);
      vToken.balanceOf.returnsAtCall(3, ethers.utils.parseUnits("110", 18));

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
      await venusERC4626.setMaxRedeem(ethers.utils.parseEther("50"));
      await venusERC4626.setTotalSupply(ethers.utils.parseUnits("100", 18)); // sets total supply
      await venusERC4626.setTotalAssets(ethers.utils.parseUnits("100", 18)); // sets total assets
      await venusERC4626.connect(user).deposit(depositAmount, user.address);
      await venusERC4626.setTotalAssets(ethers.utils.parseUnits("110", 18)); // sets total assets

      expectedRedeemAssets = await venusERC4626.previewRedeem(redeemShares);
    });

    it("should redeem shares successfully", async () => {
      const tx = await venusERC4626.connect(user).redeem(redeemShares, user.address, user.address);

      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "Withdraw");
      const [actualCaller, actualReceiver, actualOwner, actualAssets, actualShares] = event?.args || [];

      expect(actualCaller).to.equal(user.address);
      expect(actualReceiver).to.equal(user.address);
      expect(actualOwner).to.equal(user.address);

      expect(actualAssets).to.be.gte(expectedRedeemAssets);
      expect(actualShares).to.be.gte(redeemShares);
    });

    it("should return correct assets amount", async () => {
      const returnedAssets = await venusERC4626
        .connect(user)
        .callStatic.redeem(redeemShares, user.address, user.address);

      expect(returnedAssets).to.be.gte(expectedRedeemAssets);
    });

    it("should revert if vToken redeem fails", async () => {
      vToken.redeem.returns(1); // Error code 1
      await expect(
        venusERC4626.connect(user).redeem(redeemShares, user.address, user.address),
      ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
    });

    it("should fail redeem zero shares", async () => {
      await expect(venusERC4626.connect(user).redeem(0, user.address, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("redeem");
    });
  });

  describe("Reward Distribution", () => {
    const rewardAmount = ethers.utils.parseEther("10");

    beforeEach(async () => {
      comptroller.getRewardDistributors.returns([rewardDistributor.address]);
      rewardDistributor.rewardToken.returns(xvs.address);
      xvs.balanceOf.whenCalledWith(venusERC4626.address).returns(rewardAmount);
    });

    describe("When rewardRecipient is EOA", () => {
      it("should revert the transaction", async () => {
        xvs.transfer.returns(true);

        await expect(venusERC4626.connect(user).claimRewards()).to.be.reverted;
      });
    });

    describe("When rewardRecipient is ProtocolShareReserve", () => {
      beforeEach(async () => {
        // Redeploy with PSR as rewardRecipient
        const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");
        venusERC4626 = await upgrades.deployProxy(VenusERC4626Factory, [vToken.address], {
          initializer: "initialize",
        });
        await venusERC4626.initialize2(
          accessControlManager.address,
          rewardRecipientPSR.address,
          100,
          vaultOwner.address,
        );
        comptroller.getRewardDistributors.returns([rewardDistributor.address]);
        rewardDistributor.rewardToken.returns(xvs.address);
        xvs.balanceOf.whenCalledWith(venusERC4626.address).returns(rewardAmount);
      });

      it("should claim rewards and update PSR state", async () => {
        xvs.transfer.returns(true);

        await expect(venusERC4626.connect(user).claimRewards())
          .to.emit(venusERC4626, "ClaimRewards")
          .withArgs(rewardAmount, xvs.address);

        expect(rewardDistributor.claimRewardToken).to.have.been.calledWith(venusERC4626.address, [vToken.address]);

        expect(rewardRecipientPSR.updateAssetsState).to.have.been.calledWith(comptroller.address, xvs.address, 2);
      });
    });
  });
});

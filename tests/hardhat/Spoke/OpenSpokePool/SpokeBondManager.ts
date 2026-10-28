import { FakeContract, smock } from "@defi-wonderland/smock";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  BondAccount,
  BondAccount__factory,
  LiquidityHubBondAccount,
  LiquidityHubBondAccount__factory,
  MockLiquidityHub,
  MockLiquidityHub__factory,
  MockToken,
  MockToken__factory,
  SpokeBondManager,
  SpokeBondManager__factory,
} from "../../../../typechain";
import { deployProxy, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

/// Mirrors `ISpokeBondManager.SourceType`, in declaration order.
const SourceType = { Idle: 0, LiquidityHub: 1 };
const BOND = e18("1000");

/// A bond asset config: how the asset is held.
const assetConfig = (sourceType: number, source: string) => ({ sourceType, source });

describe("SpokeBondManager", () => {
  let owner: SignerWithAddress;
  let spokePoolManager: SignerWithAddress;
  let bondHolder: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let comptroller: SignerWithAddress;
  let other: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let usdt: MockToken;
  let idleToken: MockToken;
  let hub: MockLiquidityHub;
  let idleImplementation: BondAccount;
  let hubImplementation: LiquidityHubBondAccount;
  let bondManager: SpokeBondManager;

  /// Deploys a bond manager with no account implementations and approves it to pull the SpokePoolManager's tokens.
  const deployBondManager = async () => {
    const manager = await deployProxy(
      await new SpokeBondManager__factory(owner).deploy(spokePoolManager.address),
      acm.address,
    );
    for (const token of [usdt, idleToken]) {
      await token.connect(spokePoolManager).approve(manager.address, constants.MaxUint256);
    }
    return manager;
  };

  beforeEach(async () => {
    [owner, spokePoolManager, bondHolder, recoverer, comptroller, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);

    usdt = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    idleToken = await new MockToken__factory(owner).deploy("Idle", "IDLE", 18);
    hub = await new MockLiquidityHub__factory(owner).deploy(usdt.address);

    for (const token of [usdt, idleToken]) {
      await token.connect(spokePoolManager).faucet(BOND.mul(10));
    }
    bondManager = await deployBondManager();
    idleImplementation = await new BondAccount__factory(owner).deploy(bondManager.address);
    hubImplementation = await new LiquidityHubBondAccount__factory(owner).deploy(bondManager.address);
    await bondManager.setAccountImplementation(SourceType.Idle, idleImplementation.address);
    await bondManager.setAccountImplementation(SourceType.LiquidityHub, hubImplementation.address);
    await bondManager.setAssetConfig(usdt.address, assetConfig(SourceType.LiquidityHub, hub.address));
  });

  /// Creates a bond for `comptroller` and returns its account.
  const createBond = async (token: MockToken, amount = BOND) => {
    await bondManager
      .connect(spokePoolManager)
      .createBond(comptroller.address, bondHolder.address, token.address, amount);
    return BondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);
  };

  /// Sends `amount` of `token` straight to `account`, outside the bond manager.
  const sendTo = async (token: MockToken, account: string, amount: string) => {
    await token.faucet(e18(amount));
    await token.transfer(account, e18(amount));
  };

  /// Denies `signature` to `caller` and expects `call` to revert with Unauthorized.
  const expectUnauthorized = async (caller: SignerWithAddress, signature: string, call: () => Promise<unknown>) => {
    acm.isAllowedToCall.whenCalledWith(caller.address, signature).returns(false);
    await expect(call())
      .to.be.revertedWithCustomError(bondManager, "Unauthorized")
      .withArgs(caller.address, bondManager.address, signature);
  };

  describe("constructor and initialize", () => {
    it("reverts when the SpokePoolManager is zero", async () => {
      const factory = await ethers.getContractFactory<SpokeBondManager__factory>("SpokeBondManager");
      await expect(factory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the SpokePoolManager, owner and access control manager", async () => {
      expect(await bondManager.SPOKE_POOL_MANAGER()).to.equal(spokePoolManager.address);
      expect(await bondManager.owner()).to.equal(owner.address);
      expect(await bondManager.accessControlManager()).to.equal(acm.address);
    });

    it("cannot be initialized twice", async () => {
      await expect(bondManager.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("rejects an account implementation with a zero bond manager", async () => {
      const idleFactory = new BondAccount__factory(owner);
      await expect(idleFactory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        idleFactory,
        "ZeroAddressNotAllowed",
      );
      const hubFactory = new LiquidityHubBondAccount__factory(owner);
      await expect(hubFactory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        hubFactory,
        "ZeroAddressNotAllowed",
      );
    });

    it("cannot initialize an account implementation or an account twice", async () => {
      const account = await createBond(idleToken);
      for (const target of [idleImplementation, hubImplementation, account]) {
        await expect(target.initialize(other.address, idleToken.address, constants.AddressZero)).to.be.revertedWith(
          "Initializable: contract is already initialized",
        );
      }
    });

    it("lets only its implementation's bond manager call an account", async () => {
      const account = await createBond(idleToken);
      expect(await account.BOND_MANAGER()).to.equal(bondManager.address);
      await expect(account.connect(other).depositInSource())
        .to.be.revertedWithCustomError(account, "NotBondManager")
        .withArgs(other.address);
    });
  });

  describe("setAccountImplementation", () => {
    it("reverts unless the caller is allowed", async () => {
      await expectUnauthorized(other, "setAccountImplementation(uint8,address)", () =>
        bondManager.connect(other).setAccountImplementation(SourceType.LiquidityHub, hubImplementation.address),
      );
    });

    it("records an implementation of the source type", async () => {
      const newImplementation = await new LiquidityHubBondAccount__factory(owner).deploy(bondManager.address);
      await expect(bondManager.setAccountImplementation(SourceType.LiquidityHub, newImplementation.address))
        .to.emit(bondManager, "AccountImplementationUpdated")
        .withArgs(SourceType.LiquidityHub, hubImplementation.address, newImplementation.address);
      expect(await bondManager.accountImplementations(SourceType.LiquidityHub)).to.equal(newImplementation.address);
    });

    it("rejects a zero implementation", async () => {
      await expect(
        bondManager.setAccountImplementation(SourceType.LiquidityHub, constants.AddressZero),
      ).to.be.revertedWithCustomError(bondManager, "ZeroAddressNotAllowed");
    });

    it("clones new bonds from the new implementation and leaves existing accounts as they are", async () => {
      const oldAccount = await createBond(usdt);
      const newImplementation = await new LiquidityHubBondAccount__factory(owner).deploy(bondManager.address);
      await bondManager.setAccountImplementation(SourceType.LiquidityHub, newImplementation.address);
      await bondManager.connect(spokePoolManager).createBond(other.address, bondHolder.address, usdt.address, BOND);
      const newAccount = await bondManager.bondAccounts(other.address);

      const codeOf = async (address: string) => (await ethers.provider.getCode(address)).toLowerCase();
      expect(await codeOf(oldAccount.address)).to.contain(hubImplementation.address.slice(2).toLowerCase());
      expect(await codeOf(newAccount)).to.contain(newImplementation.address.slice(2).toLowerCase());
    });
  });

  describe("setAssetConfig", () => {
    it("reverts unless the caller is allowed", async () => {
      await expectUnauthorized(other, "setAssetConfig(address,AssetConfig)", () =>
        bondManager.connect(other).setAssetConfig(usdt.address, assetConfig(SourceType.LiquidityHub, hub.address)),
      );
    });

    it("records a config", async () => {
      const newConfig = { sourceType: SourceType.Idle, source: constants.AddressZero };
      await expect(bondManager.setAssetConfig(usdt.address, newConfig))
        .to.emit(bondManager, "AssetConfigUpdated")
        .withArgs(usdt.address, [SourceType.LiquidityHub, hub.address], [SourceType.Idle, constants.AddressZero]);
      const config = await bondManager.assetConfigs(usdt.address);
      expect(config.sourceType).to.equal(SourceType.Idle);
      expect(config.source).to.equal(constants.AddressZero);
    });

    it("rejects a source type with no account implementation", async () => {
      const manager = await deployBondManager();
      await expect(manager.setAssetConfig(usdt.address, assetConfig(SourceType.LiquidityHub, hub.address)))
        .to.be.revertedWithCustomError(manager, "InvalidAssetConfig")
        .withArgs(usdt.address);
    });

    it("rejects a source that does not fit the asset", async () => {
      const idleHub = await new MockLiquidityHub__factory(owner).deploy(idleToken.address);
      for (const config of [
        assetConfig(SourceType.LiquidityHub, constants.AddressZero),
        assetConfig(SourceType.LiquidityHub, idleHub.address),
        assetConfig(SourceType.Idle, hub.address),
      ]) {
        await expect(bondManager.setAssetConfig(usdt.address, config))
          .to.be.revertedWithCustomError(bondManager, "InvalidAssetConfig")
          .withArgs(usdt.address);
      }
    });
  });

  describe("createBond", () => {
    it("reverts unless the caller is the SpokePoolManager", async () => {
      await expect(bondManager.connect(other).createBond(comptroller.address, bondHolder.address, usdt.address, BOND))
        .to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    it("deposits a stablecoin bond in its Hub from its own account", async () => {
      await expect(
        bondManager.connect(spokePoolManager).createBond(comptroller.address, bondHolder.address, usdt.address, BOND),
      )
        .to.emit(bondManager, "BondCreated")
        .withArgs(comptroller.address, anyValue, bondHolder.address, usdt.address, BOND);
      const account = BondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);

      expect(await bondManager.isBondAccount(account.address)).to.equal(true);
      expect(await usdt.balanceOf(bondManager.address)).to.equal(0);
      expect(await usdt.allowance(bondManager.address, account.address)).to.equal(0);
      expect(await hub.balanceOf(account.address)).to.equal(BOND);
      expect(await account.bondHolder()).to.equal(bondHolder.address);
      expect(await account.seizableAmount()).to.equal(BOND);
    });

    it("holds an asset with no source as it is", async () => {
      const account = await createBond(idleToken);
      expect(await idleToken.balanceOf(account.address)).to.equal(BOND);
      expect(await account.seizableAmount()).to.equal(BOND);
    });

    /// `idleToken` was never configured, so it is held Idle, and this manager has no Idle implementation. Cloning
    /// one anyway would leave the bond in an account with no code to move it.
    it("reverts when the asset's source type has no account implementation", async () => {
      const manager = await deployBondManager();
      await expect(
        manager.connect(spokePoolManager).createBond(comptroller.address, bondHolder.address, idleToken.address, BOND),
      )
        .to.be.revertedWithCustomError(manager, "InvalidAssetConfig")
        .withArgs(idleToken.address);
    });

    it("keeps the bond in the account while its Hub is at its deposit cap, and deposits it on deposit", async () => {
      await hub.setDepositCap(0);
      const tx = await bondManager
        .connect(spokePoolManager)
        .createBond(comptroller.address, bondHolder.address, usdt.address, BOND);
      const account = BondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);
      await expect(tx).to.emit(account, "SourceDepositRefused").withArgs(BOND);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
      expect(await hub.balanceOf(account.address)).to.equal(0);
      expect(await usdt.allowance(account.address, hub.address)).to.equal(0);
      expect(await account.seizableAmount()).to.equal(BOND);

      await expect(bondManager.depositInSource(account.address))
        .to.emit(account, "SourceDepositRefused")
        .withArgs(BOND);

      await hub.setDepositCap(constants.MaxUint256);
      await expect(bondManager.depositInSource(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect(await usdt.balanceOf(account.address)).to.equal(0);
      expect(await hub.balanceOf(account.address)).to.equal(BOND);
    });

    it("keeps the bond in the account when the source refuses it without revert data", async () => {
      await hub.setRevertWithoutData(true);
      const account = await createBond(usdt);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
      expect(await usdt.allowance(account.address, hub.address)).to.equal(0);
    });

    it("reverts when the pool already has a live bond", async () => {
      await createBond(idleToken);
      await expect(createBond(usdt))
        .to.be.revertedWithCustomError(bondManager, "BondAlreadyExists")
        .withArgs(comptroller.address);
    });
  });

  describe("topUp", () => {
    it("reverts when the pool has no bond", async () => {
      await expect(bondManager.connect(spokePoolManager).topUp(comptroller.address, BOND))
        .to.be.revertedWithCustomError(bondManager, "BondNotFound")
        .withArgs(comptroller.address);
    });

    it("deposits the top-up in the source", async () => {
      const account = await createBond(usdt);
      await expect(bondManager.connect(spokePoolManager).topUp(comptroller.address, BOND))
        .to.emit(bondManager, "BondToppedUp")
        .withArgs(comptroller.address, BOND);
      expect(await hub.balanceOf(account.address)).to.equal(BOND.mul(2));
    });
  });

  describe("withdrawExcess", () => {
    it("reverts a withdrawal the Hub cannot pay at once, and pays it once the Hub can", async () => {
      const account = await createBond(usdt);
      await sendTo(usdt, hub.address, "100");
      await hub.setLiquidity(e18("60"));

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND)).to.be.revertedWith(
        "ERC4626: withdraw more than max",
      );

      await hub.setLiquidity(constants.MaxUint256);
      await bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND);
      // The Hub's share rounding values the yield a wei under
      expect(await usdt.balanceOf(bondHolder.address)).to.be.closeTo(e18("100"), 1);
      expect(await account.seizableAmount()).to.be.closeTo(BOND, 1);
    });

    it("pays from the account's balance before the Hub, even while the Hub is paused", async () => {
      const account = await createBond(usdt);
      const shares = await hub.balanceOf(account.address);
      await sendTo(usdt, account.address, "5");
      await hub.setPaused(true);

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, e18("5"));
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(e18("5"));
      expect(await hub.balanceOf(account.address)).to.equal(shares);
      expect(await account.seizableAmount()).to.equal(BOND);
    });

    it("pays the excess around a refused deposit, which stays in the account", async () => {
      await hub.setDepositCap(0);
      const account = await createBond(usdt);
      await sendTo(usdt, account.address, "5");

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, e18("5"));
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
    });

    it("pays only what is beyond the floor, the bond the tier requires", async () => {
      const account = await createBond(usdt);
      await sendTo(usdt, account.address, "100");

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, e18("1200"))).to.not.emit(
        bondManager,
        "ExcessWithdrawn",
      );
      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, e18("1050")))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, e18("50"));
      expect(await account.seizableAmount()).to.equal(e18("1050"));
    });

    it("pays extra top-ups beyond the floor, not only yield", async () => {
      await createBond(usdt);
      await bondManager.connect(spokePoolManager).topUp(comptroller.address, e18("200"));

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, e18("200"));
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(e18("200"));
    });

    it("pays nothing, and emits nothing, while a seizure leaves the bond below the floor", async () => {
      await createBond(usdt);
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address);

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND)).to.not.emit(
        bondManager,
        "ExcessWithdrawn",
      );
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(0);
    });

    it("pays nothing after a Hub loss and values the bond at what it holds", async () => {
      const account = await createBond(usdt);
      await hub.lose(e18("100"));

      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND)).to.not.emit(
        bondManager,
        "ExcessWithdrawn",
      );
      expect(await account.seizableAmount()).to.equal(await hub.previewRedeem(await hub.balanceOf(account.address)));
      expect(await account.seizableAmount()).to.be.lt(BOND);
    });
  });

  describe("seize", () => {
    it("reverts on a zero receiver", async () => {
      await createBond(idleToken);
      await expect(
        bondManager.connect(spokePoolManager).seize(comptroller.address, 1, constants.AddressZero),
      ).to.be.revertedWithCustomError(bondManager, "ZeroAddressNotAllowed");
    });

    it("reverts unless the caller is the SpokePoolManager", async () => {
      await createBond(idleToken);
      await expect(bondManager.connect(other).seize(comptroller.address, BOND, recoverer.address))
        .to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    it("spends the yield in the account before the refused deposit", async () => {
      await hub.setDepositCap(0);
      const account = await createBond(usdt);
      await hub.setDepositCap(constants.MaxUint256);
      await sendTo(usdt, account.address, "30");

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"));
      expect(await usdt.balanceOf(account.address)).to.equal(e18("930"));

      await bondManager.depositInSource(account.address);
      expect(await hub.balanceOf(account.address)).to.equal(e18("930"));
    });

    it("reverts a Hub seizure the Hub cannot pay at once, and pays it once the Hub can", async () => {
      const account = await createBond(usdt);
      await hub.setLiquidity(e18("30"));

      await expect(
        bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address),
      ).to.be.revertedWith("ERC4626: withdraw more than max");

      await hub.setLiquidity(constants.MaxUint256);
      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"));
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("100"));
      expect(await account.seizableAmount()).to.equal(e18("900"));
    });

    it("reverts a Hub seizure while the Hub is paused", async () => {
      await createBond(usdt);
      await hub.setPaused(true);

      await expect(
        bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address),
      ).to.be.revertedWith("paused");
    });

    it("pays a partial Hub seizure exactly after the Hub accrues its fees", async () => {
      await createBond(usdt);
      await hub.setFeeSharesPerBlock(e18("10"));

      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("500"), recoverer.address);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("500"));
    });

    it("seizes the whole seizable amount of a Hub bond once the Hub has charged its fees", async () => {
      const account = await createBond(usdt);
      await hub.setFeeSharesPerBlock(e18("10"));
      await hub.accrueFees();
      await hub.setFeeSharesPerBlock(0);
      const seizable = await bondManager.getSeizableAmount(comptroller.address);
      expect(seizable).to.be.lt(BOND);

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, seizable, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await account.seizableAmount()).to.be.lte(1);
    });

    it("seizes a whole Hub bond net of the exit fee, although maxWithdraw rounds the fee up", async () => {
      await hub.setRedeemFeeBps(30);
      const account = await createBond(usdt, BOND.add(1));
      const seizable = await bondManager.getSeizableAmount(comptroller.address);
      expect(await hub.maxWithdraw(account.address)).to.equal(seizable.sub(1));

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, seizable, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("reverts when the seizure asks for more than the bond holds", async () => {
      const account = await createBond(idleToken);
      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, BOND.add(1), recoverer.address))
        .to.be.revertedWithCustomError(account, "InsufficientFunds")
        .withArgs(BOND.add(1), BOND);
    });
  });

  describe("getSeizableAmount", () => {
    it("returns what the bond holds", async () => {
      const account = await createBond(idleToken);
      expect(await bondManager.getSeizableAmount(comptroller.address)).to.equal(BOND);

      await sendTo(idleToken, account.address, "10");
      expect(await bondManager.getSeizableAmount(comptroller.address)).to.equal(BOND.add(e18("10")));

      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("110"), recoverer.address);
      expect(await bondManager.getSeizableAmount(comptroller.address)).to.equal(e18("900"));
    });

    it("reverts when the pool has no bond", async () => {
      await expect(bondManager.getSeizableAmount(comptroller.address))
        .to.be.revertedWithCustomError(bondManager, "BondNotFound")
        .withArgs(comptroller.address);
    });
  });

  describe("release", () => {
    it("detaches the account and pays the bond holder at once", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "10");

      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await bondManager.bondAccounts(comptroller.address)).to.equal(constants.AddressZero);
      expect(await account.released()).to.equal(true);
      expect(await account.seizableAmount()).to.equal(0);
      await expect(
        bondManager.connect(spokePoolManager).seize(comptroller.address, 1, recoverer.address),
      ).to.be.revertedWithCustomError(bondManager, "BondNotFound");
      expect(await idleToken.balanceOf(bondHolder.address)).to.equal(BOND.add(e18("10")));
    });

    it("pays a Hub bond's holder everything at once", async () => {
      const account = await createBond(usdt);
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(BOND);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("lets a handed-over pool post a new bond", async () => {
      const oldAccount = await createBond(idleToken);
      await bondManager.connect(spokePoolManager).release(comptroller.address);

      const newAccount = await createBond(usdt);
      expect(newAccount.address).to.not.equal(oldAccount.address);
      expect(await bondManager.isBondAccount(oldAccount.address)).to.equal(true);
      expect(await newAccount.seizableAmount()).to.equal(BOND);
    });
  });

  describe("depositInSource", () => {
    it("reverts unless the caller is allowed", async () => {
      const account = await createBond(usdt);
      await expectUnauthorized(other, "depositInSource(address)", () =>
        bondManager.connect(other).depositInSource(account.address),
      );
    });

    it("reverts on an account not created here", async () => {
      await expect(bondManager.depositInSource(other.address))
        .to.be.revertedWithCustomError(bondManager, "NotBondAccount")
        .withArgs(other.address);
    });

    it("reverts once the bond is released", async () => {
      const account = await createBond(usdt);
      await bondManager.connect(spokePoolManager).release(comptroller.address);
      await expect(bondManager.depositInSource(account.address)).to.be.revertedWithCustomError(
        account,
        "BondAlreadyReleased",
      );
    });
  });

  describe("access", () => {
    it("lets only the SpokePoolManager move bonds", async () => {
      await createBond(idleToken);
      const calls: (() => Promise<unknown>)[] = [
        () => bondManager.connect(other).topUp(comptroller.address, 1),
        () => bondManager.connect(other).withdrawExcess(comptroller.address, 0),
        () => bondManager.connect(other).seize(comptroller.address, 1, recoverer.address),
        () => bondManager.connect(other).release(comptroller.address),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager").withArgs(other.address);
      }
    });

    it("reverts on a pool with no bond", async () => {
      const calls: (() => Promise<unknown>)[] = [
        () => bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, 0),
        () => bondManager.connect(spokePoolManager).seize(comptroller.address, 1, recoverer.address),
        () => bondManager.connect(spokePoolManager).release(comptroller.address),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "BondNotFound").withArgs(comptroller.address);
      }
    });

    it("lets only the bond manager call any account's functions", async () => {
      for (const token of [idleToken, usdt]) {
        await bondManager.connect(spokePoolManager).createBond(token.address, bondHolder.address, token.address, BOND);
        const account = BondAccount__factory.connect(await bondManager.bondAccounts(token.address), other);
        const calls: (() => Promise<unknown>)[] = [
          () => account.depositInSource(),
          () => account.withdrawExcess(0),
          () => account.seize(1, other.address),
          () => account.release(),
        ];
        for (const call of calls) {
          await expect(call()).to.be.revertedWithCustomError(account, "NotBondManager").withArgs(other.address);
        }
      }
    });
  });

  describe("idle bond account", () => {
    it("seizes from its balance at once", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "30");

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"))
        .and.to.emit(account, "Paid")
        .withArgs(recoverer.address, e18("100"));
      expect(await idleToken.balanceOf(recoverer.address)).to.equal(e18("100"));
      expect(await account.seizableAmount()).to.equal(e18("930"));
    });

    it("seizes nothing and pays no one for a zero seizure", async () => {
      const account = await createBond(idleToken);
      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, 0, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, 0)
        .and.to.not.emit(account, "Paid");
    });

    it("pays what its balance holds beyond the floor", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "5");
      await expect(bondManager.connect(spokePoolManager).withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, e18("5"));
      expect(await idleToken.balanceOf(bondHolder.address)).to.equal(e18("5"));
    });

    it("pays the bond holder the whole balance at release", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "5");
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(account, "Paid")
        .withArgs(bondHolder.address, BOND.add(e18("5")));
      expect(await account.released()).to.equal(true);
      expect(await account.seizableAmount()).to.equal(0);
    });

    it("shares its implementation's bond manager", async () => {
      const account = await createBond(idleToken);
      expect(await account.BOND_MANAGER()).to.equal(bondManager.address);
      expect(await account.source()).to.equal(constants.AddressZero);
      expect(await account.asset()).to.equal(idleToken.address);
    });
  });

  describe("Liquidity Hub bond account", () => {
    it("reverts a release the Hub cannot pay at once", async () => {
      await createBond(usdt);
      await hub.setLiquidity(e18("400"));
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address)).to.be.revertedWith(
        "ERC4626: redeem more than max",
      );
    });

    it("reverts a release while the Hub is paused", async () => {
      await createBond(usdt);
      await hub.setPaused(true);
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address)).to.be.revertedWith("paused");
    });

    it("pays the bond holder what the account holds plus the Hub position at release", async () => {
      const account = await createBond(usdt);
      await sendTo(usdt, account.address, "5");
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(account, "Paid")
        .withArgs(bondHolder.address, BOND.add(e18("5")));
      expect(await account.released()).to.equal(true);
      expect(await usdt.balanceOf(account.address)).to.equal(0);
    });

    it("seizes from the account's balance before the Hub", async () => {
      const account = await createBond(usdt);
      const shares = await hub.balanceOf(account.address);
      await sendTo(usdt, account.address, "50");
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("40"), recoverer.address);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("40"));
      expect(await hub.balanceOf(account.address)).to.equal(shares);
    });

    it("deposits nothing when it holds nothing", async () => {
      const account = await createBond(usdt);
      const shares = await hub.balanceOf(account.address);
      await expect(bondManager.depositInSource(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect(await hub.balanceOf(account.address)).to.equal(shares);
    });
  });
});

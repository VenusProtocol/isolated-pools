import { FakeContract, smock } from "@defi-wonderland/smock";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  IdleBondAccount,
  IdleBondAccount__factory,
  LiquidityHubBondAccount,
  LiquidityHubBondAccount__factory,
  MockLiquidityHub,
  MockLiquidityHub__factory,
  MockToken,
  MockToken__factory,
  SpokeBondManager,
  SpokeBondManager__factory,
  XVSStoreScenario__factory,
  XVSVaultBondAccount,
  XVSVaultBondAccount__factory,
  XVSVaultScenario,
  XVSVaultScenario__factory,
} from "../../../../typechain";
import { deployProxy, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

/// Mirrors `ISpokeBondManager.SourceType`, in declaration order.
const SourceType = { Idle: 0, XVSVault: 1, LiquidityHub: 2 };
const XVS_POOL_ID = 0;
const LOCK_PERIOD = 300;
const BOND = e18("1000");

/// An allowed bond asset config with a factor of 1.
const assetConfig = (sourceType: number, source: string) => ({ sourceType, source, allowed: true, factor: e18("1") });

describe("SpokeBondManager", () => {
  let owner: SignerWithAddress;
  let spokePoolManager: SignerWithAddress;
  let bondHolder: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let comptroller: SignerWithAddress;
  let other: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let xvs: MockToken;
  let usdt: MockToken;
  let idleToken: MockToken;
  let hub: MockLiquidityHub;
  let xvsVault: XVSVaultScenario;
  let idleImplementation: IdleBondAccount;
  let xvsImplementation: XVSVaultBondAccount;
  let hubImplementation: LiquidityHubBondAccount;
  let bondManager: SpokeBondManager;

  /// Deploys a bond manager with no account implementations and approves it to pull the SpokePoolManager's tokens.
  const deployBondManager = async () => {
    const manager = await deployProxy(
      await new SpokeBondManager__factory(owner).deploy(spokePoolManager.address),
      acm.address,
    );
    for (const token of [xvs, usdt, idleToken]) {
      await token.connect(spokePoolManager).approve(manager.address, constants.MaxUint256);
    }
    return manager;
  };

  beforeEach(async () => {
    [owner, spokePoolManager, bondHolder, recoverer, comptroller, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);

    xvs = await new MockToken__factory(owner).deploy("Venus", "XVS", 18);
    usdt = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    idleToken = await new MockToken__factory(owner).deploy("Idle", "IDLE", 18);
    hub = await new MockLiquidityHub__factory(owner).deploy(usdt.address);

    const store = await new XVSStoreScenario__factory(owner).deploy();
    xvsVault = await new XVSVaultScenario__factory(owner).deploy(false, 10_512_000);
    await store.setNewOwner(xvsVault.address);
    await xvsVault.setXvsStore(xvs.address, store.address);
    await xvsVault.setAccessControl(acm.address);
    await store.setRewardToken(xvs.address, true);
    await xvs.faucet(e18("1000000"));
    await xvs.transfer(store.address, e18("1000000"));
    await xvsVault.add(xvs.address, 100, xvs.address, e18("1"), LOCK_PERIOD);

    for (const token of [xvs, usdt, idleToken]) {
      await token.connect(spokePoolManager).faucet(BOND.mul(10));
    }
    bondManager = await deployBondManager();
    idleImplementation = await new IdleBondAccount__factory(owner).deploy(bondManager.address);
    xvsImplementation = await new XVSVaultBondAccount__factory(owner).deploy(bondManager.address, XVS_POOL_ID);
    hubImplementation = await new LiquidityHubBondAccount__factory(owner).deploy(bondManager.address);
    await bondManager.setAccountImplementation(SourceType.Idle, idleImplementation.address);
    await bondManager.setAccountImplementation(SourceType.XVSVault, xvsImplementation.address);
    await bondManager.setAccountImplementation(SourceType.LiquidityHub, hubImplementation.address);
    await bondManager.setAssetConfig(xvs.address, assetConfig(SourceType.XVSVault, xvsVault.address));
    await bondManager.setAssetConfig(usdt.address, assetConfig(SourceType.LiquidityHub, hub.address));
  });

  /// Creates a bond for `comptroller` and returns its account.
  const createBond = async (token: MockToken, amount = BOND) => {
    await bondManager
      .connect(spokePoolManager)
      .createBond(comptroller.address, bondHolder.address, token.address, amount);
    return IdleBondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);
  };

  /// Lets the XVSVault pay `blocks` XVS of rewards since the last deposit to its only staker, then stops its rewards.
  const accrueRewards = async (blocks: number) => {
    await mine(blocks - 1);
    await xvsVault.setRewardAmountPerBlockOrSecond(xvs.address, 0);
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
      const idleFactory = new IdleBondAccount__factory(owner);
      await expect(idleFactory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        idleFactory,
        "ZeroAddressNotAllowed",
      );
      const xvsFactory = new XVSVaultBondAccount__factory(owner);
      await expect(xvsFactory.deploy(constants.AddressZero, XVS_POOL_ID)).to.be.revertedWithCustomError(
        xvsFactory,
        "ZeroAddressNotAllowed",
      );
      const hubFactory = new LiquidityHubBondAccount__factory(owner);
      await expect(hubFactory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        hubFactory,
        "ZeroAddressNotAllowed",
      );
    });

    it("cannot initialize an account implementation or an account twice", async () => {
      const account = await createBond(xvs);
      for (const target of [idleImplementation, xvsImplementation, hubImplementation, account]) {
        await expect(target.initialize(other.address, xvs.address, constants.AddressZero)).to.be.revertedWith(
          "Initializable: contract is already initialized",
        );
      }
    });

    it("lets only its implementation's bond manager call an account", async () => {
      const account = await createBond(xvs);
      expect(await account.BOND_MANAGER()).to.equal(bondManager.address);
      await expect(account.connect(other).deposit(1))
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
      const newConfig = {
        sourceType: SourceType.Idle,
        source: constants.AddressZero,
        allowed: false,
        factor: e18("0.8"),
      };
      await expect(bondManager.setAssetConfig(usdt.address, newConfig))
        .to.emit(bondManager, "AssetConfigUpdated")
        .withArgs(
          usdt.address,
          [SourceType.LiquidityHub, hub.address, true, e18("1")],
          [SourceType.Idle, constants.AddressZero, false, e18("0.8")],
        );
      const config = await bondManager.assetConfigs(usdt.address);
      expect(config.sourceType).to.equal(SourceType.Idle);
      expect(config.source).to.equal(constants.AddressZero);
      expect(config.allowed).to.equal(false);
      expect(config.factor).to.equal(e18("0.8"));
    });

    it("rejects a zero factor", async () => {
      for (const allowed of [true, false]) {
        await expect(
          bondManager.setAssetConfig(usdt.address, {
            ...assetConfig(SourceType.LiquidityHub, hub.address),
            allowed,
            factor: 0,
          }),
        )
          .to.be.revertedWithCustomError(bondManager, "InvalidAssetConfig")
          .withArgs(usdt.address);
      }
    });

    it("rejects a source type with no account implementation", async () => {
      const manager = await deployBondManager();
      await expect(manager.setAssetConfig(usdt.address, assetConfig(SourceType.LiquidityHub, hub.address)))
        .to.be.revertedWithCustomError(manager, "InvalidAssetConfig")
        .withArgs(usdt.address);
    });
  });

  describe("createBond", () => {
    it("reverts unless the caller is the SpokePoolManager", async () => {
      await expect(bondManager.connect(other).createBond(comptroller.address, bondHolder.address, xvs.address, BOND))
        .to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    it("stakes an XVS bond in the XVSVault from its own account", async () => {
      await expect(
        bondManager.connect(spokePoolManager).createBond(comptroller.address, bondHolder.address, xvs.address, BOND),
      )
        .to.emit(bondManager, "BondCreated")
        .withArgs(comptroller.address, anyValue, bondHolder.address, xvs.address, BOND);
      const account = IdleBondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);

      expect(await bondManager.isBondAccount(account.address)).to.equal(true);
      expect(await xvs.balanceOf(bondManager.address)).to.equal(0);
      expect(await xvs.allowance(bondManager.address, account.address)).to.equal(0);
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(BOND);
      expect(await account.bondHolder()).to.equal(bondHolder.address);
      expect(await account.principal()).to.equal(BOND);
      expect(await account.value()).to.equal(BOND);
    });

    it("deposits a stablecoin bond in its Hub", async () => {
      const account = await createBond(usdt);
      expect(await hub.balanceOf(account.address)).to.equal(BOND);
      expect(await account.value()).to.equal(BOND);
    });

    it("holds an asset with no source as it is", async () => {
      const account = await createBond(idleToken);
      expect(await idleToken.balanceOf(account.address)).to.equal(BOND);
      expect(await account.value()).to.equal(BOND);
    });

    it("keeps the bond in the account while the XVSVault refuses it, and stakes it on deposit", async () => {
      await xvsVault.pause();
      const tx = await bondManager
        .connect(spokePoolManager)
        .createBond(comptroller.address, bondHolder.address, xvs.address, BOND);
      const account = IdleBondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);
      await expect(tx).to.emit(account, "SourceDepositRefused").withArgs(BOND);
      expect(await xvs.balanceOf(account.address)).to.equal(BOND);
      expect(await xvs.allowance(account.address, xvsVault.address)).to.equal(0);
      expect(await account.value()).to.equal(BOND);

      await expect(bondManager.deposit(account.address)).to.emit(account, "SourceDepositRefused").withArgs(BOND);

      await xvsVault.resume();
      await expect(bondManager.deposit(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect(await xvs.balanceOf(account.address)).to.equal(0);
      expect(await account.principal()).to.equal(BOND);
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(BOND);
    });

    it("keeps the bond in the account while its Hub is at its deposit cap", async () => {
      await hub.setDepositCap(0);
      const account = await createBond(usdt);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("keeps the bond in the account when the source refuses it without revert data", async () => {
      await hub.setRevertWithoutData(true);
      const account = await createBond(usdt);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
      expect(await usdt.allowance(account.address, hub.address)).to.equal(0);
    });

    it("reverts when the pool already has a live bond", async () => {
      await createBond(xvs);
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

    it("adds to the principal in the source", async () => {
      const account = await createBond(xvs);
      await expect(bondManager.connect(spokePoolManager).topUp(comptroller.address, BOND))
        .to.emit(bondManager, "BondToppedUp")
        .withArgs(comptroller.address, BOND);
      expect(await account.principal()).to.equal(BOND.mul(2));
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(BOND.mul(2));
    });
  });

  describe("claimYield", () => {
    it("pays the XVSVault rewards to the bond holder and keeps the principal", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);
      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address))
        .to.emit(bondManager, "YieldClaimed")
        .withArgs(comptroller.address, e18("10"));
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(e18("10"));
      expect(await account.value()).to.equal(BOND);
    });

    it("counts rewards anyone claims for the account as yield", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);
      await xvsVault.connect(other).claim(account.address, xvs.address, XVS_POOL_ID);
      expect(await xvs.balanceOf(account.address)).to.equal(e18("10"));

      await bondManager.connect(spokePoolManager).claimYield(comptroller.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(e18("10"));
    });

    it("pays a Hub's yield as far as the Hub can pay now", async () => {
      const account = await createBond(usdt);
      await sendTo(usdt, hub.address, "100");
      await hub.setLiquidity(e18("60"));

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address))
        .to.emit(bondManager, "YieldClaimed")
        .withArgs(comptroller.address, e18("60"));
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(e18("60"));
      expect(await account.value()).to.equal(BOND);
    });

    it("pays what is sent to a Hub account from the account first, even while the Hub is paused", async () => {
      const account = await createBond(usdt);
      const shares = await hub.balanceOf(account.address);
      await sendTo(usdt, account.address, "5");
      await hub.setPaused(true);

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address))
        .to.emit(bondManager, "YieldClaimed")
        .withArgs(comptroller.address, e18("5"));
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(e18("5"));
      expect(await hub.balanceOf(account.address)).to.equal(shares);
      expect(await account.value()).to.equal(BOND);
    });

    it("pays the yield around a refused deposit, which stays principal", async () => {
      await hub.setDepositCap(0);
      const account = await createBond(usdt);
      await sendTo(usdt, account.address, "5");

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address))
        .to.emit(bondManager, "YieldClaimed")
        .withArgs(comptroller.address, e18("5"));
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
      expect(await account.principal()).to.equal(BOND);
    });

    it("pays what is sent to an account with no source as yield", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "5");

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address))
        .to.emit(bondManager, "YieldClaimed")
        .withArgs(comptroller.address, e18("5"));
      expect(await idleToken.balanceOf(bondHolder.address)).to.equal(e18("5"));
      expect(await account.value()).to.equal(BOND);
    });

    it("pays nothing, and emits nothing, while a receiver is still owed", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("110"), recoverer.address);
      await sendTo(xvs, account.address, "5");

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address)).to.not.emit(
        bondManager,
        "YieldClaimed",
      );
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(0);

      await time.increase(LOCK_PERIOD);
      await bondManager.connect(recoverer).payReceiver(account.address, recoverer.address);
      await bondManager.connect(spokePoolManager).claimYield(comptroller.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(e18("5"));
    });

    it("pays nothing after a Hub loss and values the bond at what it holds", async () => {
      const account = await createBond(usdt);
      await hub.lose(e18("100"));

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address)).to.not.emit(
        bondManager,
        "YieldClaimed",
      );
      expect(await account.value()).to.equal(await hub.previewRedeem(await hub.balanceOf(account.address)));
      expect(await account.value()).to.be.lt(BOND);
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
      await createBond(xvs);
      await expect(bondManager.connect(other).seize(comptroller.address, BOND, recoverer.address))
        .to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    it("takes the XVS yield first and owes the principal until the XVSVault's lock period passes", async () => {
      const account = XVSVaultBondAccount__factory.connect((await createBond(xvs)).address, owner);
      await accrueRewards(10);

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("110"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("110"), e18("10"))
        .and.to.emit(account, "PaymentOwed")
        .withArgs(recoverer.address, e18("100"));
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("10"));
      expect(await account.principal()).to.equal(e18("900"));
      expect(await account.owedAmounts(recoverer.address)).to.equal(e18("100"));
      expect(await account.totalOwedAmount()).to.equal(e18("100"));
      expect(await account.value()).to.equal(e18("900"));

      await bondManager.connect(recoverer).payReceiver(account.address, recoverer.address);
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("10"));

      await time.increase(LOCK_PERIOD);
      await expect(bondManager.connect(recoverer).payReceiver(account.address, recoverer.address))
        .to.emit(account, "Paid")
        .withArgs(recoverer.address, e18("100"));
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("110"));
      expect(await account.owedAmounts(recoverer.address)).to.equal(0);
      expect(await account.totalOwedAmount()).to.equal(0);
      expect(await account.value()).to.equal(e18("900"));
    });

    it("spends the yield in the account before the refused deposit", async () => {
      await xvsVault.pause();
      const account = await createBond(xvs);
      await xvsVault.resume();
      await sendTo(xvs, account.address, "30");

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"), e18("100"));
      expect(await account.principal()).to.equal(e18("930"));
      expect(await xvs.balanceOf(account.address)).to.equal(e18("930"));

      await bondManager.deposit(account.address);
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(e18("930"));
    });

    it("reverts a Hub seizure the Hub cannot pay at once, and pays it once the Hub can", async () => {
      const account = await createBond(usdt);
      await hub.setLiquidity(e18("30"));

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.be.revertedWithCustomError(account, "InsufficientLiquidity")
        .withArgs(e18("70"));

      await hub.setLiquidity(constants.MaxUint256);
      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"), e18("100"));
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("100"));
      expect(await account.principal()).to.equal(e18("900"));
      expect(await account.value()).to.equal(e18("900"));
    });

    it("reverts a Hub seizure while the Hub is paused", async () => {
      const account = await createBond(usdt);
      await hub.setPaused(true);

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.be.revertedWithCustomError(account, "InsufficientLiquidity")
        .withArgs(e18("100"));
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
        .withArgs(comptroller.address, recoverer.address, seizable, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await account.value()).to.be.lte(1);
    });

    it("seizes a whole Hub bond net of the exit fee, although maxWithdraw rounds the fee up", async () => {
      await hub.setRedeemFeeBps(30);
      const account = await createBond(usdt, BOND.add(1));
      const seizable = await bondManager.getSeizableAmount(comptroller.address);
      expect(await hub.maxWithdraw(account.address)).to.equal(seizable.sub(1));

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, seizable, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seizable, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("reverts when the seizure asks for more than the bond holds", async () => {
      const account = await createBond(idleToken);
      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, BOND.add(1), recoverer.address))
        .to.be.revertedWithCustomError(account, "InsufficientFunds")
        .withArgs(BOND.add(1), BOND);
    });

    it("reverts while the XVSVault is paused", async () => {
      await createBond(xvs);
      await xvsVault.pause();
      await expect(
        bondManager.connect(spokePoolManager).seize(comptroller.address, BOND, recoverer.address),
      ).to.be.revertedWith("Vault is paused");
    });
  });

  describe("getSeizableAmount", () => {
    it("returns what the bond holds beyond what it owes receivers", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);
      expect(await bondManager.getSeizableAmount(comptroller.address)).to.equal(BOND);

      await xvsVault.connect(other).claim(account.address, xvs.address, XVS_POOL_ID);
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
    it("detaches the account and pays the bond holder the XVS once the XVSVault's lock period passes", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);

      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await bondManager.bondAccounts(comptroller.address)).to.equal(constants.AddressZero);
      expect(await account.released()).to.equal(true);
      expect(await account.value()).to.equal(0);
      await expect(
        bondManager.connect(spokePoolManager).seize(comptroller.address, 1, recoverer.address),
      ).to.be.revertedWithCustomError(bondManager, "BondNotFound");

      await time.increase(LOCK_PERIOD);
      await bondManager.connect(bondHolder).payReceiver(account.address, bondHolder.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(BOND.add(e18("10")));
    });

    it("keeps what the receivers are still owed from the bond holder", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("110"), recoverer.address);

      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);

      await time.increase(LOCK_PERIOD);
      await expect(bondManager.connect(bondHolder).payReceiver(account.address, bondHolder.address))
        .to.emit(account, "Paid")
        .withArgs(bondHolder.address, e18("900"));
      await expect(bondManager.connect(recoverer).payReceiver(account.address, recoverer.address))
        .to.emit(account, "Paid")
        .withArgs(recoverer.address, e18("100"));
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("110"));
      expect(await xvs.balanceOf(account.address)).to.equal(0);
    });

    it("pays a Hub bond's holder everything at once", async () => {
      const account = await createBond(usdt);
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(BOND);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("reverts while the XVSVault is paused, and releases once it resumes", async () => {
      const account = await createBond(xvs);
      await accrueRewards(1);
      await xvsVault.pause();

      await expect(bondManager.connect(spokePoolManager).release(comptroller.address)).to.be.revertedWith(
        "Vault is paused",
      );
      expect(await account.released()).to.equal(false);

      await xvsVault.resume();
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      await time.increase(LOCK_PERIOD);
      await bondManager.connect(bondHolder).payReceiver(account.address, bondHolder.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(BOND.add(e18("1")));
    });

    it("lets a handed-over pool post a new bond while the old account finishes paying out", async () => {
      const oldAccount = await createBond(xvs);
      await accrueRewards(10);
      await bondManager.connect(spokePoolManager).release(comptroller.address);

      const newAccount = await createBond(usdt);
      expect(newAccount.address).to.not.equal(oldAccount.address);
      expect(await bondManager.isBondAccount(oldAccount.address)).to.equal(true);

      await time.increase(LOCK_PERIOD);
      await bondManager.connect(bondHolder).payReceiver(oldAccount.address, bondHolder.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(BOND.add(e18("10")));
      expect(await newAccount.value()).to.equal(BOND);
    });
  });

  describe("deposit and payReceiver", () => {
    it("deposit reverts unless the caller is allowed", async () => {
      const account = await createBond(xvs);
      await expectUnauthorized(other, "deposit(address)", () => bondManager.connect(other).deposit(account.address));
    });

    it("payReceiver pays a receiver only what it is owed, whoever calls, with no role", async () => {
      const account = XVSVaultBondAccount__factory.connect((await createBond(xvs)).address, owner);
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address);
      const owed = await account.owedAmounts(recoverer.address);
      await time.increase(LOCK_PERIOD);
      acm.isAllowedToCall.returns(false);

      await expect(bondManager.connect(other).payReceiver(account.address, other.address)).to.not.emit(account, "Paid");
      await expect(bondManager.connect(other).payReceiver(account.address, recoverer.address))
        .to.emit(account, "Paid")
        .withArgs(recoverer.address, owed);
      expect(await account.totalOwedAmount()).to.equal(0);
    });

    it("revert on an account not created here", async () => {
      for (const call of [
        () => bondManager.deposit(other.address),
        () => bondManager.payReceiver(other.address, other.address),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "NotBondAccount").withArgs(other.address);
      }
    });
  });

  describe("access", () => {
    it("lets only the SpokePoolManager move bonds", async () => {
      await createBond(idleToken);
      const calls: (() => Promise<unknown>)[] = [
        () => bondManager.connect(other).topUp(comptroller.address, 1),
        () => bondManager.connect(other).claimYield(comptroller.address),
        () => bondManager.connect(other).seize(comptroller.address, 1, recoverer.address),
        () => bondManager.connect(other).release(comptroller.address),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager").withArgs(other.address);
      }
    });

    it("reverts on a pool with no bond", async () => {
      const calls: (() => Promise<unknown>)[] = [
        () => bondManager.connect(spokePoolManager).claimYield(comptroller.address),
        () => bondManager.connect(spokePoolManager).seize(comptroller.address, 1, recoverer.address),
        () => bondManager.connect(spokePoolManager).release(comptroller.address),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "BondNotFound").withArgs(comptroller.address);
      }
    });

    it("lets only the bond manager call any account's functions", async () => {
      for (const token of [idleToken, xvs, usdt]) {
        await bondManager.connect(spokePoolManager).createBond(token.address, bondHolder.address, token.address, BOND);
        const account = IdleBondAccount__factory.connect(await bondManager.bondAccounts(token.address), other);
        const calls: (() => Promise<unknown>)[] = [
          () => account.deposit(1),
          () => account.claimYield(),
          () => account.seize(1, other.address),
          () => account.release(),
          () => account.payReceiver(other.address),
        ];
        for (const call of calls) {
          await expect(call()).to.be.revertedWithCustomError(account, "NotBondManager").withArgs(other.address);
        }
      }
    });
  });

  describe("idle bond account", () => {
    it("seizes yield first, then principal, from its balance at once", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "30");

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"), e18("100"))
        .and.to.emit(account, "Paid")
        .withArgs(recoverer.address, e18("100"));
      expect(await idleToken.balanceOf(recoverer.address)).to.equal(e18("100"));
      expect(await account.principal()).to.equal(e18("930"));
      expect(await account.value()).to.equal(e18("930"));
      expect(await account.seizableAmount()).to.equal(e18("930"));
    });

    it("seizes within the yield without touching the principal", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "30");
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("20"), recoverer.address);
      expect(await account.principal()).to.equal(BOND);
    });

    it("seizes nothing and pays no one for a zero seizure", async () => {
      const account = await createBond(idleToken);
      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, 0, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, 0, 0)
        .and.to.not.emit(account, "Paid");
    });

    it("emits no YieldClaimed when there is no yield", async () => {
      await createBond(idleToken);
      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address)).to.not.emit(
        bondManager,
        "YieldClaimed",
      );
      expect(await idleToken.balanceOf(bondHolder.address)).to.equal(0);
    });

    it("pays the bond holder the whole balance at release", async () => {
      const account = await createBond(idleToken);
      await sendTo(idleToken, account.address, "5");
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(account, "Paid")
        .withArgs(bondHolder.address, BOND.add(e18("5")));
      expect(await account.released()).to.equal(true);
      expect(await account.principal()).to.equal(0);
      expect(await account.value()).to.equal(0);
    });

    it("shares its implementation's bond manager", async () => {
      const account = await createBond(idleToken);
      expect(await account.BOND_MANAGER()).to.equal(bondManager.address);
      expect(await account.source()).to.equal(constants.AddressZero);
      expect(await account.asset()).to.equal(idleToken.address);
    });

    it("pays no one on payReceiver", async () => {
      const account = await createBond(idleToken);
      await expect(bondManager.payReceiver(account.address, bondHolder.address)).to.not.emit(account, "Paid");
    });
  });

  describe("Liquidity Hub bond account", () => {
    it("reverts a release the Hub cannot pay at once", async () => {
      const account = await createBond(usdt);
      await hub.setLiquidity(e18("400"));
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.be.revertedWithCustomError(account, "InsufficientLiquidity")
        .withArgs(e18("600"));
    });

    it("reverts a release while the Hub is paused", async () => {
      const account = await createBond(usdt);
      await hub.setPaused(true);
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.be.revertedWithCustomError(account, "InsufficientLiquidity")
        .withArgs(BOND);
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
      expect(await account.principal()).to.equal(BOND);
    });

    it("no longer deposits once released", async () => {
      const account = await createBond(usdt);
      await bondManager.connect(spokePoolManager).release(comptroller.address);
      await sendTo(usdt, account.address, "5");
      await expect(bondManager.deposit(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect(await usdt.balanceOf(account.address)).to.equal(e18("5"));
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("deposits nothing when it holds nothing", async () => {
      const account = await createBond(usdt);
      const shares = await hub.balanceOf(account.address);
      await expect(bondManager.deposit(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect(await hub.balanceOf(account.address)).to.equal(shares);
    });

    it("pays no one on payReceiver", async () => {
      const account = await createBond(usdt);
      await expect(bondManager.payReceiver(account.address, bondHolder.address)).to.not.emit(account, "Paid");
    });
  });

  describe("XVSVault bond account", () => {
    it("pays the bond holder only what it is owed before the release", async () => {
      const account = XVSVaultBondAccount__factory.connect((await createBond(xvs)).address, owner);
      await sendTo(xvs, account.address, "5");
      await expect(bondManager.payReceiver(account.address, bondHolder.address)).to.not.emit(account, "Paid");
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(0);
    });

    it("no longer stakes once released", async () => {
      const account = await createBond(xvs);
      await bondManager.connect(spokePoolManager).release(comptroller.address);
      await sendTo(xvs, account.address, "5");
      await expect(bondManager.deposit(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(BOND);
    });

    it("stakes in its implementation's XVS pool", async () => {
      const account = XVSVaultBondAccount__factory.connect((await createBond(xvs)).address, owner);
      expect(await account.XVS_POOL_ID()).to.equal(XVS_POOL_ID);
      expect(await account.source()).to.equal(xvsVault.address);
    });
  });
});

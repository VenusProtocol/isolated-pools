import { FakeContract, smock } from "@defi-wonderland/smock";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";

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
  XVSStoreScenario__factory,
  XVSVaultBondAccount,
  XVSVaultBondAccount__factory,
  XVSVaultScenario,
  XVSVaultScenario__factory,
} from "../../../../typechain";
import { e18 } from "./utils";

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
  let idleImplementation: BondAccount;
  let xvsImplementation: XVSVaultBondAccount;
  let hubImplementation: LiquidityHubBondAccount;
  let bondManager: SpokeBondManager;

  /// Deploys a bond manager with no account implementations and approves it to pull the SpokePoolManager's tokens.
  const deployBondManager = async () => {
    const manager = (await upgrades.deployProxy(await ethers.getContractFactory("SpokeBondManager"), [acm.address], {
      constructorArgs: [spokePoolManager.address],
    })) as SpokeBondManager;
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
    idleImplementation = await new BondAccount__factory(owner).deploy(bondManager.address);
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
    return BondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);
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
      const idleFactory = new BondAccount__factory(owner);
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

    it("rejects a zero implementation, one for another source type or one for another bond manager", async () => {
      await expect(
        bondManager.setAccountImplementation(SourceType.LiquidityHub, constants.AddressZero),
      ).to.be.revertedWithCustomError(bondManager, "ZeroAddressNotAllowed");
      await expect(bondManager.setAccountImplementation(SourceType.LiquidityHub, xvsImplementation.address))
        .to.be.revertedWithCustomError(bondManager, "InvalidAccountImplementation")
        .withArgs(SourceType.LiquidityHub, xvsImplementation.address);

      const foreignImplementation = await new LiquidityHubBondAccount__factory(owner).deploy(other.address);
      await expect(bondManager.setAccountImplementation(SourceType.LiquidityHub, foreignImplementation.address))
        .to.be.revertedWithCustomError(bondManager, "InvalidAccountImplementation")
        .withArgs(SourceType.LiquidityHub, foreignImplementation.address);
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

    it("records a config whose source fits its type and asset", async () => {
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

    it("rejects a source that does not fit its type or asset", async () => {
      const cases: [MockToken, number, string][] = [
        [usdt, SourceType.XVSVault, xvsVault.address],
        [xvs, SourceType.LiquidityHub, hub.address],
        [idleToken, SourceType.Idle, hub.address],
        [xvs, SourceType.XVSVault, constants.AddressZero],
        [usdt, SourceType.LiquidityHub, constants.AddressZero],
      ];
      for (const [asset, sourceType, source] of cases) {
        await expect(bondManager.setAssetConfig(asset.address, assetConfig(sourceType, source)))
          .to.be.revertedWithCustomError(bondManager, "InvalidAssetConfig")
          .withArgs(asset.address);
      }
    });

    it("rejects an XVSVault whose pool at the implementation's XVS pool id does not stake XVS", async () => {
      await xvsVault.add(xvs.address, 100, idleToken.address, 0, LOCK_PERIOD);
      const otherImplementation = await new XVSVaultBondAccount__factory(owner).deploy(bondManager.address, 1);
      await bondManager.setAccountImplementation(SourceType.XVSVault, otherImplementation.address);

      await expect(bondManager.setAssetConfig(xvs.address, assetConfig(SourceType.XVSVault, xvsVault.address)))
        .to.be.revertedWithCustomError(bondManager, "InvalidAssetConfig")
        .withArgs(xvs.address);
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
      const account = BondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);

      expect(await bondManager.isBondAccount(account.address)).to.equal(true);
      expect(await account.sourceType()).to.equal(SourceType.XVSVault);
      expect(await xvs.balanceOf(bondManager.address)).to.equal(0);
      expect(await xvs.allowance(bondManager.address, account.address)).to.equal(0);
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(BOND);
      expect(await account.bondHolder()).to.equal(bondHolder.address);
      expect(await account.principal()).to.equal(BOND);
      expect(await account.pendingDeposit()).to.equal(0);
      expect(await account.value()).to.equal(BOND);
    });

    it("deposits a stablecoin bond in its Hub", async () => {
      const account = await createBond(usdt);
      expect(await hub.balanceOf(account.address)).to.equal(BOND);
      expect(await account.value()).to.equal(BOND);
    });

    it("holds an asset with no source as it is", async () => {
      const account = await createBond(idleToken);
      expect(await account.sourceType()).to.equal(SourceType.Idle);
      expect(await idleToken.balanceOf(account.address)).to.equal(BOND);
      expect(await account.pendingDeposit()).to.equal(0);
      expect(await account.value()).to.equal(BOND);
    });

    it("keeps the bond as a pending deposit while the XVSVault refuses it, and stakes it on retryDeposit", async () => {
      await xvsVault.pause();
      const tx = await bondManager
        .connect(spokePoolManager)
        .createBond(comptroller.address, bondHolder.address, xvs.address, BOND);
      const account = BondAccount__factory.connect(await bondManager.bondAccounts(comptroller.address), owner);
      await expect(tx).to.emit(account, "SourceDepositRefused").withArgs(BOND);
      expect(await account.pendingDeposit()).to.equal(BOND);
      expect(await xvs.allowance(account.address, xvsVault.address)).to.equal(0);
      expect(await account.value()).to.equal(BOND);

      await expect(bondManager.retryDeposit(account.address)).to.be.revertedWithCustomError(
        account,
        "SourceDepositFailed",
      );

      await xvsVault.resume();
      await expect(bondManager.retryDeposit(account.address))
        .to.emit(bondManager, "DepositRetried")
        .withArgs(account.address, BOND);
      expect(await account.pendingDeposit()).to.equal(0);
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(BOND);
      await expect(bondManager.retryDeposit(account.address)).to.be.revertedWithCustomError(account, "NothingToRetry");
    });

    it("keeps the bond as a pending deposit while its Hub is at its deposit cap", async () => {
      await hub.setDepositCap(0);
      const account = await createBond(usdt);
      expect(await account.pendingDeposit()).to.equal(BOND);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("keeps the bond as a pending deposit when the source refuses it without revert data", async () => {
      await hub.setRevertWithoutData(true);
      const account = await createBond(usdt);
      expect(await account.pendingDeposit()).to.equal(BOND);
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

    it("pays the yield around a pending deposit, which stays principal", async () => {
      await hub.setDepositCap(0);
      const account = await createBond(usdt);
      await sendTo(usdt, account.address, "5");

      await expect(bondManager.connect(spokePoolManager).claimYield(comptroller.address))
        .to.emit(bondManager, "YieldClaimed")
        .withArgs(comptroller.address, e18("5"));
      expect(await account.pendingDeposit()).to.equal(BOND);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
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
      await bondManager.payReceivers(account.address);
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
    it("reverts unless the caller is the SpokePoolManager", async () => {
      await createBond(xvs);
      await expect(bondManager.connect(other).seize(comptroller.address, BOND, recoverer.address))
        .to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    it("takes the XVS yield first and owes the principal until the XVSVault's lock period passes", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("110"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("110"), e18("10"))
        .and.to.emit(account, "PaymentQueued")
        .withArgs(recoverer.address, e18("100"));
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("10"));
      expect(await account.principal()).to.equal(e18("900"));
      expect(await account.owedToReceivers()).to.equal(e18("100"));
      expect(await account.value()).to.equal(e18("900"));

      await bondManager.payReceivers(account.address);
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("10"));

      await time.increase(LOCK_PERIOD);
      await expect(bondManager.payReceivers(account.address))
        .to.emit(account, "Paid")
        .withArgs(recoverer.address, e18("100"));
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("110"));
      expect(await account.owedToReceivers()).to.equal(0);
      expect(await account.nextPaymentIndex()).to.equal(1);
      expect((await account.receiverPayments(0)).amount).to.equal(0);
      expect(await account.value()).to.equal(e18("900"));
    });

    it("spends the yield in the account before the pending deposit", async () => {
      await xvsVault.pause();
      const account = await createBond(xvs);
      await xvsVault.resume();
      await sendTo(xvs, account.address, "30");

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"), e18("100"));
      expect(await account.principal()).to.equal(e18("930"));
      expect(await account.pendingDeposit()).to.equal(e18("930"));

      await bondManager.retryDeposit(account.address);
      expect((await xvsVault.getUserInfo(xvs.address, XVS_POOL_ID, account.address)).amount).to.equal(e18("930"));
    });

    it("pays a Hub seizure as far as the Hub can and owes the rest", async () => {
      const account = await createBond(usdt);
      await hub.setLiquidity(e18("30"));

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"), e18("30"))
        .and.to.emit(account, "PaymentQueued")
        .withArgs(recoverer.address, e18("70"));
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("30"));

      await hub.setLiquidity(constants.MaxUint256);
      await bondManager.payReceivers(account.address);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("100"));
      expect(await account.principal()).to.equal(e18("900"));
      expect(await account.value()).to.equal(e18("900"));
    });

    it("owes the whole Hub seizure while the Hub is paused", async () => {
      const account = await createBond(usdt);
      await hub.setPaused(true);

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, e18("100"), 0);
      expect(await account.owedToReceivers()).to.equal(e18("100"));

      await hub.setPaused(false);
      await bondManager.payReceivers(account.address);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("100"));
    });

    it("pays a partial Hub seizure exactly, with nothing owed, after the Hub accrues its fees", async () => {
      const account = await createBond(usdt);
      await hub.setFeeSharesPerBlock(e18("10"));

      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("500"), recoverer.address);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(e18("500"));
      expect(await account.owedToReceivers()).to.equal(0);
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
      expect(await account.owedToReceivers()).to.equal(0);
      expect(await account.value()).to.be.lte(1);
    });

    it("seizes a whole Hub bond net of the exit fee and owes nothing, although maxWithdraw rounds the fee up", async () => {
      await hub.setRedeemFeeBps(30);
      const account = await createBond(usdt, BOND.add(1));
      const seizable = await bondManager.getSeizableAmount(comptroller.address);
      expect(await hub.maxWithdraw(account.address)).to.equal(seizable.sub(1));

      await expect(bondManager.connect(spokePoolManager).seize(comptroller.address, seizable, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seizable, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await account.owedToReceivers()).to.equal(0);
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
      await bondManager.payReceivers(account.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(BOND.add(e18("10")));
    });

    it("pays the receivers still owed before the bond holder", async () => {
      const account = await createBond(xvs);
      await accrueRewards(10);
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("110"), recoverer.address);

      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);

      await time.increase(LOCK_PERIOD);
      await expect(bondManager.payReceivers(account.address))
        .to.emit(account, "Paid")
        .withArgs(recoverer.address, e18("100"))
        .and.to.emit(account, "Paid")
        .withArgs(bondHolder.address, e18("900"));
      expect(await xvs.balanceOf(recoverer.address)).to.equal(e18("110"));
      expect(await xvs.balanceOf(account.address)).to.equal(0);
    });

    it("pays a Hub bond's holder everything the Hub can pay now", async () => {
      const account = await createBond(usdt);
      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(BOND);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("releases even when the payout fails, leaving it to payReceivers", async () => {
      const account = await createBond(xvs);
      await accrueRewards(1);
      await xvsVault.pause();

      await expect(bondManager.connect(spokePoolManager).release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await account.released()).to.equal(true);

      await xvsVault.resume();
      await bondManager.payReceivers(account.address);
      await time.increase(LOCK_PERIOD);
      await bondManager.payReceivers(account.address);
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
      await bondManager.payReceivers(oldAccount.address);
      expect(await xvs.balanceOf(bondHolder.address)).to.equal(BOND.add(e18("10")));
      expect(await newAccount.value()).to.equal(BOND);
    });
  });

  describe("retryDeposit and payReceivers", () => {
    it("retryDeposit reverts unless the caller is allowed", async () => {
      const account = await createBond(xvs);
      await expectUnauthorized(other, "retryDeposit(address)", () =>
        bondManager.connect(other).retryDeposit(account.address),
      );
    });

    it("payReceivers pays the queue for any caller", async () => {
      const account = await createBond(xvs);
      await bondManager.connect(spokePoolManager).seize(comptroller.address, e18("100"), recoverer.address);
      const owed = await account.owedToReceivers();
      await time.increase(LOCK_PERIOD);
      acm.isAllowedToCall.returns(false);

      await expect(bondManager.connect(other).payReceivers(account.address))
        .to.emit(account, "Paid")
        .withArgs(recoverer.address, owed);
      expect(await account.owedToReceivers()).to.equal(0);
    });

    it("revert on an account not created here", async () => {
      for (const call of [bondManager.retryDeposit, bondManager.payReceivers]) {
        await expect(call(other.address))
          .to.be.revertedWithCustomError(bondManager, "NotBondAccount")
          .withArgs(other.address);
      }
    });
  });
});

import { FakeContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, constants, utils } from "ethers";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  BondAccount,
  BondAccount__factory,
  FaucetTokenReEntrantHarness__factory,
  LiquidityHubBondAccount,
  LiquidityHubBondAccount__factory,
  MockLiquidityHub,
  MockLiquidityHub__factory,
  MockToken,
  MockToken__factory,
  SpokeBondManager,
  SpokeBondManager__factory,
} from "../../../../typechain";
import { deployProxy, e18, resetFakes } from "./utils";

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
  let other: SignerWithAddress;
  let comptroller: SignerWithAddress;
  let otherComptrollers: SignerWithAddress[];
  let acm: FakeContract<AccessControlManager>;
  let usdt: MockToken;
  let idleToken: MockToken;
  let hub: MockLiquidityHub;
  let idleImplementation: BondAccount;
  let hubImplementation: LiquidityHubBondAccount;
  let bondManager: SpokeBondManager;
  let asManager: SpokeBondManager;

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

  const deployFixture = async () => {
    [owner, spokePoolManager, bondHolder, recoverer, other, comptroller, ...otherComptrollers] =
      await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);

    usdt = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    idleToken = await new MockToken__factory(owner).deploy("Idle", "IDLE", 18);
    hub = await new MockLiquidityHub__factory(owner).deploy(usdt.address);

    for (const token of [usdt, idleToken]) {
      await token.connect(spokePoolManager).faucet(BOND.mul(10));
    }
    bondManager = await deployBondManager();
    asManager = bondManager.connect(spokePoolManager);
    idleImplementation = await new BondAccount__factory(owner).deploy(bondManager.address);
    hubImplementation = await new LiquidityHubBondAccount__factory(owner).deploy(bondManager.address);
    await bondManager.setAccountImplementation(SourceType.Idle, idleImplementation.address);
    await bondManager.setAccountImplementation(SourceType.LiquidityHub, hubImplementation.address);
    await bondManager.setAssetConfig(usdt.address, assetConfig(SourceType.LiquidityHub, hub.address));
  };

  beforeEach(async () => {
    await loadFixture(deployFixture);
    resetFakes(acm);
    acm.isAllowedToCall.returns(true);
  });

  /// Creates a bond of `amount` of `token` for `pool` and returns its account's address.
  const createBond = async (token: MockToken, amount = BOND, pool = comptroller) => {
    await asManager.createBond(pool.address, bondHolder.address, token.address, amount);
    return bondManager.bondAccounts(pool.address);
  };
  const createIdleBond = async () => idleImplementation.attach(await createBond(idleToken));
  const createHubBond = async (amount = BOND) => hubImplementation.attach(await createBond(usdt, amount));

  /// Creates a bond of every account type, each for its own pool.
  const createBondOfEachType = async () => {
    const pools = [comptroller, ...otherComptrollers];
    const types = [
      { token: idleToken, implementation: idleImplementation },
      { token: usdt, implementation: hubImplementation },
    ];
    const bonds: { pool: SignerWithAddress; account: BondAccount | LiquidityHubBondAccount }[] = [];
    for (const [i, { token, implementation }] of types.entries()) {
      bonds.push({ pool: pools[i], account: implementation.attach(await createBond(token, BOND, pools[i])) });
    }
    return bonds;
  };

  /// Sends `amount` of `token` straight to `account`, outside the bond manager.
  const sendTo = async (token: MockToken, account: string, amount: BigNumber) => {
    await token.faucet(amount);
    await token.transfer(account, amount);
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
  });

  describe("access", () => {
    it("lets only the SpokePoolManager move bonds", async () => {
      await createBond(idleToken);
      const asOther = bondManager.connect(other);
      const calls: (() => Promise<unknown>)[] = [
        () => asOther.createBond(otherComptrollers[0].address, bondHolder.address, idleToken.address, BOND),
        () => asOther.topUp(comptroller.address, 1),
        () => asOther.withdrawExcess(comptroller.address, 0),
        () => asOther.seize(comptroller.address, 1, recoverer.address),
        () => asOther.release(comptroller.address),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "NotSpokePoolManager").withArgs(other.address);
      }
    });

    it("reverts on a pool with no bond", async () => {
      const calls: (() => Promise<unknown>)[] = [
        () => asManager.topUp(comptroller.address, BOND),
        () => asManager.withdrawExcess(comptroller.address, 0),
        () => asManager.seize(comptroller.address, 1, recoverer.address),
        () => asManager.release(comptroller.address),
        () => bondManager.getCurrentBondAmount(comptroller.address),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(bondManager, "BondNotFound").withArgs(comptroller.address);
      }
    });
  });

  describe("setAccountImplementation", () => {
    it("reverts unless the caller is allowed", async () => {
      await expectUnauthorized(other, "setAccountImplementation(uint8,address)", () =>
        bondManager.connect(other).setAccountImplementation(SourceType.LiquidityHub, hubImplementation.address),
      );
    });

    it("records the first implementation of a source type", async () => {
      const manager = await deployBondManager();
      const implementation = await new BondAccount__factory(owner).deploy(manager.address);
      await expect(manager.setAccountImplementation(SourceType.Idle, implementation.address))
        .to.emit(manager, "AccountImplementationUpdated")
        .withArgs(SourceType.Idle, constants.AddressZero, implementation.address);
      expect(await manager.accountImplementations(SourceType.Idle)).to.equal(implementation.address);
    });

    it("replaces the implementation of a source type", async () => {
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
      const newAccount = await createBond(usdt, BOND, otherComptrollers[0]);

      const codeOf = async (address: string) => (await ethers.provider.getCode(address)).toLowerCase();
      expect(await codeOf(oldAccount)).to.contain(hubImplementation.address.slice(2).toLowerCase());
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
      const newConfig = assetConfig(SourceType.Idle, constants.AddressZero);
      await expect(bondManager.setAssetConfig(usdt.address, newConfig))
        .to.emit(bondManager, "AssetConfigUpdated")
        .withArgs(usdt.address, [SourceType.LiquidityHub, hub.address], [SourceType.Idle, constants.AddressZero]);
      const config = await bondManager.assetConfigs(usdt.address);
      expect(config.sourceType).to.equal(SourceType.Idle);
      expect(config.source).to.equal(constants.AddressZero);
    });

    it("rejects a zero asset", async () => {
      await expect(
        bondManager.setAssetConfig(constants.AddressZero, assetConfig(SourceType.Idle, constants.AddressZero)),
      ).to.be.revertedWithCustomError(bondManager, "ZeroAddressNotAllowed");
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
    it("deposits a stablecoin bond in its Hub from its own account", async () => {
      const tx = await asManager.createBond(comptroller.address, bondHolder.address, usdt.address, BOND);
      const account = hubImplementation.attach(await bondManager.bondAccounts(comptroller.address));

      await expect(tx)
        .to.emit(bondManager, "BondCreated")
        .withArgs(comptroller.address, account.address, bondHolder.address, usdt.address, BOND);
      await expect(tx).to.changeTokenBalances(usdt, [spokePoolManager, account, hub], [BOND.mul(-1), 0, BOND]);
      expect(await usdt.allowance(account.address, hub.address)).to.equal(0);
      expect(await bondManager.isBondAccount(account.address)).to.equal(true);
      expect(await hub.balanceOf(account.address)).to.equal(BOND);
      expect(await account.bondHolder()).to.equal(bondHolder.address);
      expect(await account.asset()).to.equal(usdt.address);
      expect(await account.source()).to.equal(hub.address);
      expect(await account.currentBondAmount()).to.equal(BOND);
    });

    it("holds an asset with no source as it is", async () => {
      const account = await createIdleBond();
      expect(await idleToken.balanceOf(account.address)).to.equal(BOND);
      expect(await account.asset()).to.equal(idleToken.address);
      expect(await account.source()).to.equal(constants.AddressZero);
      expect(await account.currentBondAmount()).to.equal(BOND);
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

    it("keeps the bond in the account while its Hub is at its deposit cap", async () => {
      await hub.setDepositCap(0);
      const tx = await asManager.createBond(comptroller.address, bondHolder.address, usdt.address, BOND);
      const account = hubImplementation.attach(await bondManager.bondAccounts(comptroller.address));

      await expect(tx).to.emit(account, "SourceDepositRefused").withArgs(BOND);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
      expect(await usdt.allowance(account.address, hub.address)).to.equal(0);
      expect(await hub.balanceOf(account.address)).to.equal(0);
      expect(await account.currentBondAmount()).to.equal(BOND);
      await expect(bondManager.depositInSource(account.address))
        .to.emit(account, "SourceDepositRefused")
        .withArgs(BOND);
    });

    it("deposits a refused stablecoin bond on a later deposit once the Hub takes it", async () => {
      await hub.setDepositCap(0);
      const account = await createHubBond();
      await hub.setDepositCap(constants.MaxUint256);

      await expect(bondManager.depositInSource(account.address)).to.not.emit(account, "SourceDepositRefused");
      expect(await usdt.balanceOf(account.address)).to.equal(0);
      expect(await hub.balanceOf(account.address)).to.equal(BOND);
    });

    it("keeps the bond in the account when the source refuses it without revert data", async () => {
      await hub.setRevertWithoutData(true);
      const account = await createHubBond();
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
    it("deposits the top-up in the source", async () => {
      const account = await createHubBond();
      await expect(asManager.topUp(comptroller.address, BOND))
        .to.emit(bondManager, "BondToppedUp")
        .withArgs(comptroller.address, BOND);
      expect(await hub.balanceOf(account.address)).to.equal(BOND.mul(2));
      expect(await account.currentBondAmount()).to.equal(BOND.mul(2));
    });
  });

  describe("withdrawExcess", () => {
    it("reverts a withdrawal the Hub cannot pay at once, and pays it once the Hub can", async () => {
      const yieldSent = e18("100");
      const account = await createHubBond();
      await sendTo(usdt, hub.address, yieldSent);
      await hub.setLiquidity(e18("60"));

      await expect(asManager.withdrawExcess(comptroller.address, BOND)).to.be.revertedWith(
        "ERC4626: withdraw more than max",
      );

      await hub.setLiquidity(constants.MaxUint256);
      await asManager.withdrawExcess(comptroller.address, BOND);
      // The Hub's share rounding values the yield a wei under
      expect(await usdt.balanceOf(bondHolder.address)).to.be.closeTo(yieldSent, 1);
      expect(await account.currentBondAmount()).to.be.closeTo(BOND, 1);
    });

    it("pays from the account's balance before the Hub, even while the Hub is paused", async () => {
      const sent = e18("5");
      const account = await createHubBond();
      const shares = await hub.balanceOf(account.address);
      await sendTo(usdt, account.address, sent);
      await hub.setPaused(true);

      await expect(asManager.withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, sent);
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(sent);
      expect(await hub.balanceOf(account.address)).to.equal(shares);
      expect(await account.currentBondAmount()).to.equal(BOND);
    });

    it("pays the excess around a refused deposit, which stays in the account", async () => {
      const sent = e18("5");
      await hub.setDepositCap(0);
      const account = await createHubBond();
      await sendTo(usdt, account.address, sent);

      await expect(asManager.withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, sent);
      expect(await usdt.balanceOf(account.address)).to.equal(BOND);
    });

    it("pays what is sent to an account with no source", async () => {
      const sent = e18("5");
      const account = await createIdleBond();
      await sendTo(idleToken, account.address, sent);

      await expect(asManager.withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, sent);
      expect(await idleToken.balanceOf(bondHolder.address)).to.equal(sent);
      expect(await account.currentBondAmount()).to.equal(BOND);
    });

    it("pays only what is beyond the floor, the bond the tier requires", async () => {
      const sent = e18("100");
      const floor = BOND.add(e18("50"));
      const account = await createIdleBond();
      await sendTo(idleToken, account.address, sent);

      await expect(asManager.withdrawExcess(comptroller.address, BOND.add(sent)))
        .to.be.revertedWithCustomError(account, "NoExcessBond")
        .withArgs(BOND.add(sent), BOND.add(sent));
      await expect(asManager.withdrawExcess(comptroller.address, floor))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, BOND.add(sent).sub(floor));
      expect(await account.currentBondAmount()).to.equal(floor);
    });

    it("pays extra top-ups beyond the floor, not only yield", async () => {
      const topUp = e18("200");
      await createHubBond();
      await asManager.topUp(comptroller.address, topUp);

      await expect(asManager.withdrawExcess(comptroller.address, BOND))
        .to.emit(bondManager, "ExcessWithdrawn")
        .withArgs(comptroller.address, topUp);
      expect(await usdt.balanceOf(bondHolder.address)).to.equal(topUp);
    });

    it("reverts while a seizure leaves the bond below the floor", async () => {
      const account = await createIdleBond();
      await asManager.seize(comptroller.address, e18("300"), recoverer.address);
      await sendTo(idleToken, account.address, e18("5"));

      await expect(asManager.withdrawExcess(comptroller.address, BOND))
        .to.be.revertedWithCustomError(account, "NoExcessBond")
        .withArgs(BOND.sub(e18("295")), BOND);
    });

    it("reverts after a Hub loss and values the bond at what it holds", async () => {
      const loss = e18("100");
      const account = await createHubBond();
      await hub.lose(loss);

      await expect(asManager.withdrawExcess(comptroller.address, BOND))
        .to.be.revertedWithCustomError(account, "NoExcessBond")
        .withArgs(BOND.sub(loss), BOND);
      expect(await account.currentBondAmount()).to.equal(BOND.sub(loss));
    });
  });

  describe("seize", () => {
    it("reverts on a zero receiver", async () => {
      await createBond(idleToken);
      await expect(asManager.seize(comptroller.address, 1, constants.AddressZero)).to.be.revertedWithCustomError(
        bondManager,
        "ZeroAddressNotAllowed",
      );
    });

    it("seizes from a refused deposit's balance, and deposits the rest later", async () => {
      const sent = e18("30");
      const seized = e18("100");
      await hub.setDepositCap(0);
      const account = await createHubBond();
      await hub.setDepositCap(constants.MaxUint256);
      await sendTo(usdt, account.address, sent);

      await expect(asManager.seize(comptroller.address, seized, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seized);
      const left = BOND.add(sent).sub(seized);
      expect(await usdt.balanceOf(account.address)).to.equal(left);

      await bondManager.depositInSource(account.address);
      expect(await hub.balanceOf(account.address)).to.equal(left);
    });

    it("pays a Hub seizure from the Hub at once", async () => {
      const seized = e18("100");
      const account = await createHubBond();

      const tx = await asManager.seize(comptroller.address, seized, recoverer.address);
      await expect(tx).to.emit(bondManager, "BondSeized").withArgs(comptroller.address, recoverer.address, seized);
      await expect(tx).to.changeTokenBalances(usdt, [recoverer, hub], [seized, seized.mul(-1)]);
      expect(await account.currentBondAmount()).to.equal(BOND.sub(seized));
    });

    it("reverts a Hub seizure the Hub cannot pay at once", async () => {
      await createHubBond();
      await hub.setLiquidity(e18("30"));

      await expect(asManager.seize(comptroller.address, e18("100"), recoverer.address)).to.be.revertedWith(
        "ERC4626: withdraw more than max",
      );
    });

    it("reverts a Hub seizure while the Hub is paused", async () => {
      await createHubBond();
      await hub.setPaused(true);

      await expect(asManager.seize(comptroller.address, e18("100"), recoverer.address)).to.be.revertedWith("paused");
    });

    it("pays a partial Hub seizure exactly after the Hub accrues its fees", async () => {
      const seized = e18("500");
      await createHubBond();
      await hub.setFeeSharesPerBlock(e18("10"));

      const tx = await asManager.seize(comptroller.address, seized, recoverer.address);
      await expect(tx).to.emit(bondManager, "BondSeized").withArgs(comptroller.address, recoverer.address, seized);
      await expect(tx).to.changeTokenBalances(usdt, [recoverer, hub], [seized, seized.mul(-1)]);
    });

    it("seizes the whole seizable amount of a Hub bond once the Hub has charged its fees", async () => {
      const account = await createHubBond();
      await hub.setFeeSharesPerBlock(e18("10"));
      await hub.accrueFees();
      await hub.setFeeSharesPerBlock(0);
      /// The bond's 1000 shares of the 1010 the fees left, which hold its 1000 USDT, rounded down
      const seizable = BigNumber.from("990099009900990099009");
      expect(await bondManager.getCurrentBondAmount(comptroller.address)).to.equal(seizable);

      await expect(asManager.seize(comptroller.address, seizable, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await hub.balanceOf(account.address)).to.equal(0);
      expect(await account.currentBondAmount()).to.equal(0);
    });

    it("seizes a whole Hub bond net of the exit fee, although maxWithdraw rounds the fee up", async () => {
      await hub.setRedeemFeeBps(30);
      const account = await createHubBond(BOND.add(1));
      const seizable = await bondManager.getCurrentBondAmount(comptroller.address);
      expect(await hub.maxWithdraw(account.address)).to.equal(seizable.sub(1));

      await expect(asManager.seize(comptroller.address, seizable, recoverer.address))
        .to.emit(bondManager, "BondSeized")
        .withArgs(comptroller.address, recoverer.address, seizable);
      expect(await usdt.balanceOf(recoverer.address)).to.equal(seizable);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });
  });

  describe("getCurrentBondAmount", () => {
    it("returns what the bond holds", async () => {
      const sent = e18("10");
      const seized = e18("110");
      const account = await createIdleBond();
      expect(await bondManager.getCurrentBondAmount(comptroller.address)).to.equal(BOND);

      await sendTo(idleToken, account.address, sent);
      expect(await bondManager.getCurrentBondAmount(comptroller.address)).to.equal(BOND.add(sent));

      await asManager.seize(comptroller.address, seized, recoverer.address);
      expect(await bondManager.getCurrentBondAmount(comptroller.address)).to.equal(BOND.add(sent).sub(seized));
    });
  });

  describe("release", () => {
    it("detaches the account from its pool", async () => {
      const account = await createIdleBond();

      await expect(asManager.release(comptroller.address))
        .to.emit(bondManager, "BondReleased")
        .withArgs(comptroller.address, account.address);
      expect(await bondManager.bondAccounts(comptroller.address)).to.equal(constants.AddressZero);
      expect(await bondManager.isBondAccount(account.address)).to.equal(true);
      expect(await account.released()).to.equal(true);
      expect(await account.currentBondAmount()).to.equal(0);
      await expect(asManager.seize(comptroller.address, 1, recoverer.address))
        .to.be.revertedWithCustomError(bondManager, "BondNotFound")
        .withArgs(comptroller.address);
    });

    it("pays a Hub bond's holder everything at once", async () => {
      const account = await createHubBond();
      const tx = await asManager.release(comptroller.address);
      await expect(tx).to.emit(bondManager, "BondReleased").withArgs(comptroller.address, account.address);
      await expect(tx).to.changeTokenBalances(usdt, [bondHolder, hub], [BOND, BOND.mul(-1)]);
      expect(await hub.balanceOf(account.address)).to.equal(0);
    });

    it("lets a handed-over pool post a new bond", async () => {
      const oldAccount = await createIdleBond();
      await asManager.release(comptroller.address);

      const newAccount = await createHubBond();
      expect(newAccount.address).to.not.equal(oldAccount.address);
      expect(await bondManager.isBondAccount(oldAccount.address)).to.equal(true);
      expect(await newAccount.currentBondAmount()).to.equal(BOND);
    });
  });

  describe("depositInSource", () => {
    it("reverts unless the caller is allowed", async () => {
      const account = await createBond(usdt);
      await expectUnauthorized(other, "depositInSource(address)", () =>
        bondManager.connect(other).depositInSource(account),
      );
    });

    it("reverts on an account not created here", async () => {
      await expect(bondManager.depositInSource(other.address))
        .to.be.revertedWithCustomError(bondManager, "NotBondAccount")
        .withArgs(other.address);
    });

    it("reverts once the bond is released", async () => {
      for (const { pool, account } of await createBondOfEachType()) {
        await asManager.release(pool.address);
        await expect(bondManager.depositInSource(account.address)).to.be.revertedWithCustomError(
          account,
          "BondAlreadyReleased",
        );
      }
    });
  });

  describe("reentrancy", () => {
    /// The arguments each guarded function is re-entered with.
    const reEntries: Record<string, () => unknown[]> = {
      createBond: () => [otherComptrollers[0].address, bondHolder.address, idleToken.address, BOND],
      topUp: () => [comptroller.address, BOND],
      withdrawExcess: () => [comptroller.address, 0],
      seize: () => [comptroller.address, BOND, recoverer.address],
      release: () => [comptroller.address],
      depositInSource: () => [other.address],
    };

    for (const [name, args] of Object.entries(reEntries)) {
      it(`rejects re-entry into ${name}`, async () => {
        // A bond asset that is also the SpokePoolManager, and calls back into the manager while it pulls the bond
        const token = await new FaucetTokenReEntrantHarness__factory(owner).deploy(
          0,
          "Re-entrant",
          18,
          "RE",
          new utils.Interface(SpokeBondManager__factory.abi).encodeFunctionData(name, args()),
          "transferFrom",
        );
        const manager = await deployProxy(
          await new SpokeBondManager__factory(owner).deploy(token.address),
          acm.address,
        );
        const implementation = await new BondAccount__factory(owner).deploy(manager.address);
        await manager.setAccountImplementation(SourceType.Idle, implementation.address);
        await impersonateAccount(token.address);
        await setBalance(token.address, e18("1"));

        await expect(
          manager
            .connect(await ethers.getSigner(token.address))
            .createBond(comptroller.address, bondHolder.address, token.address, 0),
        ).to.be.revertedWith("ReentrancyGuard: reentrant call");
      });
    }
  });

  describe("bond accounts", () => {
    it("reject a zero bond manager", async () => {
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

    it("cannot be initialized again, as implementation or clone", async () => {
      const accounts = (await createBondOfEachType()).map(({ account }) => account);
      for (const target of [idleImplementation, hubImplementation, ...accounts]) {
        await expect(target.initialize(other.address, idleToken.address, constants.AddressZero)).to.be.revertedWith(
          "Initializable: contract is already initialized",
        );
      }
    });

    it("share their implementation's bond manager, the only caller they let in", async () => {
      for (const { account } of await createBondOfEachType()) {
        expect(await account.BOND_MANAGER()).to.equal(bondManager.address);
        const asOther = account.connect(other);
        const calls: (() => Promise<unknown>)[] = [
          () => asOther.depositInSource(),
          () => asOther.withdrawExcess(0),
          () => asOther.seize(1, other.address),
          () => asOther.release(),
        ];
        for (const call of calls) {
          await expect(call()).to.be.revertedWithCustomError(account, "NotBondManager").withArgs(other.address);
        }
      }
    });

    it("reject a seizure of more than the bond holds", async () => {
      for (const { pool, account } of await createBondOfEachType()) {
        await expect(asManager.seize(pool.address, BOND.add(1), recoverer.address))
          .to.be.revertedWithCustomError(account, "InsufficientFunds")
          .withArgs(BOND.add(1), BOND);
      }
    });

    describe("idle bond account", () => {
      it("seizes from its balance at once", async () => {
        const sent = e18("30");
        const seized = e18("100");
        const account = await createIdleBond();
        await sendTo(idleToken, account.address, sent);

        await expect(asManager.seize(comptroller.address, seized, recoverer.address))
          .to.emit(bondManager, "BondSeized")
          .withArgs(comptroller.address, recoverer.address, seized)
          .and.to.emit(account, "Paid")
          .withArgs(recoverer.address, seized);
        expect(await idleToken.balanceOf(recoverer.address)).to.equal(seized);
        expect(await account.currentBondAmount()).to.equal(BOND.add(sent).sub(seized));
      });

      it("seizes nothing and pays no one for a zero seizure", async () => {
        const account = await createIdleBond();
        await expect(asManager.seize(comptroller.address, 0, recoverer.address))
          .to.emit(bondManager, "BondSeized")
          .withArgs(comptroller.address, recoverer.address, 0)
          .and.to.not.emit(account, "Paid");
      });

      it("pays the bond holder the whole balance at release", async () => {
        const sent = e18("5");
        const account = await createIdleBond();
        await sendTo(idleToken, account.address, sent);
        await expect(asManager.release(comptroller.address))
          .to.emit(account, "Paid")
          .withArgs(bondHolder.address, BOND.add(sent));
        expect(await account.released()).to.equal(true);
        expect(await account.currentBondAmount()).to.equal(0);
      });
    });

    describe("Liquidity Hub bond account", () => {
      it("reverts a release the Hub cannot pay at once", async () => {
        await createHubBond();
        await hub.setLiquidity(e18("400"));
        await expect(asManager.release(comptroller.address)).to.be.revertedWith("ERC4626: redeem more than max");
      });

      it("reverts a release while the Hub is paused", async () => {
        await createHubBond();
        await hub.setPaused(true);
        await expect(asManager.release(comptroller.address)).to.be.revertedWith("paused");
      });

      it("pays the bond holder what the account holds plus the Hub position at release", async () => {
        const sent = e18("5");
        const account = await createHubBond();
        await sendTo(usdt, account.address, sent);
        await expect(asManager.release(comptroller.address))
          .to.emit(account, "Paid")
          .withArgs(bondHolder.address, BOND.add(sent));
        expect(await account.released()).to.equal(true);
        expect(await usdt.balanceOf(account.address)).to.equal(0);
      });

      it("seizes from the account's balance before the Hub", async () => {
        const sent = e18("50");
        const seized = e18("40");
        const account = await createHubBond();
        const shares = await hub.balanceOf(account.address);
        await sendTo(usdt, account.address, sent);
        await asManager.seize(comptroller.address, seized, recoverer.address);
        expect(await usdt.balanceOf(recoverer.address)).to.equal(seized);
        expect(await usdt.balanceOf(account.address)).to.equal(sent.sub(seized));
        expect(await hub.balanceOf(account.address)).to.equal(shares);
      });

      it("deposits nothing when it holds nothing", async () => {
        const account = await createHubBond();
        const shares = await hub.balanceOf(account.address);
        await expect(bondManager.depositInSource(account.address)).to.not.emit(account, "SourceDepositRefused");
        expect(await hub.balanceOf(account.address)).to.equal(shares);
      });
    });
  });
});

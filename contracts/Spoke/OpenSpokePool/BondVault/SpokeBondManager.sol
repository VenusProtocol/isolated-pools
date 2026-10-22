// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { EXP_SCALE } from "../../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../../lib/validators.sol";
import { ISpokeBondManager } from "../../interfaces/ISpokeBondManager.sol";
import { BondVaultAccount } from "./Accounts/BondVaultAccount.sol";

/**
 * @title SpokeBondManager
 * @author Venus
 * @notice Holds the bond of every live open spoke pool, the first money used to repay the pool's bad debt. Each bond
 * sits in its own account, a clone of the account implementation of the source type governance sets for its asset:
 * XVS is staked in the XVSVault, a stablecoin is deposited in its Liquidity Hub, and an asset with no source is simply
 * held. Bonds are keyed by the pool's comptroller. A released bond's account is detached from its pool, so a pool
 * that is handed over gets a new bond and account while the old one finishes paying out
 * @dev Only `SPOKE_POOL_MANAGER` moves bonds
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokeBondManager is AccessControlledV8, ReentrancyGuardUpgradeable, ISpokeBondManager {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The manager that moves bonds
    address public immutable SPOKE_POOL_MANAGER;

    /// @notice The oracle bonds are valued with
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ISpokeBondManager
    mapping(SourceType => address) public accountImplementations;

    /// @notice Where each asset earns yield; an asset never set has no source
    mapping(address => AssetSource) public assetSources;

    /// @inheritdoc ISpokeBondManager
    mapping(address => address) public bondAccounts;

    /// @inheritdoc ISpokeBondManager
    mapping(address => bool) public isBondAccount;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[46] private __gap;

    /// @dev Reverts unless the caller is `SPOKE_POOL_MANAGER`
    modifier onlySpokePoolManager() {
        if (msg.sender != SPOKE_POOL_MANAGER) {
            revert NotSpokePoolManager(msg.sender);
        }
        _;
    }

    /**
     * @param spokePoolManager The manager that moves bonds
     * @param resilientOracle The oracle bonds are valued with
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(address spokePoolManager, ResilientOracleInterface resilientOracle) {
        ensureNonzeroAddress(spokePoolManager);
        ensureNonzeroAddress(address(resilientOracle));

        SPOKE_POOL_MANAGER = spokePoolManager;
        RESILIENT_ORACLE = resilientOracle;

        _disableInitializers();
    }

    /**
     * @notice Initializes the bond manager
     * @param accessControlManager_ The AccessControlManager the bond manager checks roles in
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
    }

    /*** SpokePoolManager functions ***/

    /// @inheritdoc ISpokeBondManager
    function createBond(
        address comptroller,
        address bondOwner,
        address asset,
        uint256 amount
    ) external onlySpokePoolManager nonReentrant returns (address account) {
        if (bondAccounts[comptroller] != address(0)) {
            revert BondAlreadyExists(comptroller);
        }

        AssetSource memory assetSource = assetSources[asset];
        address implementation = accountImplementations[assetSource.sourceType];
        if (implementation == address(0)) {
            revert AccountImplementationNotSet(assetSource.sourceType);
        }
        account = Clones.clone(implementation);
        BondVaultAccount(account).initialize(bondOwner, IERC20Upgradeable(asset), assetSource.source);
        bondAccounts[comptroller] = account;
        isBondAccount[account] = true;

        _fundBond(BondVaultAccount(account), IERC20Upgradeable(asset), amount);

        emit BondCreated(comptroller, account, bondOwner, asset, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function topUp(address comptroller, uint256 amount) external onlySpokePoolManager nonReentrant {
        BondVaultAccount account = _ensureBond(comptroller);

        _fundBond(account, account.asset(), amount);

        emit BondToppedUp(comptroller, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function claimYield(address comptroller) external onlySpokePoolManager nonReentrant returns (uint256 amount) {
        amount = _ensureBond(comptroller).claimYield();

        emit YieldClaimed(comptroller, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function seize(
        address comptroller,
        uint256 amount,
        address receiver
    ) external onlySpokePoolManager nonReentrant returns (uint256 paidNow) {
        paidNow = _ensureBond(comptroller).seize(amount, receiver);

        emit BondSeized(comptroller, receiver, amount, paidNow);
    }

    /// @inheritdoc ISpokeBondManager
    function release(address comptroller) external onlySpokePoolManager nonReentrant returns (uint256 paidNow) {
        BondVaultAccount account = _ensureBond(comptroller);
        delete bondAccounts[comptroller];

        paidNow = account.release();

        emit BondReleased(comptroller, address(account), paidNow);
    }

    /*** Governance functions ***/

    /// @inheritdoc ISpokeBondManager
    function retryDeposit(address account) external nonReentrant {
        _checkAccessAllowed("retryDeposit(address)");
        if (!isBondAccount[account]) {
            revert NotBondAccount(account);
        }

        emit DepositRetried(account, BondVaultAccount(account).retryDeposit());
    }

    /// @inheritdoc ISpokeBondManager
    function payOwed(address account) external nonReentrant {
        _checkAccessAllowed("payOwed(address)");
        if (!isBondAccount[account]) {
            revert NotBondAccount(account);
        }

        BondVaultAccount(account).payOwed();
    }

    /// @inheritdoc ISpokeBondManager
    function setAssetSource(address asset, SourceType sourceType, address source) external {
        _checkAccessAllowed("setAssetSource(address,uint8,address)");
        ensureNonzeroAddress(asset);
        address implementation = accountImplementations[sourceType];
        if (implementation == address(0) || !BondVaultAccount(implementation).isValidSource(asset, source)) {
            revert InvalidAssetSource(asset);
        }

        AssetSource memory newSource = AssetSource(sourceType, source);
        emit AssetSourceUpdated(asset, assetSources[asset], newSource);
        assetSources[asset] = newSource;
    }

    /// @inheritdoc ISpokeBondManager
    function setAccountImplementation(SourceType sourceType, address implementation) external {
        _checkAccessAllowed("setAccountImplementation(uint8,address)");
        ensureNonzeroAddress(implementation);
        if (BondVaultAccount(implementation).sourceType() != sourceType) {
            revert InvalidAccountImplementation(sourceType, implementation);
        }
        emit AccountImplementationUpdated(sourceType, accountImplementations[sourceType], implementation);
        accountImplementations[sourceType] = implementation;
    }

    /*** View functions ***/

    /// @inheritdoc ISpokeBondManager
    function getSeizableAmount(address comptroller) external view returns (uint256) {
        return _ensureBond(comptroller).seizableAmount();
    }

    /// @inheritdoc ISpokeBondManager
    function getBondValueUsd(address comptroller) external view returns (uint256) {
        BondVaultAccount account = _ensureBond(comptroller);
        return (account.value() * RESILIENT_ORACLE.getPrice(address(account.asset()))) / EXP_SCALE;
    }

    /*** Internal functions ***/

    /**
     * @dev Pulls `amount` from the caller and lets the bond's account pull it into the bond
     * @param account The bond's account
     * @param asset The bond's asset
     * @param amount The amount, which the caller must have approved
     */
    function _fundBond(BondVaultAccount account, IERC20Upgradeable asset, uint256 amount) internal {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        asset.forceApprove(address(account), amount);
        account.deposit(amount);
    }

    /**
     * @dev Returns a pool's live bond account
     * @param comptroller The pool's comptroller
     * @return account The account
     * @custom:error BondNotFound is thrown when the pool has no live bond
     */
    function _ensureBond(address comptroller) internal view returns (BondVaultAccount account) {
        account = BondVaultAccount(bondAccounts[comptroller]);
        if (address(account) == address(0)) {
            revert BondNotFound(comptroller);
        }
    }
}

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
import { IBondAccount } from "../../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../interfaces/ISpokeBondManager.sol";

/**
 * @title SpokeBondManager
 * @author Venus
 * @notice Holds the bond of every live open spoke pool, keyed by its comptroller: the first money that repays the
 * pool's bad debt. Each bond sits in its own account, a clone of its asset's source type implementation, which stakes
 * XVS in the XVSVault, deposits a stablecoin in its Liquidity Hub or simply holds the asset. A released bond's account
 * is detached from its pool and keeps paying what it owes through `payReceivers`
 * @dev Only `SPOKE_POOL_MANAGER` moves bonds
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokeBondManager is AccessControlledV8, ReentrancyGuardUpgradeable, ISpokeBondManager {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @inheritdoc ISpokeBondManager
    address public immutable SPOKE_POOL_MANAGER;

    /// @inheritdoc ISpokeBondManager
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ISpokeBondManager
    mapping(SourceType => address) public accountImplementations;

    /// @inheritdoc ISpokeBondManager
    mapping(address => AssetConfig) public assetConfigs;

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

    // ──────────────────────────────────────────────────────────────────────
    // SpokePoolManager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokeBondManager
    function createBond(
        address comptroller,
        address bondHolder,
        address asset,
        uint256 amount
    ) external onlySpokePoolManager nonReentrant returns (address account) {
        if (bondAccounts[comptroller] != address(0)) {
            revert BondAlreadyExists(comptroller);
        }

        AssetConfig memory assetConfig = assetConfigs[asset];
        address implementation = accountImplementations[assetConfig.sourceType];
        if (implementation == address(0)) {
            revert AccountImplementationNotSet(assetConfig.sourceType);
        }
        account = Clones.clone(implementation);
        IBondAccount(account).initialize(bondHolder, IERC20Upgradeable(asset), assetConfig.source);
        bondAccounts[comptroller] = account;
        isBondAccount[account] = true;

        _fundBond(IBondAccount(account), IERC20Upgradeable(asset), amount);

        emit BondCreated(comptroller, account, bondHolder, asset, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function topUp(address comptroller, uint256 amount) external onlySpokePoolManager nonReentrant {
        IBondAccount account = _ensureBond(comptroller);

        _fundBond(account, account.asset(), amount);

        emit BondToppedUp(comptroller, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function claimYield(address comptroller) external onlySpokePoolManager nonReentrant returns (uint256 amount) {
        amount = _ensureBond(comptroller).claimYield();

        if (amount != 0) {
            emit YieldClaimed(comptroller, amount);
        }
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
    function release(
        address comptroller
    ) external onlySpokePoolManager nonReentrant returns (uint256 paidToBondHolder) {
        IBondAccount account = _ensureBond(comptroller);
        delete bondAccounts[comptroller];

        paidToBondHolder = account.release();

        emit BondReleased(comptroller, address(account), paidToBondHolder);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Permissionless functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokeBondManager
    function payReceivers(address account) external nonReentrant {
        if (!isBondAccount[account]) {
            revert NotBondAccount(account);
        }

        IBondAccount(account).payReceivers();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Governance functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokeBondManager
    function retryDeposit(address account) external nonReentrant {
        _checkAccessAllowed("retryDeposit(address)");
        if (!isBondAccount[account]) {
            revert NotBondAccount(account);
        }

        uint256 amount = IBondAccount(account).retryDeposit();

        emit DepositRetried(account, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function setAssetConfig(address asset, AssetConfig calldata config) external {
        _checkAccessAllowed("setAssetConfig(address,AssetConfig)");
        ensureNonzeroAddress(asset);
        address implementation = accountImplementations[config.sourceType];
        if (
            config.factor == 0 ||
            implementation == address(0) ||
            !IBondAccount(implementation).isValidSource(asset, config.source)
        ) {
            revert InvalidAssetConfig(asset);
        }

        emit AssetConfigUpdated(asset, assetConfigs[asset], config);
        assetConfigs[asset] = config;
    }

    /// @inheritdoc ISpokeBondManager
    function setAccountImplementation(SourceType sourceType, address implementation) external {
        _checkAccessAllowed("setAccountImplementation(uint8,address)");
        ensureNonzeroAddress(implementation);
        if (
            IBondAccount(implementation).sourceType() != sourceType ||
            IBondAccount(implementation).BOND_MANAGER() != address(this)
        ) {
            revert InvalidAccountImplementation(sourceType, implementation);
        }

        emit AccountImplementationUpdated(sourceType, accountImplementations[sourceType], implementation);
        accountImplementations[sourceType] = implementation;
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokeBondManager
    function getSeizableAmount(address comptroller) external view returns (uint256) {
        return _ensureBond(comptroller).seizableAmount();
    }

    /// @inheritdoc ISpokeBondManager
    function getBondValueUsd(address comptroller) external view returns (uint256) {
        IBondAccount account = _ensureBond(comptroller);
        return (account.value() * RESILIENT_ORACLE.getPrice(address(account.asset()))) / EXP_SCALE;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Pulls `amount` from the caller and lets the bond's account pull it into the bond
    function _fundBond(IBondAccount account, IERC20Upgradeable asset, uint256 amount) internal {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        asset.forceApprove(address(account), amount);
        account.deposit(amount);
    }

    /// @dev Returns a pool's live bond account
    function _ensureBond(address comptroller) internal view returns (IBondAccount) {
        address account = bondAccounts[comptroller];
        if (account == address(0)) {
            revert BondNotFound(comptroller);
        }
        return IBondAccount(account);
    }
}

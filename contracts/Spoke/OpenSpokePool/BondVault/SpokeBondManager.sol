// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { ensureNonzeroAddress } from "../../../lib/validators.sol";
import { IBondAccount } from "../../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../interfaces/ISpokeBondManager.sol";
import { ILiquidityHub } from "../../interfaces/external/ILiquidityHub.sol";

/**
 * @title SpokeBondManager
 * @author Venus
 * @notice Creates and runs the bond account of every open spoke pool, keyed by the pool's comptroller, until the bond
 * is released. The bond is the first money that repays the pool's bad debt. Each account is a clone of the
 * implementation for its asset's source type: it deposits a stablecoin in its Liquidity Hub, or just holds the asset.
 * A released bond's account is detached from its pool
 * @dev Only `SPOKE_POOL_MANAGER` creates, tops up, withdraws the excess of, seizes and releases bonds
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokeBondManager is AccessControlledV8, ReentrancyGuardUpgradeable, ISpokeBondManager {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @inheritdoc ISpokeBondManager
    address public immutable SPOKE_POOL_MANAGER;

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
     * @custom:error ZeroAddressNotAllowed is thrown when the manager is zero
     */
    constructor(address spokePoolManager) {
        ensureNonzeroAddress(spokePoolManager);

        SPOKE_POOL_MANAGER = spokePoolManager;

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

        // The manager bonds any asset the policy registry accepts, so one never configured here is held Idle. A clone
        // of a missing implementation accepts the bond with no code to move it out, so it reverts instead
        AssetConfig memory assetConfig = assetConfigs[asset];
        address implementation = accountImplementations[assetConfig.sourceType];
        if (implementation == address(0)) {
            revert InvalidAssetConfig(asset);
        }
        account = Clones.clone(implementation);
        IBondAccount(account).initialize(bondHolder, IERC20Upgradeable(asset), assetConfig.source);
        bondAccounts[comptroller] = account;
        isBondAccount[account] = true;

        IERC20Upgradeable(asset).safeTransferFrom(msg.sender, account, amount);
        IBondAccount(account).depositInSource();

        emit BondCreated(comptroller, account, bondHolder, asset, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function topUp(address comptroller, uint256 amount) external onlySpokePoolManager nonReentrant {
        IBondAccount account = _ensureBondExists(comptroller);

        account.asset().safeTransferFrom(msg.sender, address(account), amount);
        account.depositInSource();

        emit BondToppedUp(comptroller, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function withdrawExcess(
        address comptroller,
        uint256 floor
    ) external onlySpokePoolManager nonReentrant returns (uint256 amount) {
        amount = _ensureBondExists(comptroller).withdrawExcess(floor);

        if (amount != 0) {
            emit ExcessWithdrawn(comptroller, amount);
        }
    }

    /// @inheritdoc ISpokeBondManager
    function seize(address comptroller, uint256 amount, address receiver) external onlySpokePoolManager nonReentrant {
        ensureNonzeroAddress(receiver);

        _ensureBondExists(comptroller).seize(amount, receiver);

        emit BondSeized(comptroller, receiver, amount);
    }

    /// @inheritdoc ISpokeBondManager
    function release(address comptroller) external onlySpokePoolManager nonReentrant {
        IBondAccount account = _ensureBondExists(comptroller);

        delete bondAccounts[comptroller];
        account.release();

        emit BondReleased(comptroller, address(account));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Admin functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokeBondManager
    function depositInSource(address account) external nonReentrant {
        _checkAccessAllowed("depositInSource(address)");
        if (!isBondAccount[account]) {
            revert NotBondAccount(account);
        }

        IBondAccount(account).depositInSource();
    }

    /// @inheritdoc ISpokeBondManager
    function setAccountImplementation(SourceType sourceType, address implementation) external {
        _checkAccessAllowed("setAccountImplementation(uint8,address)");
        ensureNonzeroAddress(implementation);

        emit AccountImplementationUpdated(sourceType, accountImplementations[sourceType], implementation);
        accountImplementations[sourceType] = implementation;
    }

    /// @inheritdoc ISpokeBondManager
    function setAssetConfig(address asset, AssetConfig calldata config) external {
        _checkAccessAllowed("setAssetConfig(address,AssetConfig)");
        ensureNonzeroAddress(asset);
        // A Hub for another asset would refuse every deposit, leaving the bonds idle without failing
        bool sourceFits = config.sourceType == SourceType.LiquidityHub
            ? config.source != address(0) && ILiquidityHub(config.source).asset() == asset
            : config.source == address(0);
        if (accountImplementations[config.sourceType] == address(0) || !sourceFits) {
            revert InvalidAssetConfig(asset);
        }

        emit AssetConfigUpdated(asset, assetConfigs[asset], config);
        assetConfigs[asset] = config;
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokeBondManager
    function getSeizableAmount(address comptroller) external view returns (uint256) {
        return _ensureBondExists(comptroller).seizableAmount();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Returns a pool's live bond account
    function _ensureBondExists(address comptroller) private view returns (IBondAccount) {
        address account = bondAccounts[comptroller];
        if (account == address(0)) {
            revert BondNotFound(comptroller);
        }
        return IBondAccount(account);
    }
}

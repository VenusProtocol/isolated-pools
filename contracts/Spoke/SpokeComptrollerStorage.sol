// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { VToken } from "../VToken.sol";
import { RewardsDistributor } from "../Rewards/RewardsDistributor.sol";
import { Action } from "../ComptrollerInterface.sol";

/**
 * @title SpokeComptrollerStorage
 * @author Venus
 * @notice Storage layout for the `SpokeComptroller` contract.
 * @dev Fork of `ComptrollerStorage` (`contracts/ComptrollerStorage.sol`), kept separate so the spoke layout and the
 * `AccountLiquiditySnapshot` struct can change without touching the shared implementation. Re-synced by hand when
 * `ComptrollerStorage` changes, like the implementation it accompanies.
 */
contract SpokeComptrollerStorage {
    struct LiquidationOrder {
        VToken vTokenCollateral;
        VToken vTokenBorrowed;
        uint256 repayAmount;
    }

    /// @dev `totalCollateral` and `maxClearableDebt` are only meaningful under
    /// `WeightFunction.USE_LIQUIDATION_THRESHOLD`, which is the weighting every caller that reads them passes. Under
    /// the collateral factor they are derived from the deviation-bounded collateral price rather than spot, so a new
    /// caller on that weighting must not start reading them without deciding what price they should be based on.
    struct AccountLiquiditySnapshot {
        uint256 totalCollateral;
        uint256 weightedCollateral;
        uint256 borrows;
        uint256 effects;
        uint256 liquidity;
        uint256 shortfall;
        // The largest borrow value the account's collateral can clear without leaving bad debt behind, computed as
        // the sum over the account's collateral markets of `collateralValue / liquidationIncentive`, each market at
        // its own incentive. Used to route an under-threshold account between `liquidateAccount` and `healAccount`.
        uint256 maxClearableDebt;
    }

    struct RewardSpeeds {
        address rewardToken;
        uint256 supplySpeed;
        uint256 borrowSpeed;
    }

    struct Market {
        // Whether or not this market is listed
        bool isListed;
        //  Multiplier representing the most one can borrow against their collateral in this market.
        //  For instance, 0.9 to allow borrowing 90% of collateral value.
        //  Must be between 0 and 1, and stored as a mantissa.
        uint256 collateralFactorMantissa;
        //  Multiplier representing the collateralization after which the borrow is eligible
        //  for liquidation. For instance, 0.8 liquidate when the borrow is 80% of collateral
        //  value. Must be between 0 and collateral factor, stored as a mantissa.
        uint256 liquidationThresholdMantissa;
        // Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;
    }

    /**
     * @notice Oracle which gives the price of any given asset
     */
    ResilientOracleInterface public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint256 public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint256 public liquidationIncentiveMantissa;

    /**
     * @notice Per-account mapping of "assets you are in"
     */
    mapping(address => VToken[]) public accountAssets;

    /**
     * @notice Official mapping of vTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) public markets;

    /// @notice A list of all markets
    VToken[] public allMarkets;

    /// @notice Borrow caps enforced by borrowAllowed for each vToken address. Defaults to zero which restricts borrowing.
    mapping(address => uint256) public borrowCaps;

    /// @notice Minimal collateral required for regular (non-batch) liquidations
    uint256 public minLiquidatableCollateral;

    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting not allowed
    mapping(address => uint256) public supplyCaps;

    /// @notice True if a certain action is paused on a certain market
    mapping(address => mapping(Action => bool)) internal _actionPaused;

    // List of Reward Distributors added
    RewardsDistributor[] internal rewardsDistributors;

    // Used to check if rewards distributor is added
    mapping(address => bool) internal rewardsDistributorExists;

    /// @notice Flag indicating whether forced liquidation enabled for a market
    mapping(address => bool) public isForcedLiquidationEnabled;

    uint256 internal constant NO_ERROR = 0;

    // closeFactorMantissa must be strictly greater than this value
    uint256 internal constant MIN_CLOSE_FACTOR_MANTISSA = 0.05e18; // 0.05

    // closeFactorMantissa must not exceed this value
    uint256 internal constant MAX_CLOSE_FACTOR_MANTISSA = 0.9e18; // 0.9

    // No collateralFactorMantissa may exceed this value
    uint256 internal constant MAX_COLLATERAL_FACTOR_MANTISSA = 0.95e18; // 0.95

    /// @notice Whether the delegate is allowed to borrow or redeem on behalf of the user
    //mapping(address user => mapping (address delegate => bool approved)) public approvedDelegates;
    mapping(address => mapping(address => bool)) public approvedDelegates;

    /// @notice Whether a market accepts supply only from the accounts on its supply allowlist. Keyed by market, and
    /// disabled by default, so a newly listed market accepts supply from anyone.
    mapping(address => bool) public isSupplyAllowlistEnabled;

    /// @notice The accounts a market accepts supply from while its supply allowlist is enabled. Keyed by market,
    /// then by account.
    mapping(address => mapping(address => bool)) public isAllowedSupplier;

    /// @notice Whether seizing collateral in this pool is restricted to the accounts on the liquidation allowlist.
    /// Disabled by default.
    /// @dev Pool-wide rather than per market, because `healAccount` seizes across every market the borrower is in and
    /// so cannot attribute a seizure to a single one of them.
    bool public isLiquidationAllowlistEnabled;

    /// @notice The accounts allowed to seize collateral in this pool while the liquidation allowlist is enabled
    mapping(address => bool) public isAllowedLiquidator;

    /// @notice Per-market discount a liquidator receives on the collateral it seizes, scaled by 1e18. Keyed by the
    /// collateral market, since that is what the discount prices.
    /// @dev Zero means no market value has been set, in which case `liquidationIncentiveMantissa` applies. That
    /// pool-wide value is always at least 1e18 for a listed market: `PoolRegistry.addMarket` refuses to add one to an
    /// unregistered pool, and registering a pool goes through `setLiquidationIncentive`, which enforces the floor.
    mapping(address => uint256) public liquidationIncentives;

    /// @notice Oracle that bounds an asset's price against a recent window, so a deviating print cannot inflate
    /// borrowing capacity. Read only where the collateral factor weights the position; the liquidation-threshold
    /// paths stay on `oracle`, because they route liquidations.
    IDeviationBoundedOracle public deviationBoundedOracle;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     * The size is derived from the 47 slots `ComptrollerStorage` reserves: plus one for the Prime token slot, which
     * is unused here and is returned to the gap rather than left as a hole, minus the six slots the allowlists, the
     * per-market liquidation incentives and the deviation-bounded oracle above take. This contract therefore occupies
     * the same number of slots as the one it was forked from.
     */
    uint256[42] private __gap;
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "./VToken.sol";
import { RewardsDistributor } from "./Rewards/RewardsDistributor.sol";
import { IPrime } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/Interfaces/IPrime.sol";
import { Action } from "./ComptrollerInterface.sol";

/**
 * @title ComptrollerStorage
 * @author Venus
 * @notice Storage layout for the `Comptroller` contract.
 */
contract ComptrollerStorage {
    struct LiquidationOrder {
        VToken vTokenCollateral;
        VToken vTokenBorrowed;
        uint256 repayAmount;
    }

    struct AccountLiquiditySnapshot {
        uint256 totalCollateral;
        uint256 weightedCollateral;
        uint256 borrows;
        uint256 effects;
        uint256 liquidity;
        uint256 shortfall;
        uint256 weightavg;
        uint256 healthFactor;
        uint256 healthFactorThreshold;
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

    /// Prime token address
    IPrime public prime;

    /// @notice Whether the delegate is allowed to borrow or redeem on behalf of the user
    //mapping(address user => mapping (address delegate => bool approved)) public approvedDelegates;
    mapping(address => mapping(address => bool)) public approvedDelegates;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[47] private __gap;
}

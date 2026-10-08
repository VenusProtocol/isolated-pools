// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SpokePoolFactory } from "./SpokePoolFactory.sol";

/**
 * @title SpokePoolManagerStorage
 * @author Venus
 * @notice Storage layout for the `SpokePoolManager` contract: its enums, structs, constants and state variables.
 */
// solhint-disable-next-line max-states-count
contract SpokePoolManagerStorage {
    /// @notice Lifecycle of a request
    enum RequestStatus {
        None,
        Pending,
        Proposed,
        Rejected,
        Executed
    }

    /// @notice Lifecycle of a pool
    enum PoolStatus {
        None,
        Live,
        ExitRequested,
        ExitProposed,
        WindingDown,
        Closed,
        HandedOver
    }

    /// @notice Limits a pool of a tier is created and tuned within
    struct Tier {
        // XVS locked in the vault for a pool of this tier
        uint256 stakeAmount;
        // Upper bound on the summed USD value of the loan markets' supply caps, scaled by 1e18
        uint256 maxLiquidityUsd;
        // Upper bound on a collateral market's collateral factor, scaled by 1e18
        uint256 maxCollateralFactor;
        // Upper bound on a collateral market's liquidation threshold, scaled by 1e18
        uint256 maxLiquidationThreshold;
        // Lower bound on a collateral market's liquidation threshold, scaled by 1e18; stops a deployer from
        // force-liquidating its borrowers by dropping the threshold to zero
        uint256 minLiquidationThreshold;
    }

    /// @notice Parameters of one market of a requested pool
    struct MarketParams {
        address asset;
        address interestRateModel;
        // ERC-20 name of the vToken
        string name;
        // ERC-20 symbol of the vToken
        string symbol;
        // ERC-20 decimals of the vToken; 8 in Venus markets
        uint8 decimals;
        // Whether the Hub funds the market and the project borrows from it; otherwise the market is collateral
        bool isLoanMarket;
        // Collateral factor, scaled by 1e18; zero for a loan market
        uint256 collateralFactor;
        // Liquidation threshold, scaled by 1e18; zero for a loan market
        uint256 liquidationThreshold;
        // Supply cap in the underlying; for a loan market, the liquidity the Hub supplies up to
        uint256 supplyCap;
        // Borrow cap in the underlying; zero for a collateral market
        uint256 borrowCap;
        // Reserve factor, scaled by 1e18
        uint256 reserveFactor;
        // Initial supply escrowed from the project when the request is proposed, minted when the market is listed
        uint256 seed;
        // Share of the seed's vTokens burned, scaled by 1e18; the rest goes to the treasury. 0.1e18 burns 10%, as in
        // most Venus market listings
        uint256 seedBurnShare;
        // Exchange rate the market is listed at, scaled by 1e18; 10^(18 + underlying decimals - vToken decimals)
        // makes one vToken worth one unit of the underlying, as in Venus market listings
        uint256 initialExchangeRate;
    }

    /// @notice Parameters of a requested pool; a request that adds markets to a pool only uses `markets`
    struct PoolParams {
        string name;
        // Close factor, scaled by 1e18
        uint256 closeFactor;
        // Pool-wide liquidation incentive, scaled by 1e18
        uint256 liquidationIncentive;
        // Collateral below which only batch liquidations apply, in USD scaled by 1e18
        uint256 minLiquidatableCollateral;
        MarketParams[] markets;
    }

    /// @notice A project's request for a new pool, or a deployer's request for new markets in its pool
    struct Request {
        // The project that submitted the request and becomes, or is, the pool's deployer
        address project;
        RequestStatus status;
        // The pool the markets are added to; zero for a request for a new pool
        address comptroller;
        uint256 tierId;
        // XVS locked for the request; zero for a request that adds markets
        uint256 stakeAmount;
        uint256 proposalId;
        // Underlying asset of each market's seed escrowed for the proposal, in market order
        address[] seedAssets;
        // Amount of each market's escrowed seed, in market order
        uint256[] seedAmounts;
    }

    /// @notice A pool created through the manager
    struct Pool {
        address deployer;
        PoolStatus status;
        // True while the Venus team has frozen the deployer's functions
        bool deployerFrozen;
        uint256 tierId;
        // XVS still locked for the pool
        uint256 lockedStake;
        // When the exit's first proposal executed and the repayment window opened
        uint256 windDownStartedAt;
    }

    /// @notice A deployer's decrease of a collateral market's liquidation threshold, waiting out its delay
    struct PendingLiquidationThreshold {
        // The new liquidation threshold, scaled by 1e18
        uint256 liquidationThreshold;
        // When the deployer scheduled it; zero when no decrease is scheduled
        uint256 scheduledAt;
    }

    /// @notice GovernorBravo `ProposalType.NORMAL`, the route the manager proposes on
    uint8 public constant NORMAL_PROPOSAL = 0;

    /// @dev GovernorBravo `ProposalState.Canceled`
    uint8 internal constant PROPOSAL_CANCELED = 2;

    /// @dev GovernorBravo `ProposalState.Defeated`
    uint8 internal constant PROPOSAL_DEFEATED = 3;

    /// @dev GovernorBravo `ProposalState.Expired`
    uint8 internal constant PROPOSAL_EXPIRED = 6;

    /// @notice The factory that deploys pools
    SpokePoolFactory public factory;

    /// @notice The Hub adapter loan markets are registered with
    address public spokeAdapter;

    /// @notice Minimum USD value of each seed, scaled by 1e18
    uint256 public minSeedUsd;

    /// @notice Time borrowers have to repay after an exit's first proposal executes, in seconds
    uint256 public repaymentWindow;

    /// @notice Borrows and bad debt a wound-down pool may still hold when its stake is released, in USD scaled by 1e18.
    ///   Interest rounding can leave `totalBorrows` above the sum of the accounts' borrows with no account left to repay
    ///   it, and bad debt worth less than one unit of XVS cannot be covered
    uint256 public maxResidualDebtUsd;

    /// @notice Number of requests submitted; also the id of the latest one
    uint256 public requestCount;

    /// @notice Number of tiers set; tier ids run from 0 to `tierCount - 1`
    uint256 public tierCount;

    /// @notice Tiers by id
    mapping(uint256 => Tier) public tiers;

    /// @notice The Hub source (YieldGroup) that funds loan markets of an asset
    mapping(address => address) public spokeSources;

    /// @notice Pools by comptroller
    mapping(address => Pool) public pools;

    /// @notice Whether a market created through the manager is a loan market
    mapping(address => bool) public isLoanMarket;

    /// @notice Requests by id; the getter leaves out the escrowed seeds, and the requested parameters are in
    ///   `RequestSubmitted`
    mapping(uint256 => Request) public requests;

    /// @notice Time a deployer waits before a lower liquidation threshold takes effect, in seconds
    uint256 public liquidationThresholdDelay;

    /// @notice Scheduled liquidation-threshold decreases by market
    mapping(address => PendingLiquidationThreshold) public pendingLiquidationThresholds;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[35] private __gap;
}

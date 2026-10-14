// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

/**
 * @title SpokePoolManagerStorage
 * @author Venus
 * @notice Storage layout of `SpokePoolManager`
 */
// solhint-disable-next-line max-states-count
contract SpokePoolManagerStorage {
    /// @notice What a request asks for
    enum RequestType {
        Pool,
        Markets,
        PoolConfig,
        Tier
    }

    /// @notice Lifecycle of a request
    enum RequestStatus {
        None,
        Pending,
        Proposed,
        Rejected,
        Settled,
        Canceled
    }

    /// @notice Lifecycle of a pool
    enum PoolStatus {
        None,
        Live,
        ExitRequested,
        ExitProposed,
        WindingDown,
        Closed,
        TakenOverByGovernance
    }

    /// @notice Stake and risk limits of a pool tier
    struct Tier {
        uint256 stakeAmount;
        // Upper bound on the summed USD value of the loan markets' supply caps
        uint256 maxLiquidityUsd;
        uint256 maxCollateralFactor;
        uint256 maxLiquidationThreshold;
        uint256 minLiquidationThreshold;
    }

    /// @notice Parameters of a new market set by the deployer
    struct DeployerMarketParams {
        address asset;
        // Funded by the Hub and borrowable; otherwise a collateral market
        bool isLoanMarket;
        string name;
        string symbol;
        uint256 collateralFactor;
        uint256 liquidationThreshold;
        uint256 supplyCap;
        uint256 borrowCap;
        // Initial supply, pulled from the deployer with the request
        uint256 seed;
    }

    /// @notice Parameters of a new market set by Venus
    struct ProtocolMarketParams {
        address interestRateModel;
        uint256 reserveFactor;
        // Share of the seed's vTokens burned, scaled by 1e18; the rest goes to the treasury
        uint256 seedBurnPercent;
    }

    /// @notice A new market: the deployer's parameters followed by Venus's
    struct MarketParams {
        address asset;
        bool isLoanMarket;
        string name;
        string symbol;
        uint256 collateralFactor;
        uint256 liquidationThreshold;
        uint256 supplyCap;
        uint256 borrowCap;
        uint256 seed;
        address interestRateModel;
        uint8 decimals;
        uint256 reserveFactor;
        uint256 seedBurnPercent;
        uint256 initialExchangeRate;
    }

    /// @notice Pool-wide parameters
    struct PoolParams {
        uint256 closeFactor;
        uint256 liquidationIncentive;
        uint256 minLiquidatableCollateral;
    }

    /// @notice A new interest rate model for a listed market
    struct MarketInterestRateModel {
        address vToken;
        address interestRateModel;
    }

    /// @notice Content of a pool request
    struct PoolRequest {
        uint256 tierId;
        // XVS locked with the request
        uint256 stake;
        string name;
        PoolParams params;
    }

    /// @notice Content of a pool config request; a zero pool parameter is left as it is
    struct PoolConfigRequest {
        PoolParams params;
        MarketInterestRateModel[] interestRateModels;
    }

    /// @notice Content of a tier request
    struct TierRequest {
        uint256 tierId;
        // The tier's terms when requested; the move applies only while they hold
        bytes32 termsHash;
    }

    /// @notice A deployer's request; only the sections of its type are set
    struct Request {
        RequestType requestType;
        RequestStatus status;
        // Cleared by a team update until the deployer approves again
        bool approved;
        address deployer;
        // Zero for a pool request until it is first proposed
        address comptroller;
        uint256 proposalId;
        PoolRequest pool;
        // Pool and markets requests; the manager holds their seeds until settlement
        MarketParams[] markets;
        PoolConfigRequest poolConfig;
        TierRequest tier;
    }

    /// @notice A pool created through the manager
    struct Pool {
        address deployer;
        PoolStatus status;
        bool deployerPaused;
        uint256 tierId;
        uint256 lockedStake;
        uint256 windDownStartedAt;
    }

    /// @notice Builds and submits the manager's proposals
    address public proposer;

    /// @notice Checks requests and deployer updates against the tiers
    address public validator;

    /// @notice Time after an exit's first proposal executes before its force close can be proposed, in seconds
    uint256 public windDownPeriod;

    /// @notice Borrows and bad debt, in USD, a winding-down pool may still hold when its stake is released
    uint256 public maxResidualPoolDebtUsd;

    /// @notice Pool-wide parameters of new pools
    PoolParams public poolDefaults;

    /// @notice Venus's parameters of new markets
    ProtocolMarketParams public marketDefaults;

    /// @notice Number of requests; also the latest request id
    uint256 public requestCount;

    /// @notice Number of tiers; ids run from 0 to `tierCount - 1`
    uint256 public tierCount;

    /// @notice Tiers by id; read them with `getTier`
    mapping(uint256 => Tier) internal tiers;

    /// @notice The Hub source (YieldGroup) that funds loan markets of an asset
    mapping(address => address) public spokeSources;

    /// @notice Pools by comptroller; read them with `getPool`
    mapping(address => Pool) internal pools;

    /// @notice Whether a market created through the manager is a loan market
    mapping(address => bool) public isLoanMarket;

    /// @notice Requests by id; read them with `getRequest`
    mapping(uint256 => Request) internal requests;

    /// @notice Each deployer's latest request; a deployer submits another only while it is neither pending nor proposed
    mapping(address => uint256) public latestRequestIds;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[32] private __gap;
}

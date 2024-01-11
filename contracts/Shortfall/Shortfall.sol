/// @notice  SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ensureNonzeroAddress, ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";

import { VToken } from "../VToken.sol";
import { ComptrollerInterface, ComptrollerViewInterface } from "../ComptrollerInterface.sol";
import { IRiskFund } from "../RiskFund/IRiskFund.sol";
import { PoolRegistry } from "../Pool/PoolRegistry.sol";
import { PoolRegistryInterface } from "../Pool/PoolRegistryInterface.sol";
import { TokenDebtTracker } from "../lib/TokenDebtTracker.sol";
import { EXP_SCALE } from "../lib/constants.sol";

/**
 * @title Shortfall
 * @author Venus
 * @notice Shortfall is an auction contract designed to auction off the `convertibleBaseAsset` accumulated in `RiskFund`. The `convertibleBaseAsset`
 * is auctioned in exchange for users paying off the pool's bad debt. An auction can be started by anyone once a pool's bad debt has reached a minimum value.
 * This value is set and can be changed by the authorized accounts. If the pool’s bad debt exceeds the risk fund plus a 10% incentive, then the auction winner
 * is determined by who will pay off the largest percentage of the pool's bad debt. The auction winner then exchanges for the entire risk fund. Otherwise,
 * if the risk fund covers the pool's bad debt plus the 10% incentive, then the auction winner is determined by who will take the smallest percentage of the
 * risk fund in exchange for paying off all the pool's bad debt.
 */
contract Shortfall is
    TimeManagerV8,
    Ownable2StepUpgradeable,
    AccessControlledV8,
    ReentrancyGuardUpgradeable,
    TokenDebtTracker
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Type of auction
    enum AuctionType {
        LARGE_POOL_DEBT,
        LARGE_RISK_FUND
    }

    /// @notice Status of auction
    enum AuctionStatus {
        NOT_STARTED,
        STARTED,
        ENDED
    }

    /// @notice Auction metadata
    struct Auction {
        /// @notice It holds either the starting block number or timestamp
        uint256 startBlockOrTimestamp;
        AuctionType auctionType;
        AuctionStatus status;
        VToken[] markets;
        uint256 seizedRiskFund;
        address highestBidder;
        uint256 highestBidBps;
        /// @notice It holds either the highestBid block or timestamp
        uint256 highestBidBlockOrTimestamp;
        uint256 startBidBps;
        mapping(VToken => uint256) marketDebt;
        mapping(VToken => uint256) bidAmount;
    }

    /// @dev Max basis points i.e., 100%
    uint256 private constant MAX_BPS = 10000;

    // @notice Default incentive basis points (BPS) for the auction participants, set to 10%
    uint256 private constant DEFAULT_INCENTIVE_BPS = 1000;

    // @notice Default block or timestamp limit for the next bidder to place a bid
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 private immutable DEFAULT_NEXT_BIDDER_BLOCK_OR_TIMESTAMP_LIMIT;

    // @notice Default number of blocks or seconds to wait for the first bidder before starting the auction
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 private immutable DEFAULT_WAIT_FOR_FIRST_BIDDER;

    /// @notice Pool registry address
    address public poolRegistry;

    /// @notice Risk fund address
    IRiskFund public riskFund;

    /// @notice Minimum USD debt in pool for shortfall to trigger
    uint256 public minimumPoolBadDebt;

    /// @notice Incentive to auction participants, initial value set to 1000 or 10%
    uint256 public incentiveBps;

    /// @notice Time to wait for next bidder. Initially waits for 100 blocks or 300 seconds
    uint256 public nextBidderBlockLimit;

    /// @notice Boolean of if auctions are paused
    bool public auctionsPaused;

    /// @notice Time to wait for first bidder. Initially waits for 100 blocks or 300 seconds
    uint256 public waitForFirstBidder;

    /// @notice Auctions for each pool
    mapping(address => Auction) public auctions;

    /// @notice Emitted when a auction starts
    event AuctionStarted(
        address indexed comptroller,
        uint256 auctionStartBlockOrTimestamp,
        AuctionType auctionType,
        VToken[] markets,
        uint256[] marketsDebt,
        uint256 seizedRiskFund,
        uint256 startBidBps
    );

    /// @notice Emitted when a bid is placed
    event BidPlaced(
        address indexed comptroller,
        uint256 auctionStartBlockOrTimestamp,
        uint256 bidBps,
        address indexed bidder
    );

    /// @notice Emitted when a auction is completed
    event AuctionClosed(
        address indexed comptroller,
        uint256 auctionStartBlockOrTimestamp,
        address indexed highestBidder,
        uint256 highestBidBps,
        uint256 seizedRiskFind,
        VToken[] markets,
        uint256[] marketDebt
    );

    /// @notice Emitted when a auction is restarted
    event AuctionRestarted(address indexed comptroller, uint256 auctionStartBlockOrTimestamp);

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when minimum pool bad debt is updated
    event MinimumPoolBadDebtUpdated(uint256 oldMinimumPoolBadDebt, uint256 newMinimumPoolBadDebt);

    /// @notice Emitted when wait for first bidder block or timestamp count is updated
    event WaitForFirstBidderUpdated(uint256 oldWaitForFirstBidder, uint256 newWaitForFirstBidder);

    /// @notice Emitted when next bidder block or timestamp limit is updated
    event NextBidderBlockLimitUpdated(
        uint256 oldNextBidderBlockOrTimestampLimit,
        uint256 newNextBidderBlockOrTimestampLimit
    );

    /// @notice Emitted when incentiveBps is updated
    event IncentiveBpsUpdated(uint256 oldIncentiveBps, uint256 newIncentiveBps);

    /// @notice Emitted when auctions are paused
    event AuctionsPaused(address sender);

    /// @notice Emitted when auctions are unpaused
    event AuctionsResumed(address sender);

    /**
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
     * @param blocksPerYear_ The number of blocks per year
     * @param nextBidderBlockOrTimestampLimit_ Default block or timestamp limit for the next bidder to place a bid
     * @param waitForFirstBidder_ Default number of blocks or seconds to wait for the first bidder before starting the auction
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor(
        bool timeBased_,
        uint256 blocksPerYear_,
        uint256 nextBidderBlockOrTimestampLimit_,
        uint256 waitForFirstBidder_
    ) TimeManagerV8(timeBased_, blocksPerYear_) {
        ensureNonzeroValue(nextBidderBlockOrTimestampLimit_);
        ensureNonzeroValue(waitForFirstBidder_);

        DEFAULT_NEXT_BIDDER_BLOCK_OR_TIMESTAMP_LIMIT = nextBidderBlockOrTimestampLimit_;
        DEFAULT_WAIT_FOR_FIRST_BIDDER = waitForFirstBidder_;

        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Initialize the shortfall contract
     * @param riskFund_ RiskFund contract address
     * @param minimumPoolBadDebt_ Minimum bad debt in base asset for a pool to start auction
     * @param accessControlManager_ AccessControlManager contract address
     * @custom:error ZeroAddressNotAllowed is thrown when convertible base asset address is zero
     * @custom:error ZeroAddressNotAllowed is thrown when risk fund address is zero
     */
    function initialize(
        IRiskFund riskFund_,
        uint256 minimumPoolBadDebt_,
        address accessControlManager_
    ) external initializer {
        ensureNonzeroAddress(address(riskFund_));
        require(minimumPoolBadDebt_ != 0, "invalid minimum pool bad debt");

        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
        __TokenDebtTracker_init();
        minimumPoolBadDebt = minimumPoolBadDebt_;
        riskFund = riskFund_;
        incentiveBps = DEFAULT_INCENTIVE_BPS;
        auctionsPaused = false;

        waitForFirstBidder = DEFAULT_WAIT_FOR_FIRST_BIDDER;
        nextBidderBlockLimit = DEFAULT_NEXT_BIDDER_BLOCK_OR_TIMESTAMP_LIMIT;
    }

    /**
     * @notice Place a bid greater than the previous in an ongoing auction
     * @param comptroller Comptroller address of the pool
     * @param bidBps The bid percent of the risk fund or bad debt depending on auction type
     * @param auctionStartBlockOrTimestamp The block number or timestamp when auction started
     * @custom:event Emits BidPlaced event on success
     */
    function placeBid(address comptroller, uint256 bidBps, uint256 auctionStartBlockOrTimestamp) external nonReentrant {
        Auction storage auction = auctions[comptroller];

        require(auction.startBlockOrTimestamp == auctionStartBlockOrTimestamp, "auction has been restarted");
        require(_isStarted(auction), "no on-going auction");
        require(!_isStale(auction), "auction is stale, restart it");
        require(bidBps > 0, "basis points cannot be zero");
        require(bidBps <= MAX_BPS, "basis points cannot be more than 10000");
        require(
            (auction.auctionType == AuctionType.LARGE_POOL_DEBT &&
                ((auction.highestBidder != address(0) && bidBps > auction.highestBidBps) ||
                    (auction.highestBidder == address(0) && bidBps >= auction.startBidBps))) ||
                (auction.auctionType == AuctionType.LARGE_RISK_FUND &&
                    ((auction.highestBidder != address(0) && bidBps < auction.highestBidBps) ||
                        (auction.highestBidder == address(0) && bidBps <= auction.startBidBps))),
            "your bid is not the highest"
        );

        uint256 marketsCount = auction.markets.length;
        for (uint256 i; i < marketsCount; ++i) {
            VToken vToken = VToken(address(auction.markets[i]));
            IERC20Upgradeable erc20 = IERC20Upgradeable(address(vToken.underlying()));

            if (auction.highestBidder != address(0)) {
                _transferOutOrTrackDebt(erc20, auction.highestBidder, auction.bidAmount[auction.markets[i]]);
            }
            uint256 balanceBefore = erc20.balanceOf(address(this));

            if (auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                uint256 currentBidAmount = ((auction.marketDebt[auction.markets[i]] * bidBps) / MAX_BPS);
                erc20.safeTransferFrom(msg.sender, address(this), currentBidAmount);
            } else {
                erc20.safeTransferFrom(msg.sender, address(this), auction.marketDebt[auction.markets[i]]);
            }

            uint256 balanceAfter = erc20.balanceOf(address(this));
            auction.bidAmount[auction.markets[i]] = balanceAfter - balanceBefore;
        }

        auction.highestBidder = msg.sender;
        auction.highestBidBps = bidBps;
        auction.highestBidBlockOrTimestamp = getBlockNumberOrTimestamp();

        emit BidPlaced(comptroller, auction.startBlockOrTimestamp, bidBps, msg.sender);
    }

    /**
     * @notice Close an auction
     * @param comptroller Comptroller address of the pool
     * @custom:event Emits AuctionClosed event on successful close
     */
    function closeAuction(address comptroller) external nonReentrant {
        Auction storage auction = auctions[comptroller];

        require(_isStarted(auction), "no on-going auction");
        require(
            getBlockNumberOrTimestamp() > auction.highestBidBlockOrTimestamp + nextBidderBlockLimit &&
                auction.highestBidder != address(0),
            "waiting for next bidder. cannot close auction"
        );

        uint256 marketsCount = auction.markets.length;
        uint256[] memory marketsDebt = new uint256[](marketsCount);

        auction.status = AuctionStatus.ENDED;

        for (uint256 i; i < marketsCount; ++i) {
            VToken vToken = VToken(address(auction.markets[i]));
            IERC20Upgradeable erc20 = IERC20Upgradeable(address(vToken.underlying()));

            uint256 balanceBefore = erc20.balanceOf(address(auction.markets[i]));
            erc20.safeTransfer(address(auction.markets[i]), auction.bidAmount[auction.markets[i]]);
            uint256 balanceAfter = erc20.balanceOf(address(auction.markets[i]));
            marketsDebt[i] = balanceAfter - balanceBefore;

            auction.markets[i].badDebtRecovered(marketsDebt[i]);
        }

        uint256 riskFundBidAmount;

        if (auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
            riskFundBidAmount = auction.seizedRiskFund;
        } else {
            riskFundBidAmount = (auction.seizedRiskFund * auction.highestBidBps) / MAX_BPS;
        }

        address convertibleBaseAsset = riskFund.convertibleBaseAsset();

        uint256 transferredAmount = riskFund.transferReserveForAuction(comptroller, riskFundBidAmount);
        _transferOutOrTrackDebt(IERC20Upgradeable(convertibleBaseAsset), auction.highestBidder, riskFundBidAmount);

        emit AuctionClosed(
            comptroller,
            auction.startBlockOrTimestamp,
            auction.highestBidder,
            auction.highestBidBps,
            transferredAmount,
            auction.markets,
            marketsDebt
        );
    }

    /**
     * @notice Start a auction when there is not currently one active
     * @param comptroller Comptroller address of the pool
     * @custom:event Emits AuctionStarted event on success
     * @custom:event Errors if auctions are paused
     */
    function startAuction(address comptroller) external nonReentrant {
        require(!auctionsPaused, "Auctions are paused");
        _startAuction(comptroller);
    }

    /**
     * @notice Restart an auction
     * @param comptroller Address of the pool
     * @custom:event Emits AuctionRestarted event on successful restart
     */
    function restartAuction(address comptroller) external nonReentrant {
        Auction storage auction = auctions[comptroller];

        require(!auctionsPaused, "auctions are paused");
        require(_isStarted(auction), "no on-going auction");
        require(_isStale(auction), "you need to wait for more time for first bidder");

        auction.status = AuctionStatus.ENDED;

        emit AuctionRestarted(comptroller, auction.startBlockOrTimestamp);
        _startAuction(comptroller);
    }

    /**
     * @notice Update next bidder block or timestamp limit which is used determine when an auction can be closed
     * @param nextBidderBlockOrTimestampLimit_  New next bidder slot (block or second) limit
     * @custom:event Emits NextBidderBlockLimitUpdated on success
     * @custom:access Restricted by ACM
     */
    function updateNextBidderBlockLimit(uint256 nextBidderBlockOrTimestampLimit_) external {
        _checkAccessAllowed("updateNextBidderBlockLimit(uint256)");
        require(nextBidderBlockOrTimestampLimit_ != 0, "nextBidderBlockOrTimestampLimit_ must not be 0");

        emit NextBidderBlockLimitUpdated(nextBidderBlockLimit, nextBidderBlockOrTimestampLimit_);
        nextBidderBlockLimit = nextBidderBlockOrTimestampLimit_;
    }

    /**
     * @notice Updates the incentive BPS
     * @param incentiveBps_ New incentive BPS
     * @custom:event Emits IncentiveBpsUpdated on success
     * @custom:access Restricted by ACM
     */
    function updateIncentiveBps(uint256 incentiveBps_) external {
        _checkAccessAllowed("updateIncentiveBps(uint256)");
        require(incentiveBps_ != 0, "incentiveBps must not be 0");
        uint256 oldIncentiveBps = incentiveBps;
        incentiveBps = incentiveBps_;
        emit IncentiveBpsUpdated(oldIncentiveBps, incentiveBps_);
    }

    /**
     * @notice Update minimum pool bad debt to start auction
     * @param minimumPoolBadDebt_ Minimum bad debt in the base asset for a pool to start auction
     * @custom:event Emits MinimumPoolBadDebtUpdated on success
     * @custom:access Restricted by ACM
     */
    function updateMinimumPoolBadDebt(uint256 minimumPoolBadDebt_) external {
        _checkAccessAllowed("updateMinimumPoolBadDebt(uint256)");
        uint256 oldMinimumPoolBadDebt = minimumPoolBadDebt;
        minimumPoolBadDebt = minimumPoolBadDebt_;
        emit MinimumPoolBadDebtUpdated(oldMinimumPoolBadDebt, minimumPoolBadDebt_);
    }

    /**
     * @notice Update wait for first bidder block or timestamp count. If the first bid is not made within this limit, the auction is closed and needs to be restarted
     * @param waitForFirstBidder_  New wait for first bidder block or timestamp count
     * @custom:event Emits WaitForFirstBidderUpdated on success
     * @custom:access Restricted by ACM
     */
    function updateWaitForFirstBidder(uint256 waitForFirstBidder_) external {
        _checkAccessAllowed("updateWaitForFirstBidder(uint256)");
        uint256 oldWaitForFirstBidder = waitForFirstBidder;
        waitForFirstBidder = waitForFirstBidder_;
        emit WaitForFirstBidderUpdated(oldWaitForFirstBidder, waitForFirstBidder_);
    }

    /**
     * @notice Update the pool registry this shortfall supports
     * @dev After Pool Registry is deployed we need to set the pool registry address
     * @param poolRegistry_ Address of pool registry contract
     * @custom:event Emits PoolRegistryUpdated on success
     * @custom:access Restricted to owner
     * @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
     */
    function updatePoolRegistry(address poolRegistry_) external onlyOwner {
        ensureNonzeroAddress(poolRegistry_);
        address oldPoolRegistry = poolRegistry;
        poolRegistry = poolRegistry_;
        emit PoolRegistryUpdated(oldPoolRegistry, poolRegistry_);
    }

    /**
     * @notice Pause auctions. This disables starting new auctions but lets the current auction finishes
     * @custom:event Emits AuctionsPaused on success
     * @custom:error Errors is auctions are paused
     * @custom:access Restricted by ACM
     */
    function pauseAuctions() external {
        _checkAccessAllowed("pauseAuctions()");
        require(!auctionsPaused, "Auctions are already paused");
        auctionsPaused = true;
        emit AuctionsPaused(msg.sender);
    }

    /**
     * @notice Resume paused auctions.
     * @custom:event Emits AuctionsResumed on success
     * @custom:error Errors is auctions are active
     * @custom:access Restricted by ACM
     */
    function resumeAuctions() external {
        _checkAccessAllowed("resumeAuctions()");
        require(auctionsPaused, "Auctions are not paused");
        auctionsPaused = false;
        emit AuctionsResumed(msg.sender);
    }

    /**
     * @notice Start a auction when there is not currently one active
     * @param comptroller Comptroller address of the pool
     */
    function _startAuction(address comptroller) internal {
        PoolRegistryInterface.VenusPool memory pool = PoolRegistry(poolRegistry).getPoolByComptroller(comptroller);
        require(pool.comptroller == comptroller, "comptroller doesn't exist pool registry");

        Auction storage auction = auctions[comptroller];
        require(
            auction.status == AuctionStatus.NOT_STARTED || auction.status == AuctionStatus.ENDED,
            "auction is on-going"
        );

        auction.highestBidBps = 0;
        auction.highestBidBlockOrTimestamp = 0;

        uint256 marketsCount = auction.markets.length;
        for (uint256 i; i < marketsCount; ++i) {
            VToken vToken = auction.markets[i];
            auction.marketDebt[vToken] = 0;
        }

        delete auction.markets;

        VToken[] memory vTokens = _getAllMarkets(comptroller);
        marketsCount = vTokens.length;
        ResilientOracleInterface priceOracle = _getPriceOracle(comptroller);
        uint256 poolBadDebt;

        uint256[] memory marketsDebt = new uint256[](marketsCount);
        auction.markets = new VToken[](marketsCount);

        for (uint256 i; i < marketsCount; ++i) {
            uint256 marketBadDebt = vTokens[i].badDebt();

            priceOracle.updatePrice(address(vTokens[i]));
            uint256 usdValue = (priceOracle.getUnderlyingPrice(address(vTokens[i])) * marketBadDebt) / EXP_SCALE;

            poolBadDebt = poolBadDebt + usdValue;
            auction.markets[i] = vTokens[i];
            auction.marketDebt[vTokens[i]] = marketBadDebt;
            marketsDebt[i] = marketBadDebt;
        }

        require(poolBadDebt >= minimumPoolBadDebt, "pool bad debt is too low");

        priceOracle.updateAssetPrice(riskFund.convertibleBaseAsset());
        uint256 riskFundBalance = (priceOracle.getPrice(riskFund.convertibleBaseAsset()) *
            riskFund.getPoolsBaseAssetReserves(comptroller)) / EXP_SCALE;
        uint256 remainingRiskFundBalance = riskFundBalance;
        uint256 badDebtPlusIncentive = poolBadDebt + ((poolBadDebt * incentiveBps) / MAX_BPS);
        if (badDebtPlusIncentive >= riskFundBalance) {
            auction.startBidBps =
                (MAX_BPS * MAX_BPS * remainingRiskFundBalance) /
                (poolBadDebt * (MAX_BPS + incentiveBps));
            remainingRiskFundBalance = 0;
            auction.auctionType = AuctionType.LARGE_POOL_DEBT;
        } else {
            uint256 maxSeizeableRiskFundBalance = badDebtPlusIncentive;

            remainingRiskFundBalance = remainingRiskFundBalance - maxSeizeableRiskFundBalance;
            auction.auctionType = AuctionType.LARGE_RISK_FUND;
            auction.startBidBps = MAX_BPS;
        }

        auction.seizedRiskFund = riskFundBalance - remainingRiskFundBalance;
        auction.startBlockOrTimestamp = getBlockNumberOrTimestamp();
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);

        emit AuctionStarted(
            comptroller,
            auction.startBlockOrTimestamp,
            auction.auctionType,
            auction.markets,
            marketsDebt,
            auction.seizedRiskFund,
            auction.startBidBps
        );
    }

    /**
     * @dev Returns the price oracle of the pool
     * @param comptroller Address of the pool's comptroller
     * @return oracle The pool's price oracle
     */
    function _getPriceOracle(address comptroller) internal view returns (ResilientOracleInterface) {
        return ResilientOracleInterface(ComptrollerViewInterface(comptroller).oracle());
    }

    /**
     * @dev Returns all markets of the pool
     * @param comptroller Address of the pool's comptroller
     * @return markets The pool's markets as VToken array
     */
    function _getAllMarkets(address comptroller) internal view returns (VToken[] memory) {
        return ComptrollerInterface(comptroller).getAllMarkets();
    }

    /**
     * @dev Checks if the auction has started
     * @param auction The auction to query the status for
     * @return True if the auction has started
     */
    function _isStarted(Auction storage auction) internal view returns (bool) {
        return auction.status == AuctionStatus.STARTED;
    }

    /**
     * @dev Checks if the auction is stale, i.e. there's no bidder and the auction
     *   was started more than waitForFirstBidder blocks or seconds ago.
     * @param auction The auction to query the status for
     * @return True if the auction is stale
     */
    function _isStale(Auction storage auction) internal view returns (bool) {
        bool noBidder = auction.highestBidder == address(0);
        return noBidder && (getBlockNumberOrTimestamp() > auction.startBlockOrTimestamp + waitForFirstBidder);
    }
}

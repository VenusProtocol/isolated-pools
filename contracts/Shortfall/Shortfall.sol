/// @notice  SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@venusprotocol/oracle/contracts/PriceOracle.sol";

import "../VToken.sol";
import "../ComptrollerInterface.sol";
import "../RiskFund/IRiskFund.sol";
import "./IShortfall.sol";
import "../Pool/PoolRegistry.sol";
import "../Pool/PoolRegistryInterface.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

contract Shortfall is Ownable2StepUpgradeable, AccessControlledV8, ReentrancyGuardUpgradeable, IShortfall {
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
        uint256 startBlock;
        AuctionType auctionType;
        AuctionStatus status;
        VToken[] markets;
        uint256 seizedRiskFund;
        address highestBidder;
        uint256 highestBidBps;
        uint256 highestBidBlock;
        uint256 startBidBps;
        mapping(VToken => uint256) marketDebt;
    }

    /// @notice Pool registry address
    address public poolRegistry;

    /// @notice Risk fund address
    IRiskFund private riskFund;

    /// @notice Minimum USD debt in pool for shortfall to trigger
    uint256 public minimumPoolBadDebt;

    /// @notice Incentive to auction participants, initial value set to 1000 or 10%
    uint256 private incentiveBps;

    /// @notice Max basis points i.e., 100%
    uint256 private constant MAX_BPS = 10000;

    /// @notice Time to wait for next bidder. initially waits for 10 blocks
    uint256 public nextBidderBlockLimit;

    /// @notice Time to wait for first bidder. initially waits for 100 blocks
    uint256 public waitForFirstBidder;

    /// @notice base asset contract address
    address public convertibleBaseAsset;

    /// @notice Auctions for each pool
    mapping(address => Auction) public auctions;

    /// @notice Emitted when a auction starts
    event AuctionStarted(
        address indexed comptroller,
        uint256 auctionStartBlock,
        AuctionType auctionType,
        VToken[] markets,
        uint256[] marketsDebt,
        uint256 seizedRiskFund,
        uint256 startBidBps
    );

    /// @notice Emitted when a bid is placed
    event BidPlaced(address indexed comptroller, uint256 auctionStartBlock, uint256 bidBps, address indexed bidder);

    /// @notice Emitted when a auction is completed
    event AuctionClosed(
        address indexed comptroller,
        uint256 auctionStartBlock,
        address indexed highestBidder,
        uint256 highestBidBps,
        uint256 seizedRiskFind,
        VToken[] markets,
        uint256[] marketDebt
    );

    /// @notice Emitted when a auction is restarted
    event AuctionRestarted(address indexed comptroller, uint256 auctionStartBlock);

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when minimum pool bad debt is updated
    event MinimumPoolBadDebtUpdated(uint256 oldMinimumPoolBadDebt, uint256 newMinimumPoolBadDebt);

    /// @notice Emitted when wait for first bidder block count is updated
    event WaitForFirstBidderUpdated(uint256 oldWaitForFirstBidder, uint256 newWaitForFirstBidder);

    /// @notice Emitted when next bidder block limit is updated
    event NextBidderBlockLimitUpdated(uint256 oldNextBidderBlockLimit, uint256 newNextBidderBlockLimit);

    /// @notice Emitted when incentiveBps is updated
    event IncentiveBpsUpdated(uint256 oldIncentiveBps, uint256 newIncentiveBps);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Initalize the shortfall contract
     * @param convertibleBaseAsset_ Asset to swap the funds to
     * @param riskFund_ RiskFund contract address
     * @param minimumPoolBadDebt_ Minimum bad debt in base asset for a pool to start auction
     * @param accessControlManager_ AccessControlManager contract address
     */
    function initialize(
        address convertibleBaseAsset_,
        IRiskFund riskFund_,
        uint256 minimumPoolBadDebt_,
        address accessControlManager_
    ) external initializer {
        require(convertibleBaseAsset_ != address(0), "invalid base asset address");
        require(address(riskFund_) != address(0), "invalid risk fund address");
        require(minimumPoolBadDebt_ != 0, "invalid minimum pool bad debt");

        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
        minimumPoolBadDebt = minimumPoolBadDebt_;
        convertibleBaseAsset = convertibleBaseAsset_;
        riskFund = riskFund_;
        waitForFirstBidder = 100;
        nextBidderBlockLimit = 10;
        incentiveBps = 1000;
    }

    /**
     * @notice Place a bid greater than the previous in an ongoing auction
     * @param comptroller Comptroller address of the pool
     * @param bidBps The bid percent of the risk fund or bad debt depending on auction type
     * @custom:event Emits BidPlaced event on success
     */
    function placeBid(address comptroller, uint256 bidBps) external nonReentrant {
        Auction storage auction = auctions[comptroller];

        require(_isStarted(auction), "no on-going auction");
        require(!_isStale(auction), "auction is stale, restart it");
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

            if (auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                if (auction.highestBidder != address(0)) {
                    uint256 previousBidAmount = ((auction.marketDebt[auction.markets[i]] * auction.highestBidBps) /
                        MAX_BPS);
                    erc20.safeTransfer(auction.highestBidder, previousBidAmount);
                }

                uint256 currentBidAmount = ((auction.marketDebt[auction.markets[i]] * bidBps) / MAX_BPS);
                erc20.safeTransferFrom(msg.sender, address(this), currentBidAmount);
            } else {
                if (auction.highestBidder != address(0)) {
                    erc20.safeTransfer(auction.highestBidder, auction.marketDebt[auction.markets[i]]);
                }

                erc20.safeTransferFrom(msg.sender, address(this), auction.marketDebt[auction.markets[i]]);
            }
        }

        auction.highestBidder = msg.sender;
        auction.highestBidBps = bidBps;
        auction.highestBidBlock = block.number;

        emit BidPlaced(comptroller, auction.startBlock, bidBps, msg.sender);
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
            block.number > auction.highestBidBlock + nextBidderBlockLimit && auction.highestBidder != address(0),
            "waiting for next bidder. cannot close auction"
        );

        uint256 marketsCount = auction.markets.length;
        uint256[] memory marketsDebt = new uint256[](marketsCount);

        auction.status = AuctionStatus.ENDED;

        for (uint256 i; i < marketsCount; ++i) {
            VToken vToken = VToken(address(auction.markets[i]));
            IERC20Upgradeable erc20 = IERC20Upgradeable(address(vToken.underlying()));

            if (auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                uint256 bidAmount = ((auction.marketDebt[auction.markets[i]] * auction.highestBidBps) / MAX_BPS);
                erc20.safeTransfer(address(auction.markets[i]), bidAmount);
                marketsDebt[i] = bidAmount;
            } else {
                erc20.safeTransfer(address(auction.markets[i]), auction.marketDebt[auction.markets[i]]);
                marketsDebt[i] = auction.marketDebt[auction.markets[i]];
            }

            auction.markets[i].badDebtRecovered(marketsDebt[i]);
        }

        uint256 riskFundBidAmount;

        if (auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
            riskFundBidAmount = auction.seizedRiskFund;
        } else {
            riskFundBidAmount = (auction.seizedRiskFund * auction.highestBidBps) / MAX_BPS;
        }

        uint256 transferredAmount = riskFund.transferReserveForAuction(comptroller, riskFundBidAmount);
        IERC20Upgradeable(convertibleBaseAsset).safeTransfer(auction.highestBidder, riskFundBidAmount);

        emit AuctionClosed(
            comptroller,
            auction.startBlock,
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
     */
    function startAuction(address comptroller) external {
        _startAuction(comptroller);
    }

    /**
     * @notice Restart an auction
     * @param comptroller Address of the pool
     * @custom:event Emits AuctionRestarted event on successful restart
     */
    function restartAuction(address comptroller) external {
        Auction storage auction = auctions[comptroller];

        require(_isStarted(auction), "no on-going auction");
        require(_isStale(auction), "you need to wait for more time for first bidder");

        auction.status = AuctionStatus.ENDED;

        emit AuctionRestarted(comptroller, auction.startBlock);
        _startAuction(comptroller);
    }

    /**
     * @notice Update next bidder block limit which is used determine when an auction can be closed
     * @param _nextBidderBlockLimit  New next bidder block limit
     * @custom:event Emits NextBidderBlockLimitUpdated on success
     * @custom:access Restricted to owner
     */
    function updateNextBidderBlockLimit(uint256 _nextBidderBlockLimit) external {
        _checkAccessAllowed("updateNextBidderBlockLimit(uint256)");
        require(_nextBidderBlockLimit != 0, "_nextBidderBlockLimit must not be 0");
        uint256 oldNextBidderBlockLimit = nextBidderBlockLimit;
        nextBidderBlockLimit = _nextBidderBlockLimit;
        emit NextBidderBlockLimitUpdated(oldNextBidderBlockLimit, _nextBidderBlockLimit);
    }

    /**
     * @notice Updates the inventive BPS
     * @param _incentiveBps New incentive BPS
     * @custom:event Emits IncentiveBpsUpdated on success
     * @custom:access Restricted to owner
     */
    function updateIncentiveBps(uint256 _incentiveBps) external {
        _checkAccessAllowed("updateIncentiveBps(uint256)");
        require(_incentiveBps != 0, "incentiveBps must not be 0");
        uint256 oldIncentiveBps = incentiveBps;
        incentiveBps = _incentiveBps;
        emit IncentiveBpsUpdated(oldIncentiveBps, _incentiveBps);
    }

    /**
     * @notice Update minimum pool bad debt to start auction
     * @param _minimumPoolBadDebt Minimum bad debt in BUSD for a pool to start auction
     * @custom:event Emits MinimumPoolBadDebtUpdated on success
     * @custom:access Restricted to owner
     */
    function updateMinimumPoolBadDebt(uint256 _minimumPoolBadDebt) external {
        _checkAccessAllowed("updateMinimumPoolBadDebt(uint256)");
        uint256 oldMinimumPoolBadDebt = minimumPoolBadDebt;
        minimumPoolBadDebt = _minimumPoolBadDebt;
        emit MinimumPoolBadDebtUpdated(oldMinimumPoolBadDebt, _minimumPoolBadDebt);
    }

    /**
     * @notice Update wait for first bidder block count. If the first bid is not made within this limit, the auction is closed and needs to be restarted
     * @param _waitForFirstBidder  New wait for first bidder block count
     * @custom:event Emits WaitForFirstBidderUpdated on success
     * @custom:access Restricted to owner
     */
    function updateWaitForFirstBidder(uint256 _waitForFirstBidder) external {
        _checkAccessAllowed("updateWaitForFirstBidder(uint256)");
        uint256 oldWaitForFirstBidder = waitForFirstBidder;
        waitForFirstBidder = _waitForFirstBidder;
        emit WaitForFirstBidderUpdated(oldWaitForFirstBidder, _waitForFirstBidder);
    }

    /**
     * @notice Update the pool registry this shortfall supports
     * @dev After Pool Registry is deployed we need to set the pool registry address
     * @param _poolRegistry Address of pool registry contract
     * @custom:event Emits PoolRegistryUpdated on success
     * @custom:access Restricted to owner
     */
    function updatePoolRegistry(address _poolRegistry) external onlyOwner {
        require(_poolRegistry != address(0), "invalid address");
        address oldPoolRegistry = poolRegistry;
        poolRegistry = _poolRegistry;
        emit PoolRegistryUpdated(oldPoolRegistry, _poolRegistry);
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
            (auction.startBlock == 0 && auction.status == AuctionStatus.NOT_STARTED) ||
                auction.status == AuctionStatus.ENDED,
            "auction is on-going"
        );

        auction.highestBidBps = 0;
        auction.highestBidBlock = 0;

        uint256 marketsCount = auction.markets.length;
        for (uint256 i; i < marketsCount; ++i) {
            VToken vToken = auction.markets[i];
            auction.marketDebt[vToken] = 0;
        }

        delete auction.markets;

        VToken[] memory vTokens = _getAllMarkets(comptroller);
        marketsCount = vTokens.length;
        PriceOracle priceOracle = _getPriceOracle(comptroller);
        uint256 poolBadDebt;

        uint256[] memory marketsDebt = new uint256[](marketsCount);
        auction.markets = new VToken[](marketsCount);

        for (uint256 i; i < marketsCount; ++i) {
            uint256 marketBadDebt = vTokens[i].badDebt();

            priceOracle.updatePrice(address(vTokens[i]));
            uint256 usdValue = (priceOracle.getUnderlyingPrice(address(vTokens[i])) * marketBadDebt) / 1e18;

            poolBadDebt = poolBadDebt + usdValue;
            auction.markets[i] = vTokens[i];
            auction.marketDebt[vTokens[i]] = marketBadDebt;
            marketsDebt[i] = marketBadDebt;
        }

        require(poolBadDebt >= minimumPoolBadDebt, "pool bad debt is too low");

        uint256 riskFundBalance = riskFund.poolReserves(comptroller);
        uint256 remainingRiskFundBalance = riskFundBalance;
        uint256 incentivizedRiskFundBalance = poolBadDebt + ((poolBadDebt * incentiveBps) / MAX_BPS);
        if (incentivizedRiskFundBalance >= riskFundBalance) {
            auction.startBidBps =
                (MAX_BPS * MAX_BPS * remainingRiskFundBalance) /
                (poolBadDebt * (MAX_BPS + incentiveBps));
            remainingRiskFundBalance = 0;
            auction.auctionType = AuctionType.LARGE_POOL_DEBT;
        } else {
            uint256 maxSeizeableRiskFundBalance = incentivizedRiskFundBalance;

            remainingRiskFundBalance = remainingRiskFundBalance - maxSeizeableRiskFundBalance;
            auction.auctionType = AuctionType.LARGE_RISK_FUND;
            auction.startBidBps = MAX_BPS;
        }

        auction.seizedRiskFund = riskFundBalance - remainingRiskFundBalance;
        auction.startBlock = block.number;
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);

        emit AuctionStarted(
            comptroller,
            auction.startBlock,
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
    function _getPriceOracle(address comptroller) internal view returns (PriceOracle) {
        return PriceOracle(ComptrollerViewInterface(comptroller).oracle());
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
     */
    function _isStarted(Auction storage auction) internal view returns (bool) {
        return auction.startBlock != 0 && auction.status == AuctionStatus.STARTED;
    }

    /**
     * @dev Checks if the auction is stale, i.e. there's no bidder and the auction
     *   was started more than waitForFirstBidder blocks ago.
     * @param auction The auction to query the status for
     */
    function _isStale(Auction storage auction) internal view returns (bool) {
        bool noBidder = auction.highestBidder == address(0);
        return noBidder && (block.number > auction.startBlock + waitForFirstBidder);
    }
}

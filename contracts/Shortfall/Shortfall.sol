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

contract Shortfall is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable, IShortfall {
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

    /// @notice Incentive to auction participants.
    uint256 private constant incentiveBps = 1000; /// @notice 10%

    /// @notice Max basis points i.e., 100%
    uint256 private constant MAX_BPS = 10000;

    /// @notice Time to wait for next bidder. wait for 10 blocks
    uint256 public constant nextBidderBlockLimit = 10;

    /// @notice Time to wait for first bidder. wait for 100 blocks
    uint256 public constant waitForFirstBidder = 100;

    /// @notice base asset contract address
    address public convertibleBaseAsset;

    /// @notice Auctions for each pool
    mapping(address => Auction) public auctions;

    /// @notice Emitted when a auction starts
    event AuctionStarted(
        address indexed comptroller,
        uint256 startBlock,
        AuctionType auctionType,
        VToken[] markets,
        uint256[] marketsDebt,
        uint256 seizedRiskFund,
        uint256 startBidBps
    );

    /// @notice Emitted when a bid is placed
    event BidPlaced(address indexed comptroller, uint256 bidBps, address indexed bidder);

    /// @notice Emitted when a auction is completed
    event AuctionClosed(
        address indexed comptroller,
        address indexed highestBidder,
        uint256 highestBidBps,
        uint256 seizedRiskFind,
        VToken[] markets,
        uint256[] marketDebt
    );

    /// @notice Emitted when a auction is restarted
    event AuctionRestarted(address indexed comptroller);

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when minimum pool bad debt is updated
    event MinimumPoolBadDebtUpdated(uint256 oldMinimumPoolBadDebt, uint256 newMinimumPoolBadDebt);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Initalize the shortfall contract
     * @param _minimumPoolBadDebt Minimum bad debt in BUSD for a pool to start auction
     */
    function initialize(
        address _convertibleBaseAsset,
        IRiskFund _riskFund,
        uint256 _minimumPoolBadDebt
    ) external initializer {
        require(_convertibleBaseAsset != address(0), "invalid base asset address");
        require(address(_riskFund) != address(0), "invalid risk fund address");
        require(_minimumPoolBadDebt != 0, "invalid minimum pool bad debt");

        __Ownable2Step_init();
        __ReentrancyGuard_init();
        minimumPoolBadDebt = _minimumPoolBadDebt;
        convertibleBaseAsset = _convertibleBaseAsset;
        riskFund = _riskFund;
    }

    /**
     * @notice Place a bid greater than the previous in an ongoing auction
     * @param comptroller Comptroller address of the pool
     * @param bidBps The bid percent of the risk fund or bad debt depending on auction type
     * @custom:event Emits BidPlaced event on success
     */
    function placeBid(address comptroller, uint256 bidBps) external nonReentrant {
        Auction storage auction = auctions[comptroller];

        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
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

        emit BidPlaced(comptroller, bidBps, msg.sender);
    }

    /**
     * @notice Close an auction
     * @param comptroller Comptroller address of the pool
     * @custom:event Emits AuctionClosed event on successful close
     */
    function closeAuction(address comptroller) external nonReentrant {
        Auction storage auction = auctions[comptroller];

        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
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
            auction.highestBidder,
            auction.highestBidBps,
            transferredAmount,
            auction.markets,
            marketsDebt
        );
    }

    /**
     * @notice Restart an auction
     * @param comptroller Address of the pool
     * @custom:event Emits AuctionRestarted event on successful restart
     */
    function restartAuction(address comptroller) external {
        Auction storage auction = auctions[comptroller];

        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(
            block.number > auction.startBlock + waitForFirstBidder && auction.highestBidder == address(0),
            "you need to wait for more time for first bidder"
        );

        auction.status = AuctionStatus.ENDED;

        emit AuctionRestarted(comptroller);
        startAuction(comptroller);
    }

    /**
     * @notice Update minimum pool bad debt to start auction
     * @param _minimumPoolBadDebt Minimum bad debt in BUSD for a pool to start auction
     * @custom:event Emits MinimumPoolBadDebtUpdated on success
     * @custom:access Restricted to owner
     */
    function updateMinimumPoolBadDebt(uint256 _minimumPoolBadDebt) public onlyOwner {
        uint256 oldMinimumPoolBadDebt = minimumPoolBadDebt;
        minimumPoolBadDebt = _minimumPoolBadDebt;
        emit MinimumPoolBadDebtUpdated(oldMinimumPoolBadDebt, _minimumPoolBadDebt);
    }

    /**
     * @notice Sets the pool registry this shortfall supports
     * @dev After Pool Registry is deployed we need to set the pool registry address
     * @param _poolRegistry Address of pool registry contract
     * @custom:event Emits PoolRegistryUpdated on success
     * @custom:access Restricted to owner
     */
    function setPoolRegistry(address _poolRegistry) public onlyOwner {
        require(_poolRegistry != address(0), "invalid address");
        address oldPoolRegistry = poolRegistry;
        poolRegistry = _poolRegistry;
        emit PoolRegistryUpdated(oldPoolRegistry, _poolRegistry);
    }

    /**
     * @notice Start a auction when there is not currently one active
     * @param comptroller Comptroller address of the pool
     * @custom:event Emits AuctionStarted event on success
     * @custom:access Restricted to owner
     */
    function startAuction(address comptroller) public onlyOwner {
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

        uint256 riskFundBalance = riskFund.getPoolReserve(comptroller);
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
}

/// @notice  SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../VToken.sol";
import "../VBep20.sol";
import "../PriceOracle.sol";
import "../ComptrollerInterface.sol";
import "./IRiskFund.sol";

contract Shortfall is OwnableUpgradeable {

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
        mapping (VToken => uint256) marketDebt;
    }

    /// @notice Emitted when a auction starts
    event AuctionStarted(
        uint256 poolId,
        uint256 startBlock,
        AuctionType auctionType,
        VToken[] markets,
        uint256[] marketsDebt,
        uint256 seizedRiskFund,
        uint256 startBidBps
    );

    /// @notice Emitted when a bid is placed
    event BidPlaced(
        uint256 poolId,
        uint256 bidBps,
        address bidder
    );

    /// @notice Emitted when a auction is completed
    event AuctionClosed(
        uint256 poolId,
        address highestBidder,
        uint256 highestBidBps,
        uint256 seizedRiskFind,
        VToken[] markets,
        uint256[] marketDebt
    );

    /// @notice Emitted when a auction is restarted
    event AuctionRestarted(
        uint256 poolId
    );

    /// @notice Pool ID to comptroller address mapping
    mapping (uint256 => ComptrollerInterface) public comptrollers;

    /// @notice Pool registry address
    address public poolRegistry;

    /// @notice Risk fund address
    IRiskFund immutable private riskFund;

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

    /// @notice BUSD contract address
    IERC20 private immutable BUSD;

    /// @notice Auctions for each pool
    mapping (uint256 => Auction) public auctions;

    /**
     * @notice Constructor
     * @param _BUSD The address of the BUSD contract
     * @param _riskFund The address of the risk fund
     */
    constructor(IERC20 _BUSD, IRiskFund _riskFund) {
        BUSD = _BUSD;
        riskFund = _riskFund;
    }

    /**
     * @notice Initalize the shortfall contract
     * @param _minimumPoolBadDebt Minimum bad debt in BUSD for a pool to start auction
     */
    function initialize(uint256 _minimumPoolBadDebt) public initializer {
        __Ownable_init();
        minimumPoolBadDebt = _minimumPoolBadDebt;
    }

    /**
     * @notice Update minimum pool bad debt to start auction
     * @param _minimumPoolBadDebt Minimum bad debt in BUSD for a pool to start auction
     */
    function updateMinimumPoolBadDebt(uint256 _minimumPoolBadDebt) public onlyOwner {
        minimumPoolBadDebt = _minimumPoolBadDebt;
    }

    /**
     * @notice After Pool Registry is deployed we need to set the pool registry address
     * @param _poolRegistry Address of pool registry contract
     */
    function setPoolRegistry(address _poolRegistry) public onlyOwner {
        require(_poolRegistry != address(0), "invalid address");
        poolRegistry = _poolRegistry;
    }

    /**
     * @notice Modifier to allow only pool registry to call functions
     */
    modifier onlyPoolRegistry {
        require(msg.sender == poolRegistry, "caller is not pool registry");
        _;
    }

    /**
     * @notice Called by pool registry contract whenever a new isolated pool is created
     * @param poolId ID of the new pool
     * @param _comptroller Comptroller address of the new pool
     */
    function setPoolComptroller(uint256 poolId, ComptrollerInterface _comptroller) public onlyPoolRegistry {
        require(address(_comptroller) != address(0), "invalid address");
        comptrollers[poolId] = _comptroller;
    }

    /**
     * @notice Start a auction
     * @param poolId ID of the pool
     */
    function startAuction(uint256 poolId) public onlyOwner {
        Auction storage auction = auctions[poolId];
        ComptrollerInterface comptroller = comptrollers[poolId];

        require((auction.startBlock == 0 && auction.status == AuctionStatus.NOT_STARTED)|| auction.status == AuctionStatus.ENDED, "auction is on-going");

        for (uint256 i = 0; i < auction.markets.length; i++) {
            VToken vToken = auction.markets[i];
            auction.marketDebt[vToken] = 0;
            auction.highestBidBps = 0;
            auction.highestBidBlock = 0;
        }

        delete auction.markets;

        VToken[] memory vTokens = comptroller.getAllMarkets();
        PriceOracle priceOracle = PriceOracle(ComptrollerViewInterface(address(comptroller)).oracle()); 
        uint256 poolBadDebt = 0;       

        uint256[] memory marketsDebt = new uint256[](vTokens.length);
        auction.markets = new VToken[](vTokens.length);

        for (uint256 i = 0; i < vTokens.length; i++) {
            uint256 marketBadDebt = vTokens[i].badDebt();
            uint256 usdValue =  (priceOracle.getUnderlyingPrice(vTokens[i]) * marketBadDebt * (10 ** (18 - vTokens[i].decimals()))) / 10 ** 18;

            poolBadDebt = poolBadDebt + usdValue;
            auction.markets[i] = vTokens[i];
            auction.marketDebt[vTokens[i]] = marketBadDebt;
            marketsDebt[i] = marketBadDebt;
        }

        require(poolBadDebt >= minimumPoolBadDebt, "pool bad debt is too low");
        
        uint256 riskFundBalance = riskFund.getPoolReserve(poolId);
        uint256 remainingRiskFundBalance = riskFundBalance;

        if (poolBadDebt + ((poolBadDebt * incentiveBps) / MAX_BPS) >= riskFundBalance) {
            auction.startBidBps =  ((MAX_BPS - incentiveBps) * remainingRiskFundBalance) / poolBadDebt;
            remainingRiskFundBalance = 0;
            auction.auctionType = AuctionType.LARGE_POOL_DEBT;
        } else {
            uint256 maxSeizeableRiskFundBalance = remainingRiskFundBalance;
            uint256 incentivizedRiskFundBalance = (poolBadDebt * ((poolBadDebt * incentiveBps) / MAX_BPS)) / remainingRiskFundBalance;

            if(incentivizedRiskFundBalance < remainingRiskFundBalance) {
                maxSeizeableRiskFundBalance = incentivizedRiskFundBalance;
            }

            remainingRiskFundBalance = remainingRiskFundBalance - maxSeizeableRiskFundBalance;
            auction.auctionType = AuctionType.LARGE_RISK_FUND;
            auction.startBidBps = MAX_BPS;
        }

        auction.seizedRiskFund = riskFundBalance - remainingRiskFundBalance;
        auction.startBlock = block.number;
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);

        emit AuctionStarted(
            poolId,
            auction.startBlock,
            auction.auctionType,
            auction.markets,
            marketsDebt,
            auction.seizedRiskFund,
            auction.startBidBps
        );
    }

    /**
     * @notice Place a bid in a auction
     * @param poolId ID of the pool
     * @param bidBps The bid m% or n%
     */
    function placeBid(
        uint256 poolId,
        uint256 bidBps
    ) external {
        Auction storage auction = auctions[poolId];

        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(bidBps <= MAX_BPS, "basis points cannot be more than 10000");
        require(
            (auction.auctionType == AuctionType.LARGE_POOL_DEBT &&
            (
                (auction.highestBidder != address(0) && bidBps > auction.highestBidBps) ||
                (auction.highestBidder == address(0) && bidBps >= auction.startBidBps)
            )) ||
            (auction.auctionType == AuctionType.LARGE_RISK_FUND && 
            (
                (auction.highestBidder != address(0) && bidBps < auction.highestBidBps) ||
                (auction.highestBidder == address(0) && bidBps <= auction.startBidBps)
            )),
            "your bid is not the highest"
        );

        for (uint256 i = 0; i < auction.markets.length; i++) {
            VBep20 vBep20 = VBep20(address(auction.markets[i]));
            IERC20 erc20 = IERC20(address(vBep20.underlying()));

            if(auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                if (auction.highestBidder != address(0)) {
                    uint256 previousBidAmount = ((auction.marketDebt[auction.markets[i]] * auction.highestBidBps)/MAX_BPS);
                    erc20.transfer(auction.highestBidder, previousBidAmount);
                }

                uint256 currentBidAmount = ((auction.marketDebt[auction.markets[i]] * bidBps)/MAX_BPS);
                erc20.transferFrom(msg.sender, address(this), currentBidAmount);
            } else {
                if (auction.highestBidder != address(0)) {
                    erc20.transfer(auction.highestBidder, auction.marketDebt[auction.markets[i]]);
                }
                
                erc20.transferFrom(msg.sender, address(this), auction.marketDebt[auction.markets[i]]);
            }
        }

        auction.highestBidder = msg.sender;
        auction.highestBidBps = bidBps;
        auction.highestBidBlock = block.number;

        emit BidPlaced(poolId, bidBps, msg.sender);
    }

    /**
     * @notice Close an auction
     * @param poolId ID of the pool
     */
    function closeAuction(uint256 poolId) external {
        Auction storage auction = auctions[poolId];

        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(block.number > auction.highestBidBlock + nextBidderBlockLimit && auction.highestBidder != address(0), "waiting for next bidder. cannot close auction" );
        
        uint256[] memory marketsDebt = new uint256[](auction.markets.length);

        for (uint256 i = 0; i < auction.markets.length; i++) {
            VBep20 vBep20 = VBep20(address(auction.markets[i]));
            IERC20 erc20 = IERC20(address(vBep20.underlying()));

            if(auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                uint256 bidAmount = ((auction.marketDebt[auction.markets[i]] * auction.highestBidBps)/MAX_BPS);
                erc20.transfer(address(auction.markets[i]), bidAmount);
                auction.markets[i].badDebtRecovered(bidAmount);
                marketsDebt[i] = bidAmount;
            } else {
                erc20.transfer(address(auction.markets[i]), auction.marketDebt[auction.markets[i]]);
                auction.markets[i].badDebtRecovered(auction.marketDebt[auction.markets[i]]);
                marketsDebt[i] = auction.marketDebt[auction.markets[i]];
            }
        }

        uint256 riskFundBidAmount = auction.seizedRiskFund;

        if(auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
            riskFund.transferReserveForAuction(poolId, riskFundBidAmount);
            BUSD.transfer(auction.highestBidder, riskFundBidAmount);
        } else {
            riskFundBidAmount = (auction.seizedRiskFund * auction.highestBidBps) / MAX_BPS;
            BUSD.transfer(auction.highestBidder, riskFundBidAmount);

            uint256 remainingRiskFundSeizedAmount = auction.seizedRiskFund - riskFundBidAmount;
            riskFund.transferReserveForAuction(poolId, auction.seizedRiskFund - remainingRiskFundSeizedAmount);
            BUSD.transfer(auction.highestBidder, auction.seizedRiskFund - remainingRiskFundSeizedAmount);
        }

        auction.status = AuctionStatus.ENDED;

        emit AuctionClosed(
            poolId,
            auction.highestBidder,
            auction.highestBidBps,
            riskFundBidAmount,
            auction.markets,
            marketsDebt
        );
    }

    /**
     * @notice Restart an auction
     * @param poolId ID of the pool
     */
    function restartAuction(uint256 poolId) external {
        Auction storage auction = auctions[poolId];

        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(block.number > auction.startBlock + waitForFirstBidder && auction.highestBidder == address(0), "you need to wait for more time for first bidder" );

        auction.status = AuctionStatus.ENDED;

        emit AuctionRestarted(poolId);
        startAuction(poolId);
    }
}
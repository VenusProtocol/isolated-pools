// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../ExponentialNoError.sol";
import "../VToken.sol";
import "../Comptroller.sol";
import "../MaxLoopsLimitHelper.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

contract RewardsDistributor is ExponentialNoError, Ownable2StepUpgradeable, AccessControlledV8, MaxLoopsLimitHelper {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct RewardToken {
        // The market's last updated rewardTokenBorrowIndex or rewardTokenSupplyIndex
        uint224 index;
        // The block number the index was last updated at
        uint32 block;
    }

    /// @notice The REWARD TOKEN market supply state for each market
    mapping(address => RewardToken) public rewardTokenSupplyState;

    /// @notice The REWARD TOKEN borrow index for each market for each supplier as of the last time they accrued REWARD TOKEN
    mapping(address => mapping(address => uint256)) public rewardTokenSupplierIndex;

    /// @notice The initial REWARD TOKEN index for a market
    uint224 public constant rewardTokenInitialIndex = 1e36;

    /// @notice The REWARD TOKEN accrued but not yet transferred to each user
    mapping(address => uint256) public rewardTokenAccrued;

    /// @notice The rate at which rewardToken is distributed to the corresponding borrow market (per block)
    mapping(address => uint256) public rewardTokenBorrowSpeeds;

    /// @notice The rate at which rewardToken is distributed to the corresponding supply market (per block)
    mapping(address => uint256) public rewardTokenSupplySpeeds;

    /// @notice The REWARD TOKEN market borrow state for each market
    mapping(address => RewardToken) public rewardTokenBorrowState;

    /// @notice The portion of REWARD TOKEN that each contributor receives per block
    mapping(address => uint256) public rewardTokenContributorSpeeds;

    /// @notice Last block at which a contributor's REWARD TOKEN rewards have been allocated
    mapping(address => uint256) public lastContributorBlock;

    /// @notice The REWARD TOKEN borrow index for each market for each borrower as of the last time they accrued REWARD TOKEN
    mapping(address => mapping(address => uint256)) public rewardTokenBorrowerIndex;

    Comptroller private comptroller;

    IERC20Upgradeable public rewardToken;

    /// @notice Emitted when REWARD TOKEN is distributed to a supplier
    event DistributedSupplierRewardToken(
        VToken indexed vToken,
        address indexed supplier,
        uint256 rewardTokenDelta,
        uint256 rewardTokenTotal,
        uint256 rewardTokenSupplyIndex
    );

    /// @notice Emitted when REWARD TOKEN is distributed to a borrower
    event DistributedBorrowerRewardToken(
        VToken indexed vToken,
        address indexed borrower,
        uint256 rewardTokenDelta,
        uint256 rewardTokenTotal,
        uint256 rewardTokenBorrowIndex
    );

    /// @notice Emitted when a new supply-side REWARD TOKEN speed is calculated for a market
    event RewardTokenSupplySpeedUpdated(VToken indexed vToken, uint256 newSpeed);

    /// @notice Emitted when a new borrow-side REWARD TOKEN speed is calculated for a market
    event RewardTokenBorrowSpeedUpdated(VToken indexed vToken, uint256 newSpeed);

    /// @notice Emitted when REWARD TOKEN is granted by admin
    event RewardTokenGranted(address recipient, uint256 amount);

    /// @notice Emitted when a new REWARD TOKEN speed is set for a contributor
    event ContributorRewardTokenSpeedUpdated(address indexed contributor, uint256 newSpeed);

    /// @notice Emitted when a market is initialized
    event MarketInitialized(address vToken);

    /// @notice Emitted when a reward token supply index is updated
    event RewardTokenSupplyIndexUpdated(address vToken);

    /// @notice Emitted when a reward token borrow index is updated
    event RewardTokenBorrowIndexUpdated(address vToken, Exp marketBorrowIndex);

    /// @notice Emitted when a reward for contributor is updated
    event ContributorRewardsUpdated(address contributor, uint256 rewardAccrued);

    modifier onlyComptroller() {
        require(address(comptroller) == msg.sender, "Only comptroller can call this function");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     */
    function initialize(
        Comptroller comptroller_,
        IERC20Upgradeable rewardToken_,
        uint256 loopsLimit_,
        address accessControlManager_
    ) external initializer {
        comptroller = comptroller_;
        rewardToken = rewardToken_;
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);

        _setMaxLoopsLimit(loopsLimit_);
    }

    function initializeMarket(address vToken) external onlyComptroller {
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");

        RewardToken storage supplyState = rewardTokenSupplyState[vToken];
        RewardToken storage borrowState = rewardTokenBorrowState[vToken];

        /*
         * Update market state indices
         */
        if (supplyState.index == 0) {
            // Initialize supply state index with default value
            supplyState.index = rewardTokenInitialIndex;
        }

        if (borrowState.index == 0) {
            // Initialize borrow state index with default value
            borrowState.index = rewardTokenInitialIndex;
        }

        /*
         * Update market state block numbers
         */
        supplyState.block = borrowState.block = blockNumber;

        emit MarketInitialized(vToken);
    }

    /*** Reward Token Distribution ***/

    /**
     * @notice Calculate reward token accrued by a borrower and possibly transfer it to them
     *         Borrowers will begin to accrue after the first interaction with the protocol.
     * @dev This function should only be called when the user has a borrow position in the market
     *      (e.g. Comptroller.preBorrowHook, and Comptroller.preRepayHook)
     *      We avoid an external call to check if they are in the market to save gas because this function is called in many places.
     * @param vToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute REWARD TOKEN to
     */
    function distributeBorrowerRewardToken(
        address vToken,
        address borrower,
        Exp memory marketBorrowIndex
    ) external onlyComptroller {
        _distributeBorrowerRewardToken(vToken, borrower, marketBorrowIndex);
    }

    function updateRewardTokenSupplyIndex(address vToken) external onlyComptroller {
        _updateRewardTokenSupplyIndex(vToken);
    }

    /**
     * @notice Transfer REWARD TOKEN to the recipient.
     * @dev Note: If there is not enough REWARD TOKEN, we do not perform the transfer all.
     * @param recipient The address of the recipient to transfer REWARD TOKEN to
     * @param amount The amount of REWARD TOKEN to (possibly) transfer
     */
    function grantRewardToken(address recipient, uint256 amount) external onlyOwner {
        uint256 amountLeft = _grantRewardToken(recipient, amount);
        require(amountLeft == 0, "insufficient rewardToken for grant");
        emit RewardTokenGranted(recipient, amount);
    }

    function updateRewardTokenBorrowIndex(address vToken, Exp memory marketBorrowIndex) external onlyComptroller {
        _updateRewardTokenBorrowIndex(vToken, marketBorrowIndex);
    }

    /**
     * @notice Set REWARD TOKEN borrow and supply speeds for the specified markets.
     * @param vTokens The markets whose REWARD TOKEN speed to update.
     * @param supplySpeeds New supply-side REWARD TOKEN speed for the corresponding market.
     * @param borrowSpeeds New borrow-side REWARD TOKEN speed for the corresponding market.
     */
    function setRewardTokenSpeeds(
        VToken[] memory vTokens,
        uint256[] memory supplySpeeds,
        uint256[] memory borrowSpeeds
    ) external {
        _checkAccessAllowed("setRewardTokenSpeeds(address[],uint256[],uint256[])");
        uint256 numTokens = vTokens.length;
        require(
            numTokens == supplySpeeds.length && numTokens == borrowSpeeds.length,
            "RewardsDistributor::setRewardTokenSpeeds invalid input"
        );

        for (uint256 i; i < numTokens; ++i) {
            _setRewardTokenSpeed(vTokens[i], supplySpeeds[i], borrowSpeeds[i]);
        }
    }

    /**
     * @notice Set REWARD TOKEN speed for a single contributor.
     * @param contributor The contributor whose REWARD TOKEN speed to update
     * @param rewardTokenSpeed New REWARD TOKEN speed for contributor
     */
    function setContributorRewardTokenSpeed(address contributor, uint256 rewardTokenSpeed) external onlyOwner {
        // note that REWARD TOKEN speed could be set to 0 to halt liquidity rewards for a contributor
        updateContributorRewards(contributor);
        if (rewardTokenSpeed == 0) {
            // release storage
            delete lastContributorBlock[contributor];
        } else {
            lastContributorBlock[contributor] = getBlockNumber();
        }
        rewardTokenContributorSpeeds[contributor] = rewardTokenSpeed;

        emit ContributorRewardTokenSpeedUpdated(contributor, rewardTokenSpeed);
    }

    function distributeSupplierRewardToken(address vToken, address supplier) external onlyComptroller {
        _distributeSupplierRewardToken(vToken, supplier);
    }

    /**
     * @notice Claim all the rewardToken accrued by holder in all markets.
     * @param holder The address to claim REWARD TOKEN for
     */
    function claimRewardToken(address holder) external {
        return claimRewardToken(holder, comptroller.getAllMarkets());
    }

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param limit Limit for the max loops can execute at a time
     */
    function setMaxLoopsLimit(uint256 limit) external onlyOwner {
        _setMaxLoopsLimit(limit);
    }

    /**
     * @notice Calculate additional accrued REWARD TOKEN for a contributor since last accrual.
     * @param contributor The address to calculate contributor rewards for
     */
    function updateContributorRewards(address contributor) public {
        uint256 rewardTokenSpeed = rewardTokenContributorSpeeds[contributor];
        uint256 blockNumber = getBlockNumber();
        uint256 deltaBlocks = sub_(blockNumber, lastContributorBlock[contributor]);
        if (deltaBlocks > 0 && rewardTokenSpeed > 0) {
            uint256 newAccrued = mul_(deltaBlocks, rewardTokenSpeed);
            uint256 contributorAccrued = add_(rewardTokenAccrued[contributor], newAccrued);

            rewardTokenAccrued[contributor] = contributorAccrued;
            lastContributorBlock[contributor] = blockNumber;

            emit ContributorRewardsUpdated(contributor, rewardTokenAccrued[contributor]);
        }
    }

    /**
     * @notice Claim all the rewardToken accrued by holder in the specified markets.
     * @param holder The address to claim REWARD TOKEN for
     * @param vTokens The list of markets to claim REWARD TOKEN in
     */
    function claimRewardToken(address holder, VToken[] memory vTokens) public {
        uint256 vTokensCount = vTokens.length;

        _ensureMaxLoops(vTokensCount);

        for (uint256 i; i < vTokensCount; ++i) {
            VToken vToken = vTokens[i];
            require(comptroller.isMarketListed(vToken), "market must be listed");
            Exp memory borrowIndex = Exp({ mantissa: vToken.borrowIndex() });
            _updateRewardTokenBorrowIndex(address(vToken), borrowIndex);
            _distributeBorrowerRewardToken(address(vToken), holder, borrowIndex);
            _updateRewardTokenSupplyIndex(address(vToken));
            _distributeSupplierRewardToken(address(vToken), holder);
        }
        rewardTokenAccrued[holder] = _grantRewardToken(holder, rewardTokenAccrued[holder]);
    }

    function getBlockNumber() public view virtual returns (uint256) {
        return block.number;
    }

    /**
     * @notice Set REWARD TOKEN speed for a single market.
     * @param vToken market's whose reward token rate to be updated
     * @param supplySpeed New supply-side REWARD TOKEN speed for market
     * @param borrowSpeed New borrow-side REWARD TOKEN speed for market
     */
    function _setRewardTokenSpeed(
        VToken vToken,
        uint256 supplySpeed,
        uint256 borrowSpeed
    ) internal {
        require(comptroller.isMarketListed(vToken), "rewardToken market is not listed");

        if (rewardTokenSupplySpeeds[address(vToken)] != supplySpeed) {
            // Supply speed updated so let's update supply state to ensure that
            //  1. REWARD TOKEN accrued properly for the old speed, and
            //  2. REWARD TOKEN accrued at the new speed starts after this block.
            _updateRewardTokenSupplyIndex(address(vToken));

            // Update speed and emit event
            rewardTokenSupplySpeeds[address(vToken)] = supplySpeed;
            emit RewardTokenSupplySpeedUpdated(vToken, supplySpeed);
        }

        if (rewardTokenBorrowSpeeds[address(vToken)] != borrowSpeed) {
            // Borrow speed updated so let's update borrow state to ensure that
            //  1. REWARD TOKEN accrued properly for the old speed, and
            //  2. REWARD TOKEN accrued at the new speed starts after this block.
            Exp memory borrowIndex = Exp({ mantissa: vToken.borrowIndex() });
            _updateRewardTokenBorrowIndex(address(vToken), borrowIndex);

            // Update speed and emit event
            rewardTokenBorrowSpeeds[address(vToken)] = borrowSpeed;
            emit RewardTokenBorrowSpeedUpdated(vToken, borrowSpeed);
        }
    }

    /**
     * @notice Calculate REWARD TOKEN accrued by a supplier and possibly transfer it to them.
     * @param vToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute REWARD TOKEN to
     */
    function _distributeSupplierRewardToken(address vToken, address supplier) internal {
        RewardToken storage supplyState = rewardTokenSupplyState[vToken];
        uint256 supplyIndex = supplyState.index;
        uint256 supplierIndex = rewardTokenSupplierIndex[vToken][supplier];

        // Update supplier's index to the current index since we are distributing accrued REWARD TOKEN
        rewardTokenSupplierIndex[vToken][supplier] = supplyIndex;

        if (supplierIndex == 0 && supplyIndex >= rewardTokenInitialIndex) {
            // Covers the case where users supplied tokens before the market's supply state index was set.
            // Rewards the user with REWARD TOKEN accrued from the start of when supplier rewards were first
            // set for the market.
            supplierIndex = rewardTokenInitialIndex;
        }

        // Calculate change in the cumulative sum of the REWARD TOKEN per vToken accrued
        Double memory deltaIndex = Double({ mantissa: sub_(supplyIndex, supplierIndex) });

        uint256 supplierTokens = VToken(vToken).balanceOf(supplier);

        // Calculate REWARD TOKEN accrued: vTokenAmount * accruedPerVToken
        uint256 supplierDelta = mul_(supplierTokens, deltaIndex);

        uint256 supplierAccrued = add_(rewardTokenAccrued[supplier], supplierDelta);
        rewardTokenAccrued[supplier] = supplierAccrued;

        emit DistributedSupplierRewardToken(VToken(vToken), supplier, supplierDelta, supplierAccrued, supplyIndex);
    }

    /**
     * @notice Calculate reward token accrued by a borrower and possibly transfer it to them.
     * @param vToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute REWARD TOKEN to
     */
    function _distributeBorrowerRewardToken(
        address vToken,
        address borrower,
        Exp memory marketBorrowIndex
    ) internal {
        RewardToken storage borrowState = rewardTokenBorrowState[vToken];
        uint256 borrowIndex = borrowState.index;
        uint256 borrowerIndex = rewardTokenBorrowerIndex[vToken][borrower];

        // Update borrowers's index to the current index since we are distributing accrued REWARD TOKEN
        rewardTokenBorrowerIndex[vToken][borrower] = borrowIndex;

        if (borrowerIndex == 0 && borrowIndex >= rewardTokenInitialIndex) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set.
            // Rewards the user with REWARD TOKEN accrued from the start of when borrower rewards were first
            // set for the market.
            borrowerIndex = rewardTokenInitialIndex;
        }

        // Calculate change in the cumulative sum of the REWARD TOKEN per borrowed unit accrued
        Double memory deltaIndex = Double({ mantissa: sub_(borrowIndex, borrowerIndex) });

        uint256 borrowerAmount = div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex);

        // Calculate REWARD TOKEN accrued: vTokenAmount * accruedPerBorrowedUnit
        if (borrowerAmount != 0) {
            uint256 borrowerDelta = mul_(borrowerAmount, deltaIndex);

            uint256 borrowerAccrued = add_(rewardTokenAccrued[borrower], borrowerDelta);
            rewardTokenAccrued[borrower] = borrowerAccrued;

            emit DistributedBorrowerRewardToken(VToken(vToken), borrower, borrowerDelta, borrowerAccrued, borrowIndex);
        }
    }

    /**
     * @notice Transfer REWARD TOKEN to the user.
     * @dev Note: If there is not enough REWARD TOKEN, we do not perform the transfer all.
     * @param user The address of the user to transfer REWARD TOKEN to
     * @param amount The amount of REWARD TOKEN to (possibly) transfer
     * @return The amount of REWARD TOKEN which was NOT transferred to the user
     */
    function _grantRewardToken(address user, uint256 amount) internal returns (uint256) {
        uint256 rewardTokenRemaining = rewardToken.balanceOf(address(this));
        if (amount > 0 && amount <= rewardTokenRemaining) {
            rewardToken.safeTransfer(user, amount);
            return 0;
        }
        return amount;
    }

    /**
     * @notice Accrue REWARD TOKEN to the market by updating the supply index.
     * @param vToken The market whose supply index to update
     * @dev Index is a cumulative sum of the REWARD TOKEN per vToken accrued.
     */
    function _updateRewardTokenSupplyIndex(address vToken) internal {
        RewardToken storage supplyState = rewardTokenSupplyState[vToken];
        uint256 supplySpeed = rewardTokenSupplySpeeds[vToken];
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");
        uint256 deltaBlocks = sub_(uint256(blockNumber), uint256(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint256 supplyTokens = VToken(vToken).totalSupply();
            uint256 accruedSinceUpdate = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0
                ? fraction(accruedSinceUpdate, supplyTokens)
                : Double({ mantissa: 0 });
            supplyState.index = safe224(
                add_(Double({ mantissa: supplyState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            supplyState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            supplyState.block = blockNumber;
        }

        emit RewardTokenSupplyIndexUpdated(vToken);
    }

    /**
     * @notice Accrue REWARD TOKEN to the market by updating the borrow index.
     * @param vToken The market whose borrow index to update
     * @dev Index is a cumulative sum of the REWARD TOKEN per vToken accrued.
     */
    function _updateRewardTokenBorrowIndex(address vToken, Exp memory marketBorrowIndex) internal {
        RewardToken storage borrowState = rewardTokenBorrowState[vToken];
        uint256 borrowSpeed = rewardTokenBorrowSpeeds[vToken];
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");
        uint256 deltaBlocks = sub_(uint256(blockNumber), uint256(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint256 borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint256 accruedSinceUpdate = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0
                ? fraction(accruedSinceUpdate, borrowAmount)
                : Double({ mantissa: 0 });
            borrowState.index = safe224(
                add_(Double({ mantissa: borrowState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            borrowState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            borrowState.block = blockNumber;
        }

        emit RewardTokenBorrowIndexUpdated(vToken, marketBorrowIndex);
    }
}

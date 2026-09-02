// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { Action } from "../ComptrollerInterface.sol";
import { SpokeComptrollerInterface } from "./SpokeComptrollerInterface.sol";
import { SpokeComptrollerStorage } from "./SpokeComptrollerStorage.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { VToken } from "../VToken.sol";
import { RewardsDistributor } from "../Rewards/RewardsDistributor.sol";
import { MaxLoopsLimitHelper } from "../MaxLoopsLimitHelper.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";

/// @notice Which per-market risk parameter weights an account's collateral in a liquidity snapshot. Internal to the
/// implementation: no event, error or external function exposes it, so it is deliberately not part of
/// `SpokeComptrollerInterface`.
enum WeightFunction {
    USE_COLLATERAL_FACTOR,
    USE_LIQUIDATION_THRESHOLD
}

/**
 * @title SpokeComptroller
 * @author Venus
 * @notice The `SpokeComptroller` provides checks for all minting, redeeming, transferring, borrowing, repaying,
 * liquidating and seizing done by the `vToken` contract. It is the comptroller of a single pool and checks those
 * interactions across every market in it: when a user interacts with a market by one of these actions, the market
 * calls a corresponding hook here, which either allows or reverts the transaction. These hooks also update supply and
 * borrow rewards as they are called. The comptroller holds the logic for assessing liquidity snapshots of an account
 * via the collateral factor and liquidation threshold. This check determines the collateral needed for a borrow, as
 * well as how much of a borrow may be liquidated. A user may borrow a portion of their collateral with the maximum
 * amount determined by the market's collateral factor, applied to a collateral value the deviation-bounded oracle
 * caps against the asset's recent price window. However, if their borrowed amount exceeds an amount calculated using
 * the market's corresponding liquidation threshold, the borrow is eligible for liquidation. Liquidations themselves
 * are priced at spot.
 *
 * The `SpokeComptroller` also includes two functions `liquidateAccount()` and `healAccount()`, which are meant to
 * handle accounts that do not exceed the `minLiquidatableCollateral` for the `SpokeComptroller`:
 *
 * - `healAccount()`: This function is called to seize all of a given user's collateral, requiring the `msg.sender`
 * repay a certain percentage of the debt calculated by `maxClearableDebt/borrows`, where `maxClearableDebt` is the
 * sum over the user's collateral markets of `collateralValue/liquidationIncentive`, each market taken at its own
 * incentive. The function can only be called if the calculated percentage does not exceed 100%, because otherwise no
 * `badDebt` would be created and `liquidateAccount()` should be used instead. The difference in the actual amount of
 * debt and debt paid off is recorded as `badDebt` for each market, which can then be auctioned off for the risk
 * reserves of the pool.
 * - `liquidateAccount()`: This function can only be called if the collateral seized will cover all borrows of an
 * account, as well as the liquidation incentive of each collateral market, which is the same condition stated as
 * `borrows < maxClearableDebt`. Otherwise, the pool will incur bad debt, in which case the function `healAccount()`
 * should be used instead. This function skips the logic verifying that the repay amount does not exceed the close
 * factor.
 *
 * The two conditions are complements, so every account below `minLiquidatableCollateral` is served by exactly one of
 * them.
 *
 * @dev Fork of `Comptroller` (`contracts/Comptroller.sol`). It is a separate implementation because `Comptroller` is
 * the one every other pool in this repo shares, here and on other chains, so policy that applies only to a spoke pool
 * does not belong in it: bounded collateral pricing, the supply and liquidation allowlists, and per-market liquidation
 * incentives. Nothing keeps the two in sync automatically: a change to `Comptroller` has to be reviewed and
 * re-applied here by hand, and `diff contracts/Comptroller.sol contracts/Spoke/SpokeComptroller.sol` shows what this
 * fork currently changes.
 */
contract SpokeComptroller is
    Ownable2StepUpgradeable,
    AccessControlledV8,
    SpokeComptrollerStorage,
    SpokeComptrollerInterface,
    ExponentialNoError,
    MaxLoopsLimitHelper
{
    // PoolRegistry, immutable to save on gas
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable poolRegistry;

    /// @param poolRegistry_ Pool registry address
    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
    constructor(address poolRegistry_) {
        ensureNonzeroAddress(poolRegistry_);

        poolRegistry = poolRegistry_;
        _disableInitializers();
    }

    /**
     * @param loopLimit Limit for the loops can iterate to avoid the DOS
     * @param accessControlManager Access control manager contract address
     */
    function initialize(uint256 loopLimit, address accessControlManager) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager);

        _setMaxLoopsLimit(loopLimit);
    }

    /**
     * @notice Add assets to be included in account liquidity calculation; enabling them to be used as collateral
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return errors An array of NO_ERROR for compatibility with Venus core tooling
     * @custom:event MarketEntered is emitted for each market on success
     * @custom:error ActionPaused error is thrown if entering any of the markets is paused
     * @custom:error MarketNotListed error is thrown if any of the markets is not listed
     * @custom:access Not restricted
     */
    function enterMarkets(address[] memory vTokens) external override returns (uint256[] memory) {
        uint256 len = vTokens.length;

        uint256[] memory results = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            VToken vToken = VToken(vTokens[i]);

            _addToMarket(vToken, msg.sender);
            results[i] = NO_ERROR;
        }

        return results;
    }

    /**
     * @notice Unlist a market by setting isListed to false
     * @dev Checks if all actions are paused, borrow/supply caps is set to 0 and collateral factor is to 0.
     * @param market The address of the market (token) to unlist
     * @return uint256 Always NO_ERROR for compatibility with Venus core tooling
     * @custom:event MarketUnlisted is emitted on success
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error BorrowActionNotPaused error is thrown if borrow action is not paused
     * @custom:error MintActionNotPaused error is thrown if mint action is not paused
     * @custom:error RedeemActionNotPaused error is thrown if redeem action is not paused
     * @custom:error RepayActionNotPaused error is thrown if repay action is not paused
     * @custom:error EnterMarketActionNotPaused error is thrown if enter market action is not paused
     * @custom:error LiquidateActionNotPaused error is thrown if liquidate action is not paused
     * @custom:error BorrowCapIsNotZero error is thrown if borrow cap is not zero
     * @custom:error SupplyCapIsNotZero error is thrown if supply cap is not zero
     * @custom:error CollateralFactorIsNotZero error is thrown if collateral factor is not zero
     */
    function unlistMarket(address market) external returns (uint256) {
        _checkAccessAllowed("unlistMarket(address)");

        Market storage _market = markets[market];

        if (!_market.isListed) {
            revert MarketNotListed(market);
        }

        if (!actionPaused(market, Action.BORROW)) {
            revert BorrowActionNotPaused();
        }

        if (!actionPaused(market, Action.MINT)) {
            revert MintActionNotPaused();
        }

        if (!actionPaused(market, Action.REDEEM)) {
            revert RedeemActionNotPaused();
        }

        if (!actionPaused(market, Action.REPAY)) {
            revert RepayActionNotPaused();
        }

        if (!actionPaused(market, Action.SEIZE)) {
            revert SeizeActionNotPaused();
        }

        if (!actionPaused(market, Action.ENTER_MARKET)) {
            revert EnterMarketActionNotPaused();
        }

        if (!actionPaused(market, Action.LIQUIDATE)) {
            revert LiquidateActionNotPaused();
        }

        if (!actionPaused(market, Action.TRANSFER)) {
            revert TransferActionNotPaused();
        }

        if (!actionPaused(market, Action.EXIT_MARKET)) {
            revert ExitMarketActionNotPaused();
        }

        if (borrowCaps[market] != 0) {
            revert BorrowCapIsNotZero();
        }

        if (supplyCaps[market] != 0) {
            revert SupplyCapIsNotZero();
        }

        if (_market.collateralFactorMantissa != 0) {
            revert CollateralFactorIsNotZero();
        }

        _market.isListed = false;
        emit MarketUnlisted(market);

        return NO_ERROR;
    }

    /**
     * @notice Grants or revokes the borrowing or redeeming delegate rights to / from an account
     *  If allowed, the delegate will be able to borrow funds on behalf of the sender
     *  Upon a delegated borrow, the delegate will receive the funds, and the borrower
     *  will see the debt on their account
     *  Upon a delegated redeem, the delegate will receive the redeemed amount and the approver
     *  will see a deduction in his vToken balance
     * @param delegate The address to update the rights for
     * @param approved Whether to grant (true) or revoke (false) the borrowing or redeeming rights
     * @custom:event DelegateUpdated emits on success
     * @custom:error ZeroAddressNotAllowed is thrown when delegate address is zero
     * @custom:error DelegationStatusUnchanged is thrown if approval status is already set to the requested value
     * @custom:access Not restricted
     */
    function updateDelegate(address delegate, bool approved) external {
        ensureNonzeroAddress(delegate);
        if (approvedDelegates[msg.sender][delegate] == approved) {
            revert DelegationStatusUnchanged();
        }

        approvedDelegates[msg.sender][delegate] = approved;
        emit DelegateUpdated(msg.sender, delegate, approved);
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation; disabling them as collateral
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow.
     * @param vTokenAddress The address of the asset to be removed
     * @return error Always NO_ERROR for compatibility with Venus core tooling
     * @custom:event MarketExited is emitted on success
     * @custom:error ActionPaused error is thrown if exiting the market is paused
     * @custom:error NonzeroBorrowBalance error is thrown if the user has an outstanding borrow in this market
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error InsufficientLiquidity error is thrown if exiting the market would lead to user's insolvency
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     * @custom:access Not restricted
     */
    function exitMarket(address vTokenAddress) external override returns (uint256) {
        _checkActionPauseState(vTokenAddress, Action.EXIT_MARKET);
        VToken vToken = VToken(vTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the vToken */
        (uint256 tokensHeld, uint256 amountOwed, ) = _safeGetAccountSnapshot(vToken, msg.sender);

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            revert NonzeroBorrowBalance();
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        _checkRedeemAllowed(vTokenAddress, msg.sender, tokensHeld);

        Market storage marketToExit = markets[address(vToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return NO_ERROR;
        }

        /* Set vToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete vToken from the account’s list of assets */
        // load into memory for faster iteration
        VToken[] memory userAssetList = accountAssets[msg.sender];
        uint256 len = userAssetList.length;

        uint256 assetIndex = len;
        for (uint256 i; i < len; ++i) {
            if (userAssetList[i] == vToken) {
                assetIndex = i;
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(assetIndex < len);

        // copy last item in list to location of item to be removed, reduce length by 1
        VToken[] storage storedList = accountAssets[msg.sender];
        storedList[assetIndex] = storedList[storedList.length - 1];
        storedList.pop();

        emit MarketExited(vToken, msg.sender);

        return NO_ERROR;
    }

    /*** Policy Hooks ***/

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param vToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @custom:error ActionPaused error is thrown if supplying to this market is paused
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error SupplyNotAllowed error is thrown if the market's supply allowlist is enabled and the minter is
     *   not on it
     * @custom:error SupplyCapExceeded error is thrown if the total supply exceeds the cap after minting
     * @custom:access Not restricted
     */
    function preMintHook(address vToken, address minter, uint256 mintAmount) external override {
        _checkActionPauseState(vToken, Action.MINT);

        if (!markets[vToken].isListed) {
            revert MarketNotListed(address(vToken));
        }

        // `minter` is the account credited with the newly minted vTokens, not necessarily the account paying for
        // them: `mintBehalf` lets a third party fund a mint attributed to someone else. Metering the recipient is
        // what bounds the market's supply, so the payer is deliberately not checked.
        if (isSupplyAllowlistEnabled[vToken] && !isAllowedSupplier[vToken][minter]) {
            revert SupplyNotAllowed(vToken, minter);
        }

        uint256 supplyCap = supplyCaps[vToken];
        // Skipping the cap check for uncapped coins to save some gas
        if (supplyCap != type(uint256).max) {
            uint256 vTokenSupply = VToken(vToken).totalSupply();
            Exp memory exchangeRate = Exp({ mantissa: VToken(vToken).exchangeRateStored() });
            uint256 nextTotalSupply = mul_ScalarTruncateAddUInt(exchangeRate, vTokenSupply, mintAmount);
            if (nextTotalSupply > supplyCap) {
                revert SupplyCapExceeded(vToken, supplyCap);
            }
        }

        // Keep the flywheel moving
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            rewardsDistributor.updateRewardTokenSupplyIndex(vToken);
            rewardsDistributor.distributeSupplierRewardToken(vToken, minter);
        }
    }

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param vToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of vTokens to exchange for the underlying asset in the market
     * @custom:error ActionPaused error is thrown if withdrawals are paused in this market
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error InsufficientLiquidity error is thrown if the withdrawal would lead to user's insolvency
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     * @custom:access Not restricted
     */
    function preRedeemHook(address vToken, address redeemer, uint256 redeemTokens) external override {
        _checkActionPauseState(vToken, Action.REDEEM);

        _checkRedeemAllowed(vToken, redeemer, redeemTokens);

        // Keep the flywheel moving
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            rewardsDistributor.updateRewardTokenSupplyIndex(vToken);
            rewardsDistributor.distributeSupplierRewardToken(vToken, redeemer);
        }
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param vToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @custom:error ActionPaused error is thrown if borrowing is paused in this market
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error InsufficientLiquidity error is thrown if there is not enough collateral to borrow
     * @custom:error BorrowCapExceeded is thrown if the borrow cap will be exceeded should this borrow succeed
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     * @custom:access Not restricted if vToken is enabled as collateral, otherwise only vToken
     */
    /// disable-eslint
    function preBorrowHook(address vToken, address borrower, uint256 borrowAmount) external override {
        _checkActionPauseState(vToken, Action.BORROW);

        if (!markets[vToken].isListed) {
            revert MarketNotListed(address(vToken));
        }

        if (!markets[vToken].accountMembership[borrower]) {
            // only vTokens may call borrowAllowed if borrower not in market
            _checkSenderIs(vToken);

            // attempt to add borrower to the market or revert
            _addToMarket(VToken(msg.sender), borrower);
        }

        // Update the prices of tokens. Resolved once here, after the membership change above, and reused for both
        // updates.
        VToken[] memory borrowerAssets = getAssetsIn(borrower);
        _updatePrices(borrowerAssets);
        _updateProtectionStates(borrowerAssets);

        if (oracle.getUnderlyingPrice(vToken) == 0) {
            revert PriceError(address(vToken));
        }

        uint256 borrowCap = borrowCaps[vToken];
        // Skipping the cap check for uncapped coins to save some gas
        if (borrowCap != type(uint256).max) {
            uint256 totalBorrows = VToken(vToken).totalBorrows();
            uint256 badDebt = VToken(vToken).badDebt();
            uint256 nextTotalBorrows = totalBorrows + borrowAmount + badDebt;
            if (nextTotalBorrows > borrowCap) {
                revert BorrowCapExceeded(vToken, borrowCap);
            }
        }

        AccountLiquiditySnapshot memory snapshot = _getHypotheticalLiquiditySnapshot(
            borrower,
            VToken(vToken),
            0,
            borrowAmount,
            WeightFunction.USE_COLLATERAL_FACTOR
        );

        if (snapshot.shortfall > 0) {
            revert InsufficientLiquidity();
        }

        Exp memory borrowIndex = Exp({ mantissa: VToken(vToken).borrowIndex() });

        // Keep the flywheel moving
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            rewardsDistributor.updateRewardTokenBorrowIndex(vToken, borrowIndex);
            rewardsDistributor.distributeBorrowerRewardToken(vToken, borrower, borrowIndex);
        }
    }

    /**
     * @notice Checks if the account should be allowed to repay a borrow in the given market
     * @param vToken The market to verify the repay against
     * @param borrower The account which would borrowed the asset
     * @custom:error ActionPaused error is thrown if repayments are paused in this market
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:access Not restricted
     */
    function preRepayHook(address vToken, address borrower) external override {
        _checkActionPauseState(vToken, Action.REPAY);

        oracle.updatePrice(vToken);

        if (!markets[vToken].isListed) {
            revert MarketNotListed(address(vToken));
        }

        // Keep the flywheel moving
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            Exp memory borrowIndex = Exp({ mantissa: VToken(vToken).borrowIndex() });
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            rewardsDistributor.updateRewardTokenBorrowIndex(vToken, borrowIndex);
            rewardsDistributor.distributeBorrowerRewardToken(vToken, borrower, borrowIndex);
        }
    }

    /**
     * @notice Checks if the liquidation should be allowed to occur
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param borrower The address of the borrower
     * @param repayAmount The amount of underlying being repaid
     * @param skipLiquidityCheck Allows the borrow to be liquidated regardless of the account liquidity
     * @custom:error ActionPaused error is thrown if liquidations are paused in this market
     * @custom:error MarketNotListed error is thrown if either collateral or borrowed token is not listed
     * @custom:error TooMuchRepay error is thrown if the liquidator is trying to repay more than allowed by close factor
     * @custom:error MinimalCollateralViolated is thrown if the users' total collateral is lower than the threshold for non-batch liquidations
     * @custom:error InsufficientShortfall is thrown when trying to liquidate a healthy account
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     */
    function preLiquidateHook(
        address vTokenBorrowed,
        address vTokenCollateral,
        address borrower,
        uint256 repayAmount,
        bool skipLiquidityCheck
    ) external override {
        // Pause Action.LIQUIDATE on BORROWED TOKEN to prevent liquidating it.
        // If we want to pause liquidating to vTokenCollateral, we should pause
        // Action.SEIZE on it
        _checkActionPauseState(vTokenBorrowed, Action.LIQUIDATE);

        // Update the prices of tokens
        updatePrices(borrower);

        if (!markets[vTokenBorrowed].isListed) {
            revert MarketNotListed(address(vTokenBorrowed));
        }
        if (!markets[vTokenCollateral].isListed) {
            revert MarketNotListed(address(vTokenCollateral));
        }

        uint256 borrowBalance = VToken(vTokenBorrowed).borrowBalanceStored(borrower);

        /* Allow accounts to be liquidated if it is a forced liquidation */
        if (skipLiquidityCheck || isForcedLiquidationEnabled[vTokenBorrowed]) {
            if (repayAmount > borrowBalance) {
                revert TooMuchRepay();
            }
            return;
        }

        /* The borrower must have shortfall and collateral > threshold in order to be liquidatable */
        AccountLiquiditySnapshot memory snapshot = _getCurrentLiquiditySnapshot(
            borrower,
            WeightFunction.USE_LIQUIDATION_THRESHOLD
        );

        if (snapshot.totalCollateral <= minLiquidatableCollateral) {
            /* The liquidator should use either liquidateAccount or healAccount */
            revert MinimalCollateralViolated(minLiquidatableCollateral, snapshot.totalCollateral);
        }

        if (snapshot.shortfall == 0) {
            revert InsufficientShortfall();
        }

        /* The liquidator may not repay more than what is allowed by the closeFactor */
        uint256 maxClose = mul_ScalarTruncate(Exp({ mantissa: closeFactorMantissa }), borrowBalance);
        if (repayAmount > maxClose) {
            revert TooMuchRepay();
        }
    }

    /**
     * @notice Checks if the seizing of assets should be allowed to occur
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param seizerContract Contract that tries to seize the asset (either borrowed vToken or Comptroller)
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @custom:error ActionPaused error is thrown if seizing this type of collateral is paused
     * @custom:error MarketNotListed error is thrown if either collateral or borrowed token is not listed
     * @custom:error ComptrollerMismatch error is when seizer contract or seized asset belong to different pools
     * @custom:error LiquidationNotAllowed is thrown if the liquidation allowlist is enabled and the liquidator is not
     *   on it
     * @custom:access Not restricted while the liquidation allowlist is disabled, otherwise the liquidator has to be
     *   on it
     */
    function preSeizeHook(
        address vTokenCollateral,
        address seizerContract,
        address liquidator,
        address borrower
    ) external override {
        // Pause Action.SEIZE on COLLATERAL to prevent seizing it.
        // If we want to pause liquidating vTokenBorrowed, we should pause
        // Action.LIQUIDATE on it
        _checkActionPauseState(vTokenCollateral, Action.SEIZE);

        Market storage market = markets[vTokenCollateral];

        if (!market.isListed) {
            revert MarketNotListed(vTokenCollateral);
        }

        if (seizerContract == address(this)) {
            // If Comptroller is the seizer, just check if collateral's comptroller
            // is equal to the current address
            if (address(VToken(vTokenCollateral).comptroller()) != address(this)) {
                revert ComptrollerMismatch();
            }
        } else {
            // If the seizer is not the Comptroller, check that the seizer is a
            // listed market, and that the markets' comptrollers match
            if (!markets[seizerContract].isListed) {
                revert MarketNotListed(seizerContract);
            }
            if (VToken(vTokenCollateral).comptroller() != VToken(seizerContract).comptroller()) {
                revert ComptrollerMismatch();
            }
        }

        if (!market.accountMembership[borrower]) {
            revert MarketNotCollateral(vTokenCollateral, borrower);
        }

        // Every seizure reaches this hook with the account that receives the collateral, whichever entry point it
        // came from, so this is the check that actually enforces the allowlist.
        _checkLiquidationAllowed(liquidator);

        // Keep the flywheel moving
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            rewardsDistributor.updateRewardTokenSupplyIndex(vTokenCollateral);
            rewardsDistributor.distributeSupplierRewardToken(vTokenCollateral, borrower);
            rewardsDistributor.distributeSupplierRewardToken(vTokenCollateral, liquidator);
        }
    }

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param vToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     * @custom:error ActionPaused error is thrown if withdrawals are paused in this market
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error InsufficientLiquidity error is thrown if the withdrawal would lead to user's insolvency
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     * @custom:access Not restricted
     */
    function preTransferHook(address vToken, address src, address dst, uint256 transferTokens) external override {
        _checkActionPauseState(vToken, Action.TRANSFER);

        // Currently the only consideration is whether or not
        //  the src is allowed to redeem this many tokens
        _checkRedeemAllowed(vToken, src, transferTokens);

        // Keep the flywheel moving
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            rewardsDistributor.updateRewardTokenSupplyIndex(vToken);
            rewardsDistributor.distributeSupplierRewardToken(vToken, src);
            rewardsDistributor.distributeSupplierRewardToken(vToken, dst);
        }
    }

    /*** Post-action Hooks ***/

    // The vToken calls one of the seven functions below as the last step of every successful mint, redeem, borrow,
    // repayment, liquidation, seizure and transfer. All of them are no-ops here, and none of them can be dropped:
    // `ComptrollerInterface` declares all seven, so omitting one leaves this contract abstract, and the vToken calls
    // each of them with a plain external call against a comptroller that has no fallback, so a missing function would
    // revert the operation it belongs to. They are unrestricted, which is harmless because they do nothing, and their
    // parameters are unnamed because the bodies are empty.
    // solhint-disable no-empty-blocks

    /// @notice Called by the vToken once a mint has succeeded. No-op, see the note above.
    function mintVerify(address, address, uint256, uint256) external {}

    /// @notice Called by the vToken once a redeem has succeeded. No-op, see the note above.
    function redeemVerify(address, address, uint256, uint256) external {}

    /// @notice Called by the vToken once a borrow has succeeded. No-op, see the note above.
    function borrowVerify(address, address, uint256) external {}

    /// @notice Called by the vToken once a repayment has succeeded. No-op, see the note above.
    function repayBorrowVerify(address, address, address, uint256, uint256) external {}

    /// @notice Called by the vToken once a liquidation has succeeded. No-op, see the note above.
    function liquidateBorrowVerify(address, address, address, address, uint256, uint256) external {}

    /// @notice Called by the vToken once a seizure has succeeded. No-op, see the note above.
    function seizeVerify(address, address, address, address, uint256) external {}

    /// @notice Called by the vToken once a transfer has succeeded. No-op, see the note above.
    function transferVerify(address, address, address, uint256) external {}

    // solhint-enable no-empty-blocks

    /*** Pool-level operations ***/

    /**
     * @notice Seizes all the remaining collateral, makes msg.sender repay the existing
     *   borrows, and treats the rest of the debt as bad debt (for each market).
     *   The sender has to repay a certain percentage of the debt, computed as `maxClearableDebt / borrows`: see the
     *   note on `AccountLiquiditySnapshot.maxClearableDebt`.
     * @param user account to heal
     * @custom:error LiquidationNotAllowed is thrown if the liquidation allowlist is enabled and the caller is not on it
     * @custom:error CollateralExceedsThreshold error is thrown when the collateral is too big for healing
     * @custom:error CollateralCoversDebt is thrown when the collateral can clear the whole debt, which leaves nothing
     *   to heal
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     * @custom:access Not restricted while the liquidation allowlist is disabled, otherwise restricted to the accounts
     *   on it
     */
    function healAccount(address user) external {
        // Checked here as well as in `preSeizeHook`, because a borrower holding no vTokens at all takes the branch
        // below that only calls `healBorrow`, which reaches no hook carrying the caller. Without this the whole
        // remaining principal could be moved into bad debt by anyone, at no cost.
        _checkLiquidationAllowed(msg.sender);

        VToken[] memory userAssets = getAssetsIn(user);
        uint256 userAssetsCount = userAssets.length;

        address liquidator = msg.sender;
        {
            ResilientOracleInterface oracle_ = oracle;
            // We need all user's markets to be fresh for the computations to be correct
            for (uint256 i; i < userAssetsCount; ++i) {
                userAssets[i].accrueInterest();
                oracle_.updatePrice(address(userAssets[i]));
            }
        }

        AccountLiquiditySnapshot memory snapshot = _getCurrentLiquiditySnapshot(
            user,
            WeightFunction.USE_LIQUIDATION_THRESHOLD
        );

        if (snapshot.totalCollateral > minLiquidatableCollateral) {
            revert CollateralExceedsThreshold(minLiquidatableCollateral, snapshot.totalCollateral);
        }

        if (snapshot.shortfall == 0) {
            revert InsufficientShortfall();
        }

        // The collateral covers the whole debt at every market's own incentive, so healing would forgive nothing and
        // the account should go through `liquidateAccount` instead.
        if (snapshot.maxClearableDebt > snapshot.borrows) {
            revert CollateralCoversDebt(snapshot.borrows, snapshot.maxClearableDebt);
        }

        // percentage = maxClearableDebt / borrows. One blended share applies to every borrow, so what the caller
        // pays in total is the sum over the collateral markets of each market's value at its own liquidation
        // incentive. The discount is exact in aggregate; it is not attributed per piece of collateral.
        Exp memory percentage = div_(Exp({ mantissa: snapshot.maxClearableDebt }), Exp({ mantissa: snapshot.borrows }));

        for (uint256 i; i < userAssetsCount; ++i) {
            VToken market = userAssets[i];

            (uint256 tokens, uint256 borrowBalance, ) = _safeGetAccountSnapshot(market, user);
            uint256 repaymentAmount = mul_ScalarTruncate(percentage, borrowBalance);

            // Seize the entire collateral
            if (tokens != 0) {
                market.seize(liquidator, user, tokens);
            }
            // Repay a certain percentage of the borrow, forgive the rest
            if (borrowBalance != 0) {
                market.healBorrow(liquidator, user, repaymentAmount);
            }
        }
    }

    /**
     * @notice Liquidates all borrows of the borrower. Callable only if the collateral is less than
     *   a predefined threshold, and the account collateral can be seized to cover all borrows. If
     *   the collateral is higher than the threshold, use regular liquidations. If the collateral is
     *   below the threshold, and the account is insolvent, use healAccount.
     * @param borrower the borrower address
     * @param orders an array of liquidation orders
     * @custom:error LiquidationNotAllowed is thrown by `preSeizeHook`, while seizing for the first order, if the
     *   liquidation allowlist is enabled and the caller is not on it
     * @custom:error CollateralExceedsThreshold error is thrown when the collateral is too big for a batch liquidation
     * @custom:error DebtExceedsClearableAmount is thrown when the collateral cannot clear the whole debt, which
     *   means the account has to go through `healAccount`
     * @custom:error NonzeroBorrowBalanceAfterLiquidation is thrown if the orders do not clear every borrow
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     * @custom:access Not restricted while the liquidation allowlist is disabled, otherwise restricted to the accounts
     *   on it
     */
    function liquidateAccount(address borrower, LiquidationOrder[] calldata orders) external {
        // No entry check on the liquidation allowlist here, unlike `healAccount`: every order ends in a seizure and
        // `preSeizeHook` carries the caller, so the allowlist is enforced there.

        // We will accrue interest and update the oracle prices later during the liquidation. `healAccount` does the
        // opposite and refreshes both before its snapshot, so the two entry points do not route on the same view of
        // the position: the snapshot below decides both the `minLiquidatableCollateral` gate and, through
        // `maxClearableDebt`, whether this account belongs in `healAccount` instead, and it decides them on stored
        // exchange rates and whatever price the oracle last recorded.

        AccountLiquiditySnapshot memory snapshot = _getCurrentLiquiditySnapshot(
            borrower,
            WeightFunction.USE_LIQUIDATION_THRESHOLD
        );

        if (snapshot.totalCollateral > minLiquidatableCollateral) {
            // You should use the regular vToken.liquidateBorrow(...) call
            revert CollateralExceedsThreshold(minLiquidatableCollateral, snapshot.totalCollateral);
        }

        if (snapshot.borrows >= snapshot.maxClearableDebt) {
            // There is not enough collateral to seize. Use healAccount to repay some part of the borrow
            // and record bad debt.
            revert DebtExceedsClearableAmount(snapshot.borrows, snapshot.maxClearableDebt);
        }

        if (snapshot.shortfall == 0) {
            revert InsufficientShortfall();
        }

        uint256 ordersCount = orders.length;

        _ensureMaxLoops(ordersCount / 2);

        for (uint256 i; i < ordersCount; ++i) {
            if (!markets[address(orders[i].vTokenBorrowed)].isListed) {
                revert MarketNotListed(address(orders[i].vTokenBorrowed));
            }
            if (!markets[address(orders[i].vTokenCollateral)].isListed) {
                revert MarketNotListed(address(orders[i].vTokenCollateral));
            }

            LiquidationOrder calldata order = orders[i];
            order.vTokenBorrowed.forceLiquidateBorrow(
                msg.sender,
                borrower,
                order.repayAmount,
                order.vTokenCollateral,
                true
            );
        }

        VToken[] memory borrowMarkets = getAssetsIn(borrower);
        uint256 marketsCount = borrowMarkets.length;

        for (uint256 i; i < marketsCount; ++i) {
            (, uint256 borrowBalance, ) = _safeGetAccountSnapshot(borrowMarkets[i], borrower);
            if (borrowBalance != 0) {
                revert NonzeroBorrowBalanceAfterLiquidation();
            }
        }
    }

    /**
     * @notice Sets the closeFactor to use when liquidating borrows
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @custom:event Emits NewCloseFactor on success
     * @custom:error InvalidCloseFactor is thrown if the new close factor is outside the allowed bounds
     * @custom:access Controlled by AccessControlManager
     */
    function setCloseFactor(uint256 newCloseFactorMantissa) external {
        _checkAccessAllowed("setCloseFactor(uint256)");
        if (newCloseFactorMantissa > MAX_CLOSE_FACTOR_MANTISSA) {
            revert InvalidCloseFactor();
        }

        if (newCloseFactorMantissa < MIN_CLOSE_FACTOR_MANTISSA) {
            revert InvalidCloseFactor();
        }

        uint256 oldCloseFactorMantissa = closeFactorMantissa;
        closeFactorMantissa = newCloseFactorMantissa;
        emit NewCloseFactor(oldCloseFactorMantissa, newCloseFactorMantissa);
    }

    /**
     * @notice Sets the collateralFactor for a market
     * @dev This function is restricted by the AccessControlManager
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @param newLiquidationThresholdMantissa The new liquidation threshold, scaled by 1e18
     * @custom:event Emits NewCollateralFactor when collateral factor is updated
     *    and NewLiquidationThreshold when liquidation threshold is updated
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error InvalidCollateralFactor error is thrown when collateral factor is too high
     * @custom:error InvalidLiquidationThreshold error is thrown when liquidation threshold is lower than collateral factor
     * @custom:error PriceError is thrown when the oracle returns an invalid price for the asset
     * @custom:access Controlled by AccessControlManager
     */
    function setCollateralFactor(
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external {
        _checkAccessAllowed("setCollateralFactor(address,uint256,uint256)");

        // Verify market is listed
        Market storage market = markets[address(vToken)];
        if (!market.isListed) {
            revert MarketNotListed(address(vToken));
        }

        // Check collateral factor <= 0.9
        if (newCollateralFactorMantissa > MAX_COLLATERAL_FACTOR_MANTISSA) {
            revert InvalidCollateralFactor();
        }

        // Ensure that liquidation threshold <= 1
        if (newLiquidationThresholdMantissa > MANTISSA_ONE) {
            revert InvalidLiquidationThreshold();
        }

        // Ensure that liquidation threshold >= CF
        if (newLiquidationThresholdMantissa < newCollateralFactorMantissa) {
            revert InvalidLiquidationThreshold();
        }

        // If collateral factor != 0, fail if price == 0
        if (newCollateralFactorMantissa != 0 && oracle.getUnderlyingPrice(address(vToken)) == 0) {
            revert PriceError(address(vToken));
        }

        uint256 oldCollateralFactorMantissa = market.collateralFactorMantissa;
        if (newCollateralFactorMantissa != oldCollateralFactorMantissa) {
            market.collateralFactorMantissa = newCollateralFactorMantissa;
            emit NewCollateralFactor(vToken, oldCollateralFactorMantissa, newCollateralFactorMantissa);
        }

        uint256 oldLiquidationThresholdMantissa = market.liquidationThresholdMantissa;
        if (newLiquidationThresholdMantissa != oldLiquidationThresholdMantissa) {
            market.liquidationThresholdMantissa = newLiquidationThresholdMantissa;
            emit NewLiquidationThreshold(vToken, oldLiquidationThresholdMantissa, newLiquidationThresholdMantissa);
        }
    }

    /**
     * @notice Sets the liquidation incentive applied to any market that has no incentive of its own
     * @dev This function is restricted by the AccessControlManager
     * @dev `PoolRegistry.addPool` calls this while registering the pool, so the value clears the floor below by the
     * time any market can be listed.
     *
     * This value has to stay at or above `1e18 + protocolSeizeShareMantissa` of every market that has no incentive of
     * its own, or a liquidator of that market's collateral receives less than the debt it repaid. The shares of those
     * markets are only readable market by market, so what is enforced here is the floor for a market at the default
     * share: `MIN_POOL_LIQUIDATION_INCENTIVE_MANTISSA`. That covers a freshly listed market, which is the case
     * nothing else was watching, and it is where this fork parts with upstream `Comptroller` - which stops at 1e18
     * and would let a pool be registered one that pays every default-share market's liquidator less than it repaid.
     * A market whose share is raised above the default still needs an incentive of its own;
     * `setMarketLiquidationIncentive` bounds that from one side and `VToken.setProtocolSeizeShare` from the other.
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @custom:event Emits NewLiquidationIncentive on success
     * @custom:error InvalidLiquidationIncentive is thrown if the new incentive is below
     *   `MIN_POOL_LIQUIDATION_INCENTIVE_MANTISSA`
     * @custom:access Controlled by AccessControlManager
     */
    function setLiquidationIncentive(uint256 newLiquidationIncentiveMantissa) external {
        _checkAccessAllowed("setLiquidationIncentive(uint256)");

        // Upstream `Comptroller` stops at 1e18 and rejects with a revert string. Raised to the floor a default-share
        // market needs, and reduced to the custom error the per-market setter uses, so that the same condition
        // reports the same way from both.
        if (newLiquidationIncentiveMantissa < MIN_POOL_LIQUIDATION_INCENTIVE_MANTISSA) {
            revert InvalidLiquidationIncentive();
        }

        // Save current value for use in log
        uint256 oldLiquidationIncentiveMantissa = _poolLiquidationIncentiveMantissa;

        // Set liquidation incentive to new incentive
        _poolLiquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);
    }

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Only callable by the PoolRegistry
     * @param vToken The address of the market (token) to list
     * @custom:error MarketAlreadyListed is thrown if the market is already listed in this pool
     * @custom:error InvalidVToken is thrown if the market does not identify itself as a VToken
     * @custom:access Only PoolRegistry
     */
    function supportMarket(VToken vToken) external {
        _checkSenderIs(poolRegistry);

        if (markets[address(vToken)].isListed) {
            revert MarketAlreadyListed(address(vToken));
        }

        // Sanity check to make sure its really a VToken
        if (!vToken.isVToken()) {
            revert InvalidVToken();
        }

        Market storage newMarket = markets[address(vToken)];
        newMarket.isListed = true;
        newMarket.collateralFactorMantissa = 0;
        newMarket.liquidationThresholdMantissa = 0;

        _addMarket(address(vToken));

        uint256 rewardDistributorsCount = rewardsDistributors.length;

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            rewardsDistributors[i].initializeMarket(address(vToken));
        }

        emit MarketSupported(vToken);
    }

    /**
     * @notice Set the given borrow caps for the given vToken markets. Borrowing that brings total borrows to or above borrow cap will revert.
     * @dev This function is restricted by the AccessControlManager
     * @dev A borrow cap of type(uint256).max corresponds to unlimited borrowing.
     * @dev Borrow caps smaller than the current total borrows are accepted. This way, new borrows will not be allowed
            until the total borrows amount goes below the new borrow cap
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of type(uint256).max corresponds to unlimited borrowing.
     * @custom:error InvalidArrayLength is thrown if the arrays are empty or their lengths do not match
     * @custom:access Controlled by AccessControlManager
     */
    function setMarketBorrowCaps(VToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external {
        _checkAccessAllowed("setMarketBorrowCaps(address[],uint256[])");

        uint256 numMarkets = vTokens.length;
        uint256 numBorrowCaps = newBorrowCaps.length;

        if (numMarkets == 0 || numMarkets != numBorrowCaps) {
            revert InvalidArrayLength();
        }

        _ensureMaxLoops(numMarkets);

        for (uint256 i; i < numMarkets; ++i) {
            borrowCaps[address(vTokens[i])] = newBorrowCaps[i];
            emit NewBorrowCap(vTokens[i], newBorrowCaps[i]);
        }
    }

    /**
     * @notice Set the given supply caps for the given vToken markets. Supply that brings total Supply to or above supply cap will revert.
     * @dev This function is restricted by the AccessControlManager
     * @dev A supply cap of type(uint256).max corresponds to unlimited supply.
     * @dev Supply caps smaller than the current total supplies are accepted. This way, new supplies will not be allowed
            until the total supplies amount goes below the new supply cap
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of type(uint256).max corresponds to unlimited supply.
     * @custom:error InvalidArrayLength is thrown if the arrays are empty or their lengths do not match
     * @custom:access Controlled by AccessControlManager
     */
    function setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external {
        _checkAccessAllowed("setMarketSupplyCaps(address[],uint256[])");
        uint256 vTokensCount = vTokens.length;

        if (vTokensCount == 0 || vTokensCount != newSupplyCaps.length) {
            revert InvalidArrayLength();
        }

        _ensureMaxLoops(vTokensCount);

        for (uint256 i; i < vTokensCount; ++i) {
            supplyCaps[address(vTokens[i])] = newSupplyCaps[i];
            emit NewSupplyCap(vTokens[i], newSupplyCaps[i]);
        }
    }

    /**
     * @notice Pause/unpause specified actions
     * @dev This function is restricted by the AccessControlManager
     * @param marketsList Markets to pause/unpause the actions on
     * @param actionsList List of action ids to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     * @custom:error MarketNotListed is thrown if any of the markets is not listed
     * @custom:access Controlled by AccessControlManager
     */
    function setActionsPaused(VToken[] calldata marketsList, Action[] calldata actionsList, bool paused) external {
        _checkAccessAllowed("setActionsPaused(address[],uint256[],bool)");

        uint256 marketsCount = marketsList.length;
        uint256 actionsCount = actionsList.length;

        _ensureMaxLoops(marketsCount * actionsCount);

        for (uint256 marketIdx; marketIdx < marketsCount; ++marketIdx) {
            for (uint256 actionIdx; actionIdx < actionsCount; ++actionIdx) {
                _setActionPaused(address(marketsList[marketIdx]), actionsList[actionIdx], paused);
            }
        }
    }

    /**
     * @notice Set the given collateral threshold for non-batch liquidations. Regular liquidations
     *   will fail if the collateral amount is less than this threshold. Liquidators should use batch
     *   operations like liquidateAccount or healAccount.
     * @dev This function is restricted by the AccessControlManager
     * @param newMinLiquidatableCollateral The new min liquidatable collateral (in USD).
     * @custom:access Controlled by AccessControlManager
     */
    function setMinLiquidatableCollateral(uint256 newMinLiquidatableCollateral) external {
        _checkAccessAllowed("setMinLiquidatableCollateral(uint256)");

        uint256 oldMinLiquidatableCollateral = minLiquidatableCollateral;
        minLiquidatableCollateral = newMinLiquidatableCollateral;
        emit NewMinLiquidatableCollateral(oldMinLiquidatableCollateral, newMinLiquidatableCollateral);
    }

    /**
     * @notice Add a new RewardsDistributor and initialize it with all markets. We can add several RewardsDistributor
     * contracts with the same rewardToken, and there could be overlaping among them considering the last reward slot (block or second)
     * @dev Only callable by the admin
     * @param _rewardsDistributor Address of the RewardDistributor contract to add
     * @custom:access Only Governance
     * @custom:event Emits NewRewardsDistributor with distributor address
     * @custom:error RewardsDistributorAlreadyExists is thrown if this pool already has the given distributor
     */
    function addRewardsDistributor(RewardsDistributor _rewardsDistributor) external onlyOwner {
        if (rewardsDistributorExists[address(_rewardsDistributor)]) {
            revert RewardsDistributorAlreadyExists();
        }

        uint256 rewardsDistributorsLen = rewardsDistributors.length;
        _ensureMaxLoops(rewardsDistributorsLen + 1);

        rewardsDistributors.push(_rewardsDistributor);
        rewardsDistributorExists[address(_rewardsDistributor)] = true;

        uint256 marketsCount = allMarkets.length;

        for (uint256 i; i < marketsCount; ++i) {
            _rewardsDistributor.initializeMarket(address(allMarkets[i]));
        }

        emit NewRewardsDistributor(address(_rewardsDistributor), address(_rewardsDistributor.rewardToken()));
    }

    /**
     * @notice Sets a new price oracle for the Comptroller
     * @dev Only callable by the admin
     * @param newOracle Address of the new price oracle to set
     * @custom:event Emits NewPriceOracle on success
     * @custom:error ZeroAddressNotAllowed is thrown when the new oracle address is zero
     */
    function setPriceOracle(ResilientOracleInterface newOracle) external onlyOwner {
        ensureNonzeroAddress(address(newOracle));

        ResilientOracleInterface oldOracle = oracle;
        oracle = newOracle;
        emit NewPriceOracle(oldOracle, newOracle);
    }

    /**
     * @notice Sets a new deviation-bounded oracle for the Comptroller
     * @dev Only callable by the admin. Nothing falls back to spot when this is unset: both of the calls into the zero
     *  address revert, so borrow and redeem fail closed rather than running unbounded, and this has to be set before
     *  the pool serves either action. `_updateProtectionStates` is the one that fails first and it is the stronger of
     *  the two guards, because solc emits an `extcodesize` existence check ahead of a call whose return data it does
     *  not decode, which is exactly that call. `_safeGetPrices` gets no such check and instead relies on the ABI
     *  decoder rejecting the empty return data.
     * @param newBoundedOracle Address of the new deviation-bounded oracle to set
     * @custom:event Emits NewDeviationBoundedOracle on success
     * @custom:error ZeroAddressNotAllowed is thrown when the new oracle address is zero
     */
    function setDeviationBoundedOracle(IDeviationBoundedOracle newBoundedOracle) external onlyOwner {
        ensureNonzeroAddress(address(newBoundedOracle));

        IDeviationBoundedOracle oldBoundedOracle = deviationBoundedOracle;
        deviationBoundedOracle = newBoundedOracle;
        emit NewDeviationBoundedOracle(oldBoundedOracle, newBoundedOracle);
    }

    /**
     * @notice Set the for loop iteration limit to avoid DOS
     * @param limit Limit for the max loops can execute at a time
     */
    function setMaxLoopsLimit(uint256 limit) external onlyOwner {
        _setMaxLoopsLimit(limit);
    }

    /**
     * @notice Enables forced liquidations for a market. If forced liquidation is enabled,
     * borrows in the market may be liquidated regardless of the account liquidity
     * @param vTokenBorrowed Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function setForcedLiquidation(address vTokenBorrowed, bool enable) external {
        _checkAccessAllowed("setForcedLiquidation(address,bool)");
        ensureNonzeroAddress(vTokenBorrowed);

        if (!markets[vTokenBorrowed].isListed) {
            revert MarketNotListed(vTokenBorrowed);
        }

        isForcedLiquidationEnabled[vTokenBorrowed] = enable;
        emit IsForcedLiquidationEnabledUpdated(vTokenBorrowed, enable);
    }

    /**
     * @notice Sets the discount a liquidator receives on the collateral it seizes from a single market
     * @dev This function is restricted by the AccessControlManager
     * @dev Keyed on the collateral market, since that is what the discount prices. Setting it steers liquidators
     * toward one collateral over another, and it feeds the routing between `liquidateAccount` and `healAccount`
     * through `AccountLiquiditySnapshot.maxClearableDebt`.
     *
     * There is no way back to "unset" once a value is stored: `0` is the sentinel that means the pool-wide discount
     * applies, and it is rejected here so that a mistaken zero cannot silently move a market back onto the pool-wide
     * value. Pass that value explicitly to get the same effect.
     * @param vToken The collateral market to set the incentive for
     * @param newLiquidationIncentiveMantissa New incentive for this market, scaled by 1e18, at least
     *   1e18 + the market's `protocolSeizeShareMantissa`
     * @custom:event Emits NewMarketLiquidationIncentive on success
     * @custom:error MarketNotListed is thrown if the market is not listed
     * @custom:error InvalidLiquidationIncentive is thrown if the new incentive would leave the liquidator with less
     *   collateral than the debt it repaid
     * @custom:access Controlled by AccessControlManager
     */
    function setMarketLiquidationIncentive(address vToken, uint256 newLiquidationIncentiveMantissa) external {
        _checkAccessAllowed("setMarketLiquidationIncentive(address,uint256)");

        // Checked before reading from `vToken` below, so this never calls out to an arbitrary address
        if (!markets[vToken].isListed) {
            revert MarketNotListed(vToken);
        }

        // The incentive is a multiplier on the debt repaid, and `VToken._seize` hands the protocol
        // `protocolSeizeShareMantissa` of that debt out of the seized collateral, so an incentive below
        // `1e18 + protocolSeizeShareMantissa` pays the liquidator less collateral than it repaid and no one liquidates
        // this collateral. The 1e18 floor falls out of the same bound, since the seize share is never negative.
        // `VToken.setProtocolSeizeShare` holds the bound from the other side: it reads the incentive back through
        // `liquidationIncentiveMantissa()`, which answers for the calling market.
        if (newLiquidationIncentiveMantissa < MANTISSA_ONE + VToken(vToken).protocolSeizeShareMantissa()) {
            revert InvalidLiquidationIncentive();
        }

        uint256 oldLiquidationIncentiveMantissa = liquidationIncentives[vToken];
        liquidationIncentives[vToken] = newLiquidationIncentiveMantissa;
        emit NewMarketLiquidationIncentive(vToken, oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);
    }

    /**
     * @notice Restricts supplying to a market to the accounts on its supply allowlist, or lifts the restriction
     * @dev Enforced in `preMintHook`, so only supply is metered. Redeeming is never restricted, and an account
     * removed from the allowlist keeps the position it already holds and can still exit. Enabling it on a market that
     * is already serving supply cuts off every account that is not on the list, the seed supplier included.
     * @param vToken The market to change the setting for
     * @param enabled Whether the market should accept supply only from allowlisted accounts
     * @custom:event Emits SupplyAllowlistEnabledUpdated on success
     * @custom:error MarketNotListed is thrown if the market is not listed
     * @custom:access Controlled by AccessControlManager
     */
    function setSupplyAllowlistEnabled(address vToken, bool enabled) external {
        _checkAccessAllowed("setSupplyAllowlistEnabled(address,bool)");

        if (!markets[vToken].isListed) {
            revert MarketNotListed(vToken);
        }

        isSupplyAllowlistEnabled[vToken] = enabled;
        emit SupplyAllowlistEnabledUpdated(vToken, enabled);
    }

    /**
     * @notice Adds an account to a market's supply allowlist or removes it
     * @dev Takes effect only while the market's supply allowlist is enabled. Setting an account to the value it
     * already holds is not an error, so a governance action that overlaps an earlier one still executes.
     * @param vToken The market whose allowlist to update
     * @param supplier The account to add or remove
     * @param allowed Whether the account should be allowed to supply
     * @custom:event Emits AllowedSupplierUpdated on success
     * @custom:error MarketNotListed is thrown if the market is not listed
     * @custom:error ZeroAddressNotAllowed is thrown if the account is the zero address
     * @custom:access Controlled by AccessControlManager
     */
    function setAllowedSupplier(address vToken, address supplier, bool allowed) external {
        _checkAccessAllowed("setAllowedSupplier(address,address,bool)");
        ensureNonzeroAddress(supplier);

        if (!markets[vToken].isListed) {
            revert MarketNotListed(vToken);
        }

        isAllowedSupplier[vToken][supplier] = allowed;
        emit AllowedSupplierUpdated(vToken, supplier, allowed);
    }

    /**
     * @notice Restricts seizing collateral in this pool to the accounts on the liquidation allowlist, or lifts the
     * restriction
     * @dev Pool-wide rather than per market, for the reason given on `isLiquidationAllowlistEnabled`. Enabling this
     * also restricts `healAccount`, so any keeper relied on to record bad debt has to be allowlisted too.
     * @param enabled Whether seizing collateral should be restricted to allowlisted accounts
     * @custom:event Emits LiquidationAllowlistEnabledUpdated on success
     * @custom:access Controlled by AccessControlManager
     */
    function setLiquidationAllowlistEnabled(bool enabled) external {
        _checkAccessAllowed("setLiquidationAllowlistEnabled(bool)");

        isLiquidationAllowlistEnabled = enabled;
        emit LiquidationAllowlistEnabledUpdated(enabled);
    }

    /**
     * @notice Adds an account to the pool's liquidation allowlist or removes it
     * @dev Takes effect only while the liquidation allowlist is enabled.
     * @param liquidator The account to add or remove
     * @param allowed Whether the account should be allowed to seize collateral
     * @custom:event Emits AllowedLiquidatorUpdated on success
     * @custom:error ZeroAddressNotAllowed is thrown if the account is the zero address
     * @custom:access Controlled by AccessControlManager
     */
    function setAllowedLiquidator(address liquidator, bool allowed) external {
        _checkAccessAllowed("setAllowedLiquidator(address,bool)");
        ensureNonzeroAddress(liquidator);

        isAllowedLiquidator[liquidator] = allowed;
        emit AllowedLiquidatorUpdated(liquidator, allowed);
    }

    /**
     * @notice Determine the current account liquidity with respect to liquidation threshold requirements
     * @dev The interface of this function is intentionally kept compatible with Compound and Venus Core
     * @param account The account get liquidity for
     * @return error Always NO_ERROR for compatibility with Venus core tooling
     * @return liquidity Account liquidity in excess of liquidation threshold requirements,
     * @return shortfall Account shortfall below liquidation threshold requirements
     */
    function getAccountLiquidity(
        address account
    ) external view returns (uint256 error, uint256 liquidity, uint256 shortfall) {
        AccountLiquiditySnapshot memory snapshot = _getCurrentLiquiditySnapshot(
            account,
            WeightFunction.USE_LIQUIDATION_THRESHOLD
        );
        return (NO_ERROR, snapshot.liquidity, snapshot.shortfall);
    }

    /**
     * @notice Determine the current account liquidity with respect to collateral requirements
     * @dev The interface of this function is intentionally kept compatible with Compound and Venus Core
     * @param account The account get liquidity for
     * @return error Always NO_ERROR for compatibility with Venus core tooling
     * @return liquidity Account liquidity in excess of collateral requirements,
     * @return shortfall Account shortfall below collateral requirements
     */
    function getBorrowingPower(
        address account
    ) external view returns (uint256 error, uint256 liquidity, uint256 shortfall) {
        AccountLiquiditySnapshot memory snapshot = _getCurrentLiquiditySnapshot(
            account,
            WeightFunction.USE_COLLATERAL_FACTOR
        );
        return (NO_ERROR, snapshot.liquidity, snapshot.shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @dev The interface of this function is intentionally kept compatible with Compound and Venus Core
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return error Always NO_ERROR for compatibility with Venus core tooling
     * @return liquidity Hypothetical account liquidity in excess of collateral requirements,
     * @return shortfall Hypothetical account shortfall below collateral requirements
     */
    function getHypotheticalAccountLiquidity(
        address account,
        address vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256 error, uint256 liquidity, uint256 shortfall) {
        AccountLiquiditySnapshot memory snapshot = _getHypotheticalLiquiditySnapshot(
            account,
            VToken(vTokenModify),
            redeemTokens,
            borrowAmount,
            WeightFunction.USE_COLLATERAL_FACTOR
        );
        return (NO_ERROR, snapshot.liquidity, snapshot.shortfall);
    }

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market.
     * @return markets The list of market addresses
     */
    function getAllMarkets() external view override returns (VToken[] memory) {
        return allMarkets;
    }

    /**
     * @notice Check if a market is marked as listed (active)
     * @param vToken vToken Address for the market to check
     * @return listed True if listed otherwise false
     */
    function isMarketListed(VToken vToken) external view returns (bool) {
        return markets[address(vToken)].isListed;
    }

    /**
     * @notice Returns the discount a liquidator receives on the collateral it seizes from the calling market
     * @dev Answers for `msg.sender` instead of taking the market as an argument, because this is the getter
     * `ComptrollerViewInterface` declares and `VToken` calls on itself: `_seize` divides the protocol seize share by
     * it, and `setProtocolSeizeShare` bounds that share against it. Both have to see the discount that prices the
     * calling market's own collateral, or the protocol takes more than its configured share of the repaid debt and the
     * liquidator is paid less than the market's configured discount.
     *
     * Any caller that is not a market of this pool, a lens or a liquidation bot, reads the pool-wide discount. Ask
     * about a specific market through `effectiveLiquidationIncentive`.
     * @return The discount that applies to the caller, scaled by 1e18
     */
    function liquidationIncentiveMantissa() external view returns (uint256) {
        return _liquidationIncentive(msg.sender);
    }

    /**
     * @notice Returns the discount a liquidator receives on the collateral it seizes from a market
     * @param vToken The collateral market to read the discount of
     * @return The market's own discount if it has one, otherwise the pool-wide discount, scaled by 1e18
     */
    function effectiveLiquidationIncentive(address vToken) external view returns (uint256) {
        return _liquidationIncentive(vToken);
    }

    /*** Assets You Are In ***/

    /**
     * @notice Returns whether the given account is entered in a given market
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the market specified, otherwise false.
     */
    function checkMembership(address account, VToken vToken) external view returns (bool) {
        return markets[address(vToken)].accountMembership[account];
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenBorrowed The address of the borrowed vToken
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return error Always NO_ERROR for compatibility with Venus core tooling
     * @return tokensToSeize Number of vTokenCollateral tokens to be seized in a liquidation
     * @custom:error PriceError if the oracle returns an invalid price
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view override returns (uint256 error, uint256 tokensToSeize) {
        /* Read oracle prices for borrowed and collateral markets */
        uint256 priceBorrowedMantissa = _safeGetUnderlyingPrice(VToken(vTokenBorrowed));
        uint256 priceCollateralMantissa = _safeGetUnderlyingPrice(VToken(vTokenCollateral));

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize, where
         * `liquidationIncentive` is the collateral market's own discount if it has one and the pool-wide default
         * otherwise, the same value `VToken._seize` reads back through `liquidationIncentiveMantissa()`:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint256 exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint256 seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;

        numerator = mul_(
            Exp({ mantissa: _liquidationIncentive(vTokenCollateral) }),
            Exp({ mantissa: priceBorrowedMantissa })
        );
        denominator = mul_(Exp({ mantissa: priceCollateralMantissa }), Exp({ mantissa: exchangeRateMantissa }));
        ratio = div_(numerator, denominator);

        seizeTokens = mul_ScalarTruncate(ratio, actualRepayAmount);

        return (NO_ERROR, seizeTokens);
    }

    /**
     * @notice Returns reward speed given a vToken
     * @param vToken The vToken to get the reward speeds for
     * @return rewardSpeeds Array of total supply and borrow speeds and reward token for all reward distributors
     */
    function getRewardsByMarket(address vToken) external view returns (RewardSpeeds[] memory rewardSpeeds) {
        uint256 rewardsDistributorsLength = rewardsDistributors.length;
        rewardSpeeds = new RewardSpeeds[](rewardsDistributorsLength);
        for (uint256 i; i < rewardsDistributorsLength; ++i) {
            RewardsDistributor rewardsDistributor = rewardsDistributors[i];
            address rewardToken = address(rewardsDistributor.rewardToken());
            rewardSpeeds[i] = RewardSpeeds({
                rewardToken: rewardToken,
                supplySpeed: rewardsDistributor.rewardTokenSupplySpeeds(vToken),
                borrowSpeed: rewardsDistributor.rewardTokenBorrowSpeeds(vToken)
            });
        }
        return rewardSpeeds;
    }

    /**
     * @notice Return all reward distributors for this pool
     * @return Array of RewardDistributor addresses
     */
    function getRewardDistributors() external view returns (RewardsDistributor[] memory) {
        return rewardsDistributors;
    }

    /**
     * @notice A marker method that returns true for a valid Comptroller contract
     * @return Always true
     */
    function isComptroller() external pure override returns (bool) {
        return true;
    }

    /**
     * @notice Update the prices of all the tokens associated with the provided account
     * @param account Address of the account to get associated tokens with
     */
    function updatePrices(address account) public {
        _updatePrices(getAssetsIn(account));
    }

    /**
     * @notice Checks if a certain action is paused on a market
     * @param market vToken address
     * @param action Action to check
     * @return paused True if the action is paused otherwise false
     */
    function actionPaused(address market, Action action) public view returns (bool) {
        return _actionPaused[market][action];
    }

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A list with the assets the account has entered
     */
    function getAssetsIn(address account) public view returns (VToken[] memory) {
        uint256 len;
        VToken[] memory _accountAssets = accountAssets[account];
        uint256 _accountAssetsLength = _accountAssets.length;

        VToken[] memory assetsIn = new VToken[](_accountAssetsLength);

        for (uint256 i; i < _accountAssetsLength; ++i) {
            Market storage market = markets[address(_accountAssets[i])];
            if (market.isListed) {
                assetsIn[len] = _accountAssets[i];
                ++len;
            }
        }

        assembly {
            mstore(assetsIn, len)
        }

        return assetsIn;
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param vToken The market to enter
     * @param borrower The address of the account to modify
     */
    function _addToMarket(VToken vToken, address borrower) internal {
        _checkActionPauseState(address(vToken), Action.ENTER_MARKET);
        Market storage marketToJoin = markets[address(vToken)];

        if (!marketToJoin.isListed) {
            revert MarketNotListed(address(vToken));
        }

        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return;
        }

        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(vToken);

        emit MarketEntered(vToken, borrower);
    }

    /**
     * @notice Internal function to validate that a market hasn't already been added
     * and if it hasn't adds it
     * @param vToken The market to support
     */
    function _addMarket(address vToken) internal {
        uint256 marketsCount = allMarkets.length;

        for (uint256 i; i < marketsCount; ++i) {
            if (allMarkets[i] == VToken(vToken)) {
                revert MarketAlreadyListed(vToken);
            }
        }
        allMarkets.push(VToken(vToken));
        marketsCount = allMarkets.length;
        _ensureMaxLoops(marketsCount);
    }

    /**
     * @dev Pause/unpause an action on a market
     * @param market Market to pause/unpause the action on
     * @param action Action id to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function _setActionPaused(address market, Action action, bool paused) internal {
        if (!markets[market].isListed) {
            revert MarketNotListed(market);
        }
        _actionPaused[market][action] = paused;
        emit ActionPausedMarket(VToken(market), action, paused);
    }

    /**
     * @dev Pushes an oracle update for each of the given markets. Takes the resolved market list rather than an
     *  account, because the two callers that need protection state as well would otherwise walk `getAssetsIn` twice
     *  for the same account in the same call.
     * @param vTokens The markets to update, as returned by `getAssetsIn`
     */
    function _updatePrices(VToken[] memory vTokens) internal {
        uint256 vTokensCount = vTokens.length;

        ResilientOracleInterface oracle_ = oracle;

        for (uint256 i; i < vTokensCount; ++i) {
            oracle_.updatePrice(address(vTokens[i]));
        }
    }

    /**
     * @dev Persists the deviation-bounded oracle's price window and protection state for each of the given markets.
     *  Runs before the borrow and redeem liquidity checks, the ones weighted by the collateral factor, so that a
     *  deviating print latches protection and starts its cooldown instead of evaporating once the price returns to
     *  the window. The liquidation-threshold paths never call this, matching how they read spot prices: see
     *  `_safeGetPrices`.
     * @param vTokens The markets to update, as returned by `getAssetsIn`
     */
    function _updateProtectionStates(VToken[] memory vTokens) internal {
        uint256 vTokensCount = vTokens.length;

        IDeviationBoundedOracle boundedOracle = deviationBoundedOracle;

        for (uint256 i; i < vTokensCount; ++i) {
            boundedOracle.updateProtectionState(address(vTokens[i]));
        }
    }

    /**
     * @dev Internal function to check that vTokens can be safely redeemed for the underlying asset.
     * @param vToken Address of the vTokens to redeem
     * @param redeemer Account redeeming the tokens
     * @param redeemTokens The number of tokens to redeem
     */
    function _checkRedeemAllowed(address vToken, address redeemer, uint256 redeemTokens) internal {
        Market storage market = markets[vToken];

        if (!market.isListed) {
            revert MarketNotListed(address(vToken));
        }

        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!market.accountMembership[redeemer]) {
            return;
        }

        // Update the prices of tokens
        VToken[] memory redeemerAssets = getAssetsIn(redeemer);
        _updatePrices(redeemerAssets);
        _updateProtectionStates(redeemerAssets);

        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        AccountLiquiditySnapshot memory snapshot = _getHypotheticalLiquiditySnapshot(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0,
            WeightFunction.USE_COLLATERAL_FACTOR
        );
        if (snapshot.shortfall > 0) {
            revert InsufficientLiquidity();
        }
    }

    /**
     * @notice Get the total collateral, weighted collateral, borrow balance, liquidity, shortfall
     * @param account The account to get the snapshot for
     * @param weighting Which per-market risk parameter weights the collateral, either the collateral factor or
     *  the liquidation threshold
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return snapshot Account liquidity snapshot
     */
    function _getCurrentLiquiditySnapshot(
        address account,
        WeightFunction weighting
    ) internal view returns (AccountLiquiditySnapshot memory snapshot) {
        return _getHypotheticalLiquiditySnapshot(account, VToken(address(0)), 0, 0, weighting);
    }

    /**
     * @notice Determine what the supply/borrow balances would be if the given amounts were redeemed/borrowed
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @param weighting Which per-market risk parameter weights the collateral, either the collateral factor or
     *  the liquidation threshold
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return snapshot Account liquidity snapshot
     */
    function _getHypotheticalLiquiditySnapshot(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        WeightFunction weighting
    ) internal view returns (AccountLiquiditySnapshot memory snapshot) {
        // For each asset the account is in
        VToken[] memory assets = getAssetsIn(account);
        uint256 assetsCount = assets.length;

        for (uint256 i; i < assetsCount; ++i) {
            VToken asset = assets[i];
            (Exp memory weightedVTokenPrice, Exp memory debtPrice) = _accumulateMarket(
                snapshot,
                asset,
                account,
                weighting
            );

            // Calculate effects of interacting with vTokenModify
            if (asset == vTokenModify) {
                // redeem effect
                // effects += tokensToDenom * redeemTokens
                snapshot.effects = mul_ScalarTruncateAddUInt(weightedVTokenPrice, redeemTokens, snapshot.effects);

                // borrow effect
                // effects += debtPrice * borrowAmount
                snapshot.effects = mul_ScalarTruncateAddUInt(debtPrice, borrowAmount, snapshot.effects);
            }
        }

        uint256 borrowPlusEffects = snapshot.borrows + snapshot.effects;
        // These are safe, as the underflow condition is checked first
        unchecked {
            if (snapshot.weightedCollateral > borrowPlusEffects) {
                snapshot.liquidity = snapshot.weightedCollateral - borrowPlusEffects;
                snapshot.shortfall = 0;
            } else {
                snapshot.liquidity = 0;
                snapshot.shortfall = borrowPlusEffects - snapshot.weightedCollateral;
            }
        }

        return snapshot;
    }

    /**
     * @dev Adds one market's collateral and debt to an account's liquidity snapshot, and returns the two prices the
     *  caller needs to apply a hypothetical redeem or borrow in that market. Split out of
     *  `_getHypotheticalLiquiditySnapshot` because holding this market's prices and the loop's own variables in one
     *  frame exceeds the stack the legacy code generator can address, and this repo does not enable `viaIR`.
     *  `snapshot` is a memory reference, so the accumulated fields are updated in place.
     * @param snapshot The snapshot to accumulate into
     * @param asset The market to value
     * @param account The account whose position in the market is being valued
     * @param weighting Which per-market risk parameter weights the collateral
     * @return weightedVTokenPrice Value of one vToken after the risk weight, which prices a hypothetical redeem
     * @return debtPrice Price valuing the market's debt, which prices a hypothetical borrow
     */
    function _accumulateMarket(
        AccountLiquiditySnapshot memory snapshot,
        VToken asset,
        address account,
        WeightFunction weighting
    ) internal view returns (Exp memory weightedVTokenPrice, Exp memory debtPrice) {
        // Read the balances and exchange rate from the vToken
        (uint256 vTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa) = _safeGetAccountSnapshot(
            asset,
            account
        );

        // Get the normalized prices that value this market's collateral and debt
        Exp memory collateralPrice;
        (collateralPrice, debtPrice) = _safeGetPrices(asset, weighting);

        // Pre-compute conversion factors from vTokens -> usd
        Exp memory vTokenPrice = mul_(Exp({ mantissa: exchangeRateMantissa }), collateralPrice);
        weightedVTokenPrice = mul_(_weight(asset, weighting), vTokenPrice);

        // weightedCollateral += weightedVTokenPrice * vTokenBalance
        snapshot.weightedCollateral = mul_ScalarTruncateAddUInt(
            weightedVTokenPrice,
            vTokenBalance,
            snapshot.weightedCollateral
        );

        // totalCollateral += vTokenPrice * vTokenBalance
        snapshot.totalCollateral = mul_ScalarTruncateAddUInt(vTokenPrice, vTokenBalance, snapshot.totalCollateral);

        // maxClearableDebt += (vTokenPrice * vTokenBalance) / liquidationIncentive, at this market's own incentive.
        // Only the liquidation-threshold weighting gives this field a meaning and only that weighting's callers read
        // it, so a collateral-factor snapshot would read the incentive and divide only to discard the result: see the
        // note on `AccountLiquiditySnapshot.maxClearableDebt`. Also skipped when the account holds none of this
        // market, since the term would be zero and a borrower is a member of every market it borrows from, including
        // ones it holds no collateral in. The repeated product costs nothing, the optimizer shares it with the line
        // above.
        if (weighting == WeightFunction.USE_LIQUIDATION_THRESHOLD && vTokenBalance != 0) {
            snapshot.maxClearableDebt += div_(
                mul_ScalarTruncate(vTokenPrice, vTokenBalance),
                Exp({ mantissa: _liquidationIncentive(address(asset)) })
            );
        }

        // borrows += debtPrice * borrowBalance
        snapshot.borrows = mul_ScalarTruncateAddUInt(debtPrice, borrowBalance, snapshot.borrows);
    }

    /**
     * @dev Retrieves price from oracle for an asset and checks it is nonzero
     * @param asset Address for asset to query price
     * @return Underlying price
     */
    function _safeGetUnderlyingPrice(VToken asset) internal view returns (uint256) {
        uint256 oraclePriceMantissa = oracle.getUnderlyingPrice(address(asset));
        if (oraclePriceMantissa == 0) {
            revert PriceError(address(asset));
        }
        return oraclePriceMantissa;
    }

    /**
     * @dev Retrieves the two prices that value a market's collateral and its debt, and checks they are nonzero.
     *  Under the collateral factor both come from `deviationBoundedOracle`: while protection is active for the asset
     *  it values collateral at the low end of the asset's recent price window and debt at the high end, and it returns
     *  spot on both legs otherwise, including for an asset it holds no configuration for. A deviating print can
     *  therefore only ever shrink an account's borrowing capacity, never inflate it. Under the liquidation threshold
     *  both legs are spot, because those snapshots route an unhealthy account between `liquidateAccount` and
     *  `healAccount` and set how much of its debt healing repays, which has to track the live price.
     * @param asset Address for asset to query prices for
     * @param weighting Which risk parameter weights the position being valued
     * @return collateralPrice Price valuing the collateral held in the market
     * @return debtPrice Price valuing the debt owed to the market
     */
    function _safeGetPrices(
        VToken asset,
        WeightFunction weighting
    ) internal view returns (Exp memory collateralPrice, Exp memory debtPrice) {
        if (weighting == WeightFunction.USE_LIQUIDATION_THRESHOLD) {
            uint256 spotPriceMantissa = _safeGetUnderlyingPrice(asset);
            return (Exp({ mantissa: spotPriceMantissa }), Exp({ mantissa: spotPriceMantissa }));
        }

        (uint256 collateralPriceMantissa, uint256 debtPriceMantissa) = deviationBoundedOracle.getBoundedPricesView(
            address(asset)
        );
        if (collateralPriceMantissa == 0 || debtPriceMantissa == 0) {
            revert PriceError(address(asset));
        }
        return (Exp({ mantissa: collateralPriceMantissa }), Exp({ mantissa: debtPriceMantissa }));
    }

    /**
     * @dev Returns the risk parameter that weights a market's collateral in a liquidity snapshot
     * @param asset Address for asset whose parameter to read
     * @param weighting Which of the two parameters to read
     * @return The market's collateral factor or liquidation threshold, as an exponential
     */
    function _weight(VToken asset, WeightFunction weighting) internal view returns (Exp memory) {
        Market storage market = markets[address(asset)];
        return
            Exp({
                mantissa: weighting == WeightFunction.USE_COLLATERAL_FACTOR
                    ? market.collateralFactorMantissa
                    : market.liquidationThresholdMantissa
            });
    }

    /**
     * @dev Returns the liquidation incentive that applies when a market's collateral is seized
     * @param vTokenCollateral Market whose collateral would be seized
     * @return The market's own incentive, or the pool-wide one if the market has none. Never zero for a listed
     *   market, so callers may divide by it: see the note on `liquidationIncentives`. An unlisted market still reads
     *   back whatever incentive it was last given, which no seizure can reach, since every path that divides by this
     *   is gated on the market being listed.
     */
    function _liquidationIncentive(address vTokenCollateral) internal view returns (uint256) {
        uint256 incentive = liquidationIncentives[vTokenCollateral];
        return incentive != 0 ? incentive : _poolLiquidationIncentiveMantissa;
    }

    /**
     * @dev Returns supply and borrow balances of user in vToken, reverts on failure
     * @param vToken Market to query
     * @param user Account address
     * @return vTokenBalance Balance of vTokens, the same as vToken.balanceOf(user)
     * @return borrowBalance Borrowed amount, including the interest
     * @return exchangeRateMantissa Stored exchange rate
     */
    function _safeGetAccountSnapshot(
        VToken vToken,
        address user
    ) internal view returns (uint256 vTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa) {
        uint256 err;
        (err, vTokenBalance, borrowBalance, exchangeRateMantissa) = vToken.getAccountSnapshot(user);
        if (err != 0) {
            revert SnapshotError(address(vToken), user);
        }
        return (vTokenBalance, borrowBalance, exchangeRateMantissa);
    }

    /// @notice Reverts if the call is not from expectedSender
    /// @param expectedSender Expected transaction sender
    function _checkSenderIs(address expectedSender) internal view {
        if (msg.sender != expectedSender) {
            revert UnexpectedSender(expectedSender, msg.sender);
        }
    }

    /// @notice Reverts if a certain action is paused on a market
    /// @param market Market to check
    /// @param action Action to check
    function _checkActionPauseState(address market, Action action) private view {
        if (actionPaused(market, action)) {
            revert ActionPaused(market, action);
        }
    }

    /// @notice Reverts if the liquidation allowlist is enabled and the given account is not on it
    /// @param liquidator Account that would receive the seized collateral
    function _checkLiquidationAllowed(address liquidator) private view {
        if (isLiquidationAllowlistEnabled && !isAllowedLiquidator[liquidator]) {
            revert LiquidationNotAllowed(liquidator);
        }
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "./VToken.sol";
import "./ErrorReporter.sol";
import "./PriceOracle.sol";
import "./ComptrollerInterface.sol";
import "./ComptrollerStorage.sol";
import "./Unitroller.sol";
import "./Rewards/RewardsDistributor.sol";
import "./Governance/AccessControlManager.sol";


/**
 * @title Compound's Comptroller Contract
 * @author Compound
 */
contract Comptroller is
    ComptrollerV1Storage,
    ComptrollerInterface,
    ComptrollerErrorReporter,
    ExponentialNoError
{

    /// @notice Emitted when an account enters a market
    event MarketEntered(VToken vToken, address account);

    /// @notice Emitted when an account exits a market
    event MarketExited(VToken vToken, address account);

    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(
        uint256 oldCloseFactorMantissa,
        uint256 newCloseFactorMantissa
    );

    /// @notice Emitted when a collateral factor is changed by admin
    event NewCollateralFactor(
        VToken vToken,
        uint256 oldCollateralFactorMantissa,
        uint256 newCollateralFactorMantissa
    );

    /// @notice Emitted when liquidation threshold is changed by admin
    event NewLiquidationThreshold(
        VToken vToken,
        uint256 oldLiquidationThresholdMantissa,
        uint256 newLiquidationThresholdMantissa
    );

    /// @notice Emitted when liquidation incentive is changed by admin
    event NewLiquidationIncentive(
        uint256 oldLiquidationIncentiveMantissa,
        uint256 newLiquidationIncentiveMantissa
    );

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(
        PriceOracle oldPriceOracle,
        PriceOracle newPriceOracle
    );

    /// @notice Emitted when an action is paused globally
    event ActionPaused(string action, bool pauseState);

    /// @notice Emitted when an action is paused on a market
    event ActionPausedMarket(VToken vToken, Action action, bool pauseState);

    /// @notice Emitted when borrow cap for a vToken is changed
    event NewBorrowCap(VToken indexed vToken, uint256 newBorrowCap);

    /// @notice Emitted when borrow cap guardian is changed
    event NewBorrowCapGuardian(
        address oldBorrowCapGuardian,
        address newBorrowCapGuardian
    );

    /// @notice Emitted when the collateral threshold (in USD) for non-batch liquidations is changed
    event NewMinLiquidatableCollateral(
        uint256 oldMinLiquidatableCollateral,
        uint256 newMinLiquidatableCollateral
    );

    /// @notice Emitted when supply cap for a vToken is changed
    event NewSupplyCap(VToken indexed vToken, uint256 newSupplyCap);

    // closeFactorMantissa must be strictly greater than this value
    uint256 internal constant closeFactorMinMantissa = 0.05e18; // 0.05

    // closeFactorMantissa must not exceed this value
    uint256 internal constant closeFactorMaxMantissa = 0.9e18; // 0.9

    // No collateralFactorMantissa may exceed this value
    uint256 internal constant collateralFactorMaxMantissa = 0.9e18; // 0.9

    // PoolRegistry
    address immutable poolRegistry;

	// AccessControlManager
    address immutable accessControl;

    // List of Reward Distributors added
    RewardsDistributor[] private rewardsDistributors;

    // Used to check if rewards distributor is added
    mapping(address => bool) rewardsDistributorExists;

    constructor(address _poolRegistry, address _accessControl) {
        admin = msg.sender;
        poolRegistry = _poolRegistry;
		accessControl = _accessControl;
    }

    /// @notice Reverts if a certain action is paused on a market
    /// @param market Market to check
    /// @param action Action to check
    function checkActionPauseState(address market, Action action) private view {
        require(!actionPaused(market, action), "action is paused");
    }

    /*** Assets You Are In ***/

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account)
        external
        view
        returns (VToken[] memory)
    {
        VToken[] memory assetsIn = accountAssets[account];

        return assetsIn;
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false.
     */
    function checkMembership(address account, VToken vToken)
        external
        view
        returns (bool)
    {
        return markets[address(vToken)].accountMembership[account];
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] memory vTokens)
        public
        override
        returns (uint256[] memory)
    {
        uint256 len = vTokens.length;

        uint256[] memory results = new uint256[](len);
        for (uint256 i = 0; i < len; ++i) {
            VToken vToken = VToken(vTokens[i]);

            results[i] = uint256(addToMarketInternal(vToken, msg.sender));
        }

        return results;
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param vToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(VToken vToken, address borrower)
        internal
        returns (Error)
    {
        checkActionPauseState(address(vToken), Action.ENTER_MARKET);
        Market storage marketToJoin = markets[address(vToken)];

        if (!marketToJoin.isListed) {
            // market is not listed, cannot join
            return Error.MARKET_NOT_LISTED;
        }

        if (marketToJoin.accountMembership[borrower] == true) {
            // already joined
            return Error.NO_ERROR;
        }

        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(vToken);

        emit MarketEntered(vToken, borrower);

        return Error.NO_ERROR;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow.
     * @param vTokenAddress The address of the asset to be removed
     * @return Whether or not the account successfully exited the market
     */
    function exitMarket(address vTokenAddress)
        external
        override
        returns (uint256)
    {
        checkActionPauseState(vTokenAddress, Action.EXIT_MARKET);
        VToken vToken = VToken(vTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the vToken */
        (uint256 oErr, uint256 tokensHeld, uint256 amountOwed, ) = vToken
            .getAccountSnapshot(msg.sender);
        require(oErr == 0, "exitMarket: getAccountSnapshot failed"); // semi-opaque error code

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            return
                fail(
                    Error.NONZERO_BORROW_BALANCE,
                    FailureInfo.EXIT_MARKET_BALANCE_OWED
                );
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint256 allowed = redeemAllowedInternal(
            vTokenAddress,
            msg.sender,
            tokensHeld
        );
        if (allowed != 0) {
            return
                failOpaque(
                    Error.REJECTION,
                    FailureInfo.EXIT_MARKET_REJECTION,
                    allowed
                );
        }

        Market storage marketToExit = markets[address(vToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return uint256(Error.NO_ERROR);
        }

        /* Set vToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete vToken from the account’s list of assets */
        // load into memory for faster iteration
        VToken[] memory userAssetList = accountAssets[msg.sender];
        uint256 len = userAssetList.length;
        uint256 assetIndex = len;
        for (uint256 i = 0; i < len; ++i) {
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

        return uint256(Error.NO_ERROR);
    }

    /*** Policy Hooks ***/

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param vToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @return 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function mintAllowed(
        address vToken,
        address minter,
        uint256 mintAmount
    ) external override returns (uint256) {
        checkActionPauseState(vToken, Action.MINT);

        // Shh - currently unused
        minter;
        mintAmount;

        if (!markets[vToken].isListed) {
            return uint256(Error.MARKET_NOT_LISTED);
        }

        uint256 supplyCap = supplyCaps[vToken];
        require(supplyCap > 0, "market supply cap is 0");

        uint256 totalSupply = VToken(vToken).totalSupply();
        uint256 nextTotalSupply = add_(totalSupply, mintAmount);
        require(nextTotalSupply <= supplyCap, "market supply cap reached");

        // Keep the flywheel moving
        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            rewardsDistributors[i].updateRewardTokenSupplyIndex(vToken);
            rewardsDistributors[i].distributeSupplierRewardToken(
                vToken,
                minter
            );
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates mint and reverts on rejection. May emit logs.
     * @param vToken Asset being minted
     * @param minter The address minting the tokens
     * @param actualMintAmount The amount of the underlying asset being minted
     * @param mintTokens The number of tokens being minted
     */
    function mintVerify(
        address vToken,
        address minter,
        uint256 actualMintAmount,
        uint256 mintTokens
    ) external override {
        // Shh - currently unused
        vToken;
        minter;
        actualMintAmount;
        mintTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param vToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of vTokens to exchange for the underlying asset in the market
     * @return 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function redeemAllowed(
        address vToken,
        address redeemer,
        uint256 redeemTokens
    ) external override returns (uint256) {
        checkActionPauseState(vToken, Action.REDEEM);

        oracle.updatePrice(vToken);

        uint256 allowed = redeemAllowedInternal(vToken, redeemer, redeemTokens);
        if (allowed != uint256(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            rewardsDistributors[i].updateRewardTokenSupplyIndex(vToken);
            rewardsDistributors[i].distributeSupplierRewardToken(
                vToken,
                redeemer
            );
        }

        return uint256(Error.NO_ERROR);
    }

    function redeemAllowedInternal(
        address vToken,
        address redeemer,
        uint256 redeemTokens
    ) internal view returns (uint256) {
        if (!markets[vToken].isListed) {
            return uint256(Error.MARKET_NOT_LISTED);
        }

        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!markets[vToken].accountMembership[redeemer]) {
            return uint256(Error.NO_ERROR);
        }

        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        AccountLiquiditySnapshot memory snapshot =
            getHypotheticalLiquiditySnapshot(
                redeemer,
                VToken(vToken),
                redeemTokens,
                0,
                getCollateralFactor
            );
        if (snapshot.shortfall > 0) {
            return uint256(Error.INSUFFICIENT_LIQUIDITY);
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates redeem and reverts on rejection. May emit logs.
     * @param vToken Asset being redeemed
     * @param redeemer The address redeeming the tokens
     * @param redeemAmount The amount of the underlying asset being redeemed
     * @param redeemTokens The number of tokens being redeemed
     */
    function redeemVerify(
        address vToken,
        address redeemer,
        uint256 redeemAmount,
        uint256 redeemTokens
    ) external override {
        // Shh - currently unused
        vToken;
        redeemer;

        // Require tokens is zero or amount is also zero
        if (redeemTokens == 0 && redeemAmount > 0) {
            revert("redeemTokens zero");
        }
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param vToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @return 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function borrowAllowed(
        address vToken,
        address borrower,
        uint256 borrowAmount
    ) external override returns (uint256) {
        checkActionPauseState(vToken, Action.BORROW);

        oracle.updatePrice(vToken);

        if (!markets[vToken].isListed) {
            return uint256(Error.MARKET_NOT_LISTED);
        }

        if (!markets[vToken].accountMembership[borrower]) {
            // only vTokens may call borrowAllowed if borrower not in market
            require(msg.sender == vToken, "sender must be vToken");

            // attempt to add borrower to the market
            Error err = addToMarketInternal(VToken(msg.sender), borrower);
            if (err != Error.NO_ERROR) {
                return uint256(err);
            }

            // it should be impossible to break the important invariant
            assert(markets[vToken].accountMembership[borrower]);
        }

        if (oracle.getUnderlyingPrice(VToken(vToken)) == 0) {
            return uint256(Error.PRICE_ERROR);
        }

        uint256 borrowCap = borrowCaps[vToken];
        // Borrow cap of 0 corresponds to unlimited borrowing
        if (borrowCap != 0) {
            uint256 totalBorrows = VToken(vToken).totalBorrows();
            uint256 nextTotalBorrows = add_(totalBorrows, borrowAmount);
            require(nextTotalBorrows < borrowCap, "market borrow cap reached");
        }

        AccountLiquiditySnapshot memory snapshot =
            getHypotheticalLiquiditySnapshot(
                borrower,
                VToken(vToken),
                0,
                borrowAmount,
                getCollateralFactor
            );

        if (snapshot.shortfall > 0) {
            return uint256(Error.INSUFFICIENT_LIQUIDITY);
        }

        // Keep the flywheel moving
        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            Exp memory borrowIndex = Exp({
                mantissa: VToken(vToken).borrowIndex()
            });
            rewardsDistributors[i].updateRewardTokenBorrowIndex(
                vToken,
                borrowIndex
            );
            rewardsDistributors[i].distributeBorrowerRewardToken(
                vToken,
                borrower,
                borrowIndex
            );
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates borrow and reverts on rejection. May emit logs.
     * @param vToken Asset whose underlying is being borrowed
     * @param borrower The address borrowing the underlying
     * @param borrowAmount The amount of the underlying asset requested to borrow
     */
    function borrowVerify(
        address vToken,
        address borrower,
        uint256 borrowAmount
    ) external override {
        // Shh - currently unused
        vToken;
        borrower;
        borrowAmount;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to repay a borrow in the given market
     * @param vToken The market to verify the repay against
     * @param payer The account which would repay the asset
     * @param borrower The account which would borrowed the asset
     * @param repayAmount The amount of the underlying asset the account would repay
     * @return 0 if the repay is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function repayBorrowAllowed(
        address vToken,
        address payer,
        address borrower,
        uint256 repayAmount
    ) external override returns (uint256) {
        checkActionPauseState(vToken, Action.REPAY);
        
        oracle.updatePrice(vToken);

        // Shh - currently unused
        payer;
        borrower;
        repayAmount;

        if (!markets[vToken].isListed) {
            return uint256(Error.MARKET_NOT_LISTED);
        }

        // Keep the flywheel moving
        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            Exp memory borrowIndex = Exp({
                mantissa: VToken(vToken).borrowIndex()
            });
            rewardsDistributors[i].updateRewardTokenBorrowIndex(
                vToken,
                borrowIndex
            );
            rewardsDistributors[i].distributeBorrowerRewardToken(
                vToken,
                borrower,
                borrowIndex
            );
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates repayBorrow and reverts on rejection. May emit logs.
     * @param vToken Asset being repaid
     * @param payer The address repaying the borrow
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function repayBorrowVerify(
        address vToken,
        address payer,
        address borrower,
        uint256 actualRepayAmount,
        uint256 borrowerIndex
    ) external override {
        // Shh - currently unused
        vToken;
        payer;
        borrower;
        actualRepayAmount;
        borrowerIndex;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the liquidation should be allowed to occur
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param repayAmount The amount of underlying being repaid
     * @param skipLiquidityCheck Allows the borrow to be liquidated regardless of the account liquidity
     */
    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint256 repayAmount,
        bool skipLiquidityCheck
    ) external override returns (uint256) {
        // Pause Action.LIQUIDATE on BORROWED TOKEN to prevent liquidating it.
        // If we want to pause liquidating to vTokenCollateral, we should pause
        // Action.SEIZE on it
        checkActionPauseState(vTokenBorrowed, Action.LIQUIDATE);

        oracle.updatePrice(vTokenBorrowed);
        oracle.updatePrice(vTokenCollateral);

        // Shh - currently unused
        liquidator;

        if (
            !markets[vTokenBorrowed].isListed ||
            !markets[vTokenCollateral].isListed
        ) {
            return uint256(Error.MARKET_NOT_LISTED);
        }

        uint256 borrowBalance = VToken(vTokenBorrowed).borrowBalanceStored(
            borrower
        );

        /* Allow accounts to be liquidated if the market is deprecated or it is a forced liquidation */
        if (skipLiquidityCheck || isDeprecated(VToken(vTokenBorrowed))) {
            require(
                borrowBalance >= repayAmount,
                "Can not repay more than the total borrow"
            );
            return uint256(Error.NO_ERROR);
        }

        /* The borrower must have shortfall and collateral > threshold in order to be liquidatable */
        AccountLiquiditySnapshot memory snapshot = getCurrentLiquiditySnapshot(borrower, getLiquidationThreshold);

        if (snapshot.totalCollateral <= minLiquidatableCollateral) {
            /* The liquidator should use either liquidateAccount or healAccount */
            revert MinimalCollateralViolated(minLiquidatableCollateral, snapshot.totalCollateral);
        }

        if (snapshot.shortfall == 0) {
            return uint256(Error.INSUFFICIENT_SHORTFALL);
        }

        /* The liquidator may not repay more than what is allowed by the closeFactor */
        uint256 maxClose = mul_ScalarTruncate(
            Exp({mantissa: closeFactorMantissa}),
            borrowBalance
        );
        if (repayAmount > maxClose) {
            return uint256(Error.TOO_MUCH_REPAY);
        }
    }

    /**
     * @notice Validates liquidateBorrow and reverts on rejection. May emit logs.
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint256 actualRepayAmount,
        uint256 seizeTokens
    ) external override {
        // Shh - currently unused
        vTokenBorrowed;
        vTokenCollateral;
        liquidator;
        borrower;
        actualRepayAmount;
        seizeTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the seizing of assets should be allowed to occur
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param seizerContract Contract that tries to seize the asset (either borrowed vToken or Comptroller)
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeAllowed(
        address vTokenCollateral,
        address seizerContract,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external override returns (uint256) {
        // Pause Action.SEIZE on COLLATERAL to prevent seizing it.
        // If we want to pause liquidating vTokenBorrowed, we should pause
        // Action.LIQUIDATE on it
        checkActionPauseState(vTokenCollateral, Action.SEIZE);

        // Shh - currently unused
        seizeTokens;

        if (!markets[vTokenCollateral].isListed) {
            return uint256(Error.MARKET_NOT_LISTED);
        }

        if (seizerContract == address(this)) {
            // If Comptroller is the seizer, just check if collateral's comptroller
            // is equal to the current address
            if (address(VToken(vTokenCollateral).comptroller()) != address(this)) {
                return uint256(Error.COMPTROLLER_MISMATCH);
            }
        } else {
            // If the seizer is not the Comptroller, check that the seizer is a
            // listed market, and that the markets' comptrollers match
            if (!markets[seizerContract].isListed) {
                return uint256(Error.MARKET_NOT_LISTED);
            }
            if (
                VToken(vTokenCollateral).comptroller() !=
                VToken(seizerContract).comptroller()
            ) {
                return uint256(Error.COMPTROLLER_MISMATCH);
            }
        }

        // Keep the flywheel moving
        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            rewardsDistributors[i].updateRewardTokenSupplyIndex(
                vTokenCollateral
            );
            rewardsDistributors[i].distributeSupplierRewardToken(
                vTokenCollateral,
                borrower
            );
            rewardsDistributors[i].distributeSupplierRewardToken(
                vTokenCollateral,
                liquidator
            );
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates seize and reverts on rejection. May emit logs.
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external override {
        // Shh - currently unused
        vTokenCollateral;
        vTokenBorrowed;
        liquidator;
        borrower;
        seizeTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param vToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     * @return 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function transferAllowed(
        address vToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external override returns (uint256) {
        checkActionPauseState(vToken, Action.TRANSFER);

        oracle.updatePrice(vToken);

        // Currently the only consideration is whether or not
        //  the src is allowed to redeem this many tokens
        uint256 allowed = redeemAllowedInternal(vToken, src, transferTokens);
        if (allowed != uint256(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            rewardsDistributors[i].updateRewardTokenSupplyIndex(vToken);
            rewardsDistributors[i].distributeSupplierRewardToken(vToken, src);
            rewardsDistributors[i].distributeSupplierRewardToken(vToken, dst);
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates transfer and reverts on rejection. May emit logs.
     * @param vToken Asset being transferred
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     */
    function transferVerify(
        address vToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external override {
        // Shh - currently unused
        vToken;
        src;
        dst;
        transferTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }


    /*** Pool-level operations ***/

    /**
     * @notice Seizes all the remaining collateral, makes msg.sender repay the existing
     *   borrows, and treats the rest of the debt as bad debt (for each market).
     *   The sender has to repay a certain percentage of the debt, computed as
     *   collateral / (borrows * liquidationIncentive).
     * @dev Reverts in case of failure
     * @param user account to heal
     */
    function healAccount(address user) external {
        VToken[] memory userAssets = accountAssets[user];
        address liquidator = msg.sender;
        // We need all user's markets to be fresh for the computations to be correct
        for (uint256 i = 0; i < userAssets.length; ++i) {
            userAssets[i].accrueInterest();
            oracle.updatePrice(address(userAssets[i]));
        }

        AccountLiquiditySnapshot memory snapshot = getCurrentLiquiditySnapshot(user, getLiquidationThreshold);

        if (snapshot.totalCollateral > minLiquidatableCollateral) {
            revert CollateralExceedsThreshold(minLiquidatableCollateral, snapshot.totalCollateral);
        }
        // percentage = collateral / (borrows * liquidation incentive)
        Exp memory collateral = Exp({ mantissa: snapshot.totalCollateral });
        Exp memory scaledBorrows = mul_(
            Exp({ mantissa: snapshot.borrows }),
            Exp({ mantissa: liquidationIncentiveMantissa })
        );

        Exp memory percentage = div_(collateral, scaledBorrows);
        if (lessThanExp(Exp({ mantissa: mantissaOne }), percentage)) {
            revert CollateralExceedsThreshold(scaledBorrows.mantissa, collateral.mantissa);
        }
        for (uint256 i = 0; i < userAssets.length; ++i) {
            VToken market = userAssets[i];

            (uint256 oErr, uint256 tokens, uint256 borrowBalance, ) = market.getAccountSnapshot(user);
            if (oErr != 0) {
                revert SnapshotError();
            }

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
    }

    /**
     * @notice Liquidates all borrows of the borrower. Callable only if the collateral is less than
     *   a predefined threshold, and the account collateral can be seized to cover all borrows. If
     *   the collateral is higher than the threshold, use regular liquidations. If the collateral is
     *   below the threshold, and the account is insolvent, use healAccount.
     * @param borrower the borrower address
     * @param orders an array of liquidation orders
     */
    function liquidateAccount(address borrower, LiquidationOrder[] calldata orders) external {
        // We will accrue interest and update the oracle prices later during the liquidation

        AccountLiquiditySnapshot memory snapshot = getCurrentLiquiditySnapshot(borrower, getLiquidationThreshold);

        if (snapshot.totalCollateral > minLiquidatableCollateral) {
            // You should use the regular vToken.liquidateBorrow(...) call
            revert CollateralExceedsThreshold(minLiquidatableCollateral, snapshot.totalCollateral);
        }

        uint256 collateralToSeize = mul_ScalarTruncate(
            Exp({mantissa: liquidationIncentiveMantissa}),
            snapshot.borrows
        );
        if (collateralToSeize >= snapshot.totalCollateral) {
            // There is not enough collateral to seize. Use healBorrow to repay some part of the borrow
            // and record bad debt.
            revert InsufficientCollateral(collateralToSeize, snapshot.totalCollateral);
        }

        for (uint i = 0; i < orders.length; ++i) {
            LiquidationOrder calldata order = orders[i];
            order.vTokenCollateral.forceLiquidateBorrow(
                msg.sender, borrower, order.repayAmount, order.vTokenCollateral, true
            );
        }

        VToken[] memory markets = accountAssets[borrower];
        for (uint i = 0; i < markets.length; ++i) {
            // Read the balances and exchange rate from the vToken
            (uint oErr, , uint borrowBalance, ) = markets[i].getAccountSnapshot(borrower);
            if (oErr != 0) {
                revert SnapshotError();
            }
            require(borrowBalance == 0, "Nonzero borrow balance after liquidation");
        }
    }

    /*** Liquidity/Liquidation Calculations ***/

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @dev The interface of this function is intentionally kept compatible with Compound and Venus Core
     * @return (possible error code (semi-opaque),
                account liquidity in excess of collateral requirements,
     *          account shortfall below collateral requirements)
     */
    function getAccountLiquidity(address account)
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        AccountLiquiditySnapshot memory snapshot = getCurrentLiquiditySnapshot(account, getCollateralFactor);
        return (uint256(Error.NO_ERROR), snapshot.liquidity, snapshot.shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @dev The interface of this function is intentionally kept compatible with Compound and Venus Core
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return (possible error code (semi-opaque),
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidity(
        address account,
        address vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    )
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        AccountLiquiditySnapshot memory snapshot =
            getHypotheticalLiquiditySnapshot(
                account,
                VToken(vTokenModify),
                redeemTokens,
                borrowAmount,
                getCollateralFactor
            );
        return (uint256(Error.NO_ERROR), snapshot.liquidity, snapshot.shortfall);
    }

    /**
     * @notice Get the total collateral, weighted collateral, borrow balance, liquidity, shortfall
     * @param account The account to get the snapshot for
     * @param weight The function to compute the weight of the collateral – either collateral factor or
     *  liquidation threshold. Accepts the address of the VToken and returns the weight as Exp.
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return snapshot Account liquidity snapshot
     */
    function getCurrentLiquiditySnapshot(
        address account,
        function (VToken) internal view returns (Exp memory) weight
    )
        internal
        view
        returns (AccountLiquiditySnapshot memory snapshot)
    {
        return getHypotheticalLiquiditySnapshot(
            account, VToken(address(0)), 0, 0, weight
        );
    }

    /**
     * @notice Determine what the supply/borrow balances would be if the given amounts were redeemed/borrowed
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @param weight The function to compute the weight of the collateral – either collateral factor or
         liquidation threshold. Accepts the address of the VToken and returns the
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return snapshot Account liquidity snapshot
     */
    function getHypotheticalLiquiditySnapshot(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        function (VToken) internal view returns (Exp memory) weight
    )
        internal
        view
        returns (AccountLiquiditySnapshot memory snapshot)
    {
        // For each asset the account is in
        VToken[] memory assets = accountAssets[account];
        for (uint256 i = 0; i < assets.length; ++i) {
            VToken asset = assets[i];

            // Read the balances and exchange rate from the vToken
            (
                uint256 oErr,
                uint256 vTokenBalance,
                uint256 borrowBalance,
                uint256 exchangeRateMantissa
            ) = asset.getAccountSnapshot(account);
            if (oErr != 0) {
                revert SnapshotError();
            }

            // Get the normalized price of the asset
            Exp memory oraclePrice = Exp({mantissa: safeGetUnderlyingPrice(asset)});

            // Pre-compute conversion factors from vTokens -> usd
            Exp memory vTokenPrice = mul_(
                Exp({mantissa: exchangeRateMantissa}),
                oraclePrice
            );
            Exp memory weightedVTokenPrice = mul_(
                weight(asset),
                vTokenPrice
            );

            // weightedCollateral += weightedVTokenPrice * vTokenBalance
            snapshot.weightedCollateral = mul_ScalarTruncateAddUInt(
                weightedVTokenPrice,
                vTokenBalance,
                snapshot.weightedCollateral
            );

            // totalCollateral += vTokenPrice * vTokenBalance
            snapshot.totalCollateral = mul_ScalarTruncateAddUInt(
                vTokenPrice,
                vTokenBalance,
                snapshot.totalCollateral
            );

            // borrows += oraclePrice * borrowBalance
            snapshot.borrows = mul_ScalarTruncateAddUInt(
                oraclePrice,
                borrowBalance,
                snapshot.borrows
            );

            // Calculate effects of interacting with vTokenModify
            if (asset == vTokenModify) {
                // redeem effect
                // effects += tokensToDenom * redeemTokens
                snapshot.effects = mul_ScalarTruncateAddUInt(
                    weightedVTokenPrice,
                    redeemTokens,
                    snapshot.effects
                );

                // borrow effect
                // effects += oraclePrice * borrowAmount
                snapshot.effects = mul_ScalarTruncateAddUInt(
                    oraclePrice,
                    borrowAmount,
                    snapshot.effects
                );
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

    function safeGetUnderlyingPrice(VToken asset) internal view returns (uint256) {
        uint256 oraclePriceMantissa = oracle.getUnderlyingPrice(asset);
        if (oraclePriceMantissa == 0) {
            revert PriceError();
        }
        return oraclePriceMantissa;
    }

    function getCollateralFactor(VToken asset) internal view returns (Exp memory) {
        return Exp({
            mantissa: markets[address(asset)].collateralFactorMantissa
        });
    }

    function getLiquidationThreshold(VToken asset) internal view returns (Exp memory) {
        return Exp({
            mantissa: markets[address(asset)].liquidationThresholdMantissa
        });
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenBorrowed The address of the borrowed vToken
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return (errorCode, number of vTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view override returns (uint256, uint256) {
        /* Read oracle prices for borrowed and collateral markets */
        uint256 priceBorrowedMantissa = oracle.getUnderlyingPrice(
            VToken(vTokenBorrowed)
        );
        uint256 priceCollateralMantissa = oracle.getUnderlyingPrice(
            VToken(vTokenCollateral)
        );
        if (priceBorrowedMantissa == 0 || priceCollateralMantissa == 0) {
            return (uint256(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint256 exchangeRateMantissa = VToken(vTokenCollateral)
            .exchangeRateStored(); // Note: reverts on error
        uint256 seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;

        numerator = mul_(
            Exp({mantissa: liquidationIncentiveMantissa}),
            Exp({mantissa: priceBorrowedMantissa})
        );
        denominator = mul_(
            Exp({mantissa: priceCollateralMantissa}),
            Exp({mantissa: exchangeRateMantissa})
        );
        ratio = div_(numerator, denominator);

        seizeTokens = mul_ScalarTruncate(ratio, actualRepayAmount);

        return (uint256(Error.NO_ERROR), seizeTokens);
    }

    /*** Admin Functions ***/

    /**
     * @notice Sets a new price oracle for the comptroller
     * @dev Admin function to set a new price oracle
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPriceOracle(PriceOracle newOracle) public returns (uint256) {
        // Check caller is admin
        if (msg.sender != admin) {
            return
                fail(
                    Error.UNAUTHORIZED,
                    FailureInfo.SET_PRICE_ORACLE_OWNER_CHECK
                );
        }

        // Track the old oracle for the comptroller
        PriceOracle oldOracle = oracle;

        // Set comptroller's oracle to newOracle
        oracle = newOracle;

        // Emit NewPriceOracle(oldOracle, newOracle)
        emit NewPriceOracle(oldOracle, newOracle);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Sets the closeFactor used when liquidating borrows
     * @dev Admin function to set closeFactor
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @return uint 0=success, otherwise a failure
     */
    function _setCloseFactor(uint256 newCloseFactorMantissa)
        external
        returns (uint256)
    {
        // Check caller is admin
        require(msg.sender == admin, "only admin can set close factor");

        uint256 oldCloseFactorMantissa = closeFactorMantissa;
        closeFactorMantissa = newCloseFactorMantissa;
        emit NewCloseFactor(oldCloseFactorMantissa, closeFactorMantissa);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Sets the collateralFactor for a market
     * @dev Restricted function to set per-market collateralFactor
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @param newLiquidationThresholdMantissa The new liquidation threshold, scaled by 1e18
     * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function _setCollateralFactor(
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external returns (uint256) {
        bool isAllowedToCall = AccessControlManager(accessControl)
            .isAllowedToCall(
                msg.sender,
                "_setCollateralFactor(VToken,uint256,uint256)"
            );

        if (!isAllowedToCall) {
            revert Unauthorized();
        }

        // Verify market is listed
        Market storage market = markets[address(vToken)];
        if (!market.isListed) {
            revert MarketNotListed(address(vToken));
        }

        // Check collateral factor <= 0.9
        if (newCollateralFactorMantissa > collateralFactorMaxMantissa) {
            revert InvalidCollateralFactor();
        }

        // Ensure that liquidation threshold <= CF
        if (newLiquidationThresholdMantissa > newCollateralFactorMantissa) {
            revert InvalidLiquidationThreshold();
        }

        // If collateral factor != 0, fail if price == 0
        if (
            newCollateralFactorMantissa != 0 &&
            oracle.getUnderlyingPrice(vToken) == 0
        ) {
            revert PriceError();
        }

        uint256 oldCollateralFactorMantissa = market.collateralFactorMantissa;
        if (newCollateralFactorMantissa != oldCollateralFactorMantissa) {
            market.collateralFactorMantissa = newCollateralFactorMantissa;
            emit NewCollateralFactor(
                vToken,
                oldCollateralFactorMantissa,
                newCollateralFactorMantissa
            );
        }

        uint256 oldLiquidationThresholdMantissa = market.liquidationThresholdMantissa;
        if (newLiquidationThresholdMantissa != oldLiquidationThresholdMantissa) {
            market.liquidationThresholdMantissa = newLiquidationThresholdMantissa;
            emit NewLiquidationThreshold(
                vToken,
                oldLiquidationThresholdMantissa,
                newLiquidationThresholdMantissa
            );
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Sets liquidationIncentive
     * @dev Admin function to set liquidationIncentive
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function _setLiquidationIncentive(uint256 newLiquidationIncentiveMantissa)
        external
        returns (uint256)
    {
        bool canCallFunction = AccessControlManager(accessControl)
            .isAllowedToCall(msg.sender, "_setLiquidationIncentive(uint)");
        // Check if caller is allowed to call this function
        if (!canCallFunction) {
            return
                fail(
                    Error.UNAUTHORIZED,
                    FailureInfo.SET_LIQUIDATION_INCENTIVE_OWNER_CHECK
                );
        }

        // Save current value for use in log
        uint256 oldLiquidationIncentiveMantissa = liquidationIncentiveMantissa;

        // Set liquidation incentive to new incentive
        liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(
            oldLiquidationIncentiveMantissa,
            newLiquidationIncentiveMantissa
        );

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Admin function to set isListed and add support for the market
     * @param vToken The address of the market (token) to list
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _supportMarket(VToken vToken) external returns (uint256) {
        bool canCallFunction = AccessControlManager(accessControl)
            .isAllowedToCall(msg.sender, "_supportMarket(VToken)");

        if (!canCallFunction) {
            return
                fail(
                    Error.UNAUTHORIZED,
                    FailureInfo.SUPPORT_MARKET_OWNER_CHECK
                );
        }

        if (markets[address(vToken)].isListed) {
            return
                fail(
                    Error.MARKET_ALREADY_LISTED,
                    FailureInfo.SUPPORT_MARKET_EXISTS
                );
        }

        vToken.isVToken(); // Sanity check to make sure its really a VToken

        Market storage newMarket = markets[address(vToken)];
        newMarket.isListed = true;
        newMarket.collateralFactorMantissa = 0;
        newMarket.liquidationThresholdMantissa = 0;

        _addMarketInternal(address(vToken));

        for (uint256 i = 0; i < rewardsDistributors.length; ++i) {
            rewardsDistributors[i].initializeMarket(address(vToken));
        }

        return uint256(Error.NO_ERROR);
    }

    function _addMarketInternal(address vToken) internal {
        for (uint256 i = 0; i < allMarkets.length; ++i) {
            require(allMarkets[i] != VToken(vToken), "market already added");
        }
        allMarkets.push(VToken(vToken));
    }

    /**
     * @notice Set the given borrow caps for the given vToken markets. Borrowing that brings total borrows to or above borrow cap will revert.
     * @dev Admin or borrowCapGuardian function to set the borrow caps. A borrow cap of 0 corresponds to unlimited borrowing.
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to unlimited borrowing.
     */
    function _setMarketBorrowCaps(
        VToken[] calldata vTokens,
        uint256[] calldata newBorrowCaps
    ) external {
        // NOTE: previous code restricted this function with
        // msg.sender == admin || msg.sender == borrowCapGuardian
        // Please consider adjusting deployment script before Testnet
        require(
            AccessControlManager(accessControl).isAllowedToCall(
                msg.sender,
                "_setMarketBorrowCaps(VToken[],uint256[])"
            ), "only whitelisted accounts can set borrow caps"
        );

        uint256 numMarkets = vTokens.length;
        uint256 numBorrowCaps = newBorrowCaps.length;

        require(
            numMarkets != 0 && numMarkets == numBorrowCaps,
            "invalid input"
        );

        for (uint256 i = 0; i < numMarkets; ++i) {
            borrowCaps[address(vTokens[i])] = newBorrowCaps[i];
            emit NewBorrowCap(vTokens[i], newBorrowCaps[i]);
        }
    }

    /**
     * @notice Set the given supply caps for the given vToken markets. Supply that brings total Supply to or above supply cap will revert.
     * @dev Admin function to set the supply caps. A supply cap of 0 corresponds to Minting NotAllowed.
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed.
     */
    function _setMarketSupplyCaps(
        VToken[] calldata vTokens,
        uint256[] calldata newSupplyCaps
    ) external {
        require(
            AccessControlManager(accessControl).isAllowedToCall(
                msg.sender,
                "_setMarketSupplyCaps(VToken[],uint256[])"
            ), "only whitelisted accounts can set supply caps"
        );
        require(vTokens.length != 0, "invalid number of markets");
        require(
            vTokens.length == newSupplyCaps.length,
            "invalid number of markets"
        );

        for (uint256 i = 0; i < vTokens.length; ++i) {
            supplyCaps[address(vTokens[i])] = newSupplyCaps[i];
            emit NewSupplyCap(vTokens[i], newSupplyCaps[i]);
        }
    }

    /**
     * @notice Pause/unpause certain actions
     * @param marketsList Markets to pause/unpause the actions on
     * @param actionsList List of action ids to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function _setActionsPaused(
        VToken[] calldata marketsList,
        Action[] calldata actionsList,
        bool paused
    )
        external
    {
        bool canCallFunction = AccessControlManager(accessControl)
            .isAllowedToCall(msg.sender, "_setActionsPaused(VToken[],Action[],bool)");
        require(canCallFunction, "only authorised addresses can pause");

        for (uint marketIdx = 0; marketIdx < marketsList.length; ++marketIdx) {
            for (uint actionIdx = 0; actionIdx < actionsList.length; ++actionIdx) {
                setActionPausedInternal(address(marketsList[marketIdx]), actionsList[actionIdx], paused);
            }
        }
    }

    /**
     * @dev Pause/unpause an action on a market
     * @param market Market to pause/unpause the action on
     * @param action Action id to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function setActionPausedInternal(address market, Action action, bool paused) internal {
        require(
            markets[market].isListed,
            "cannot pause a market that is not listed"
        );
        _actionPaused[market][action] = paused;
        emit ActionPausedMarket(VToken(market), action, paused);
    }

    function _become(Unitroller unitroller) public {
        require(
            msg.sender == unitroller.admin(),
            "only unitroller admin can change brains"
        );
        require(
            unitroller._acceptImplementation() == 0,
            "change not authorized"
        );
    }

    /**
     * @notice Checks caller is admin, or this contract is becoming the new implementation
     */
    function adminOrInitializing() internal view returns (bool) {
        return msg.sender == admin || msg.sender == comptrollerImplementation;
    }

    /**
     * @notice Set the given collateral threshold for non-batch liquidations. Regular liquidations
     *   will fail if the collateral amount is less than this threshold. Liquidators should use batch
     *   operations like liquidateAccount or healAccount.
     * @dev this funciton access is managed by AccessControlManager
     * @param newMinLiquidatableCollateral The new min liquidatable collateral (in USD).
     */
    function _setMinLiquidatableCollateral(
        uint256 newMinLiquidatableCollateral
    ) external {
        bool canCallFunction = AccessControlManager(accessControl)
            .isAllowedToCall(
                msg.sender,
                "_setMinLiquidatableCollateral(uint256)"
            );

        if (!canCallFunction) {
            revert Unauthorized();
        }

        uint256 oldMinLiquidatableCollateral = minLiquidatableCollateral;
        minLiquidatableCollateral = newMinLiquidatableCollateral;
        emit NewMinLiquidatableCollateral(
            oldMinLiquidatableCollateral,
            newMinLiquidatableCollateral
        );
    }

    function addRewardsDistributor(RewardsDistributor _rewardsDistributor)
        external
        returns (uint256)
    {
        if (msg.sender != admin) {
            return
                fail(
                    Error.UNAUTHORIZED,
                    FailureInfo.ADD_REWARDS_DISTRIBUTOR_OWNER_CHECK
                );
        }

        require(
            rewardsDistributorExists[address(_rewardsDistributor)] == false,
            "already exists"
        );

        rewardsDistributors.push(_rewardsDistributor);
        rewardsDistributorExists[address(_rewardsDistributor)] = true;

        for (uint256 i = 0; i < allMarkets.length; ++i) {
            _rewardsDistributor.initializeMarket(address(allMarkets[i]));
        }
    }

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market.
     * @return The list of market addresses
     */
    function getAllMarkets() override public view returns (VToken[] memory) {
        return allMarkets;
    }

    function isMarketListed(VToken vToken) public view returns (bool) {
        return markets[address(vToken)].isListed;
    }

    /**
     * @notice Checks if a certain action is paused on a market
     * @param market vToken address
     * @param action Action to check
     * @return true if the action is paused
     */
    function actionPaused(address market, Action action) public view returns (bool) {
        return _actionPaused[market][action];
    }

    /**
     * @notice Returns true if the given vToken market has been deprecated
     * @dev All borrows in a deprecated vToken market can be immediately liquidated
     * @param vToken The market to check if deprecated
     */
    function isDeprecated(VToken vToken) public view returns (bool) {
        return
            markets[address(vToken)].collateralFactorMantissa == 0 &&
            actionPaused(address(vToken), Action.BORROW) &&
            vToken.reserveFactorMantissa() == 1e18;
    }

    function getBlockNumber() public view virtual returns (uint256) {
        return block.number;
    }
}

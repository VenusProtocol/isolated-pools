// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ensureNonzeroAddress, ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { VAIControllerErrorReporter } from "../../ErrorReporter.sol";
import { ExponentialNoError } from "../../ExponentialNoError.sol";
import { ComptrollerInterface } from "../../ComptrollerInterface.sol";
import { VToken, EIP20Interface } from "../../VToken.sol";
import { IVAI } from "./IVAI.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";

/**
 * @title VAI Comptroller
 * @author Venus
 * @notice This is the implementation contract for the VAIUnitroller proxy
 */
contract VAIController is Ownable2StepUpgradeable, AccessControlledV8, ReentrancyGuardUpgradeable, VAIControllerStorage, VAIControllerErrorReporter, ExponentialNoError {
    /// @notice Initial index used in interest computations
    uint256 public constant INITIAL_VAI_MINT_INDEX = 1e18;

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    /// @notice Emitted when mint for prime holder is changed
    event MintOnlyForPrimeHolder(bool previousMintEnabledOnlyForPrimeHolder, bool newMintEnabledOnlyForPrimeHolder);

    /// @notice Emitted when Prime is changed
    event NewPrime(address oldPrime, address newPrime);

    /// @notice Event emitted when VAI is minted
    event MintVAI(address minter, uint256 mintVAIAmount);

    /// @notice Event emitted when VAI is repaid
    event RepayVAI(address payer, address borrower, uint256 repayVAIAmount);

    /// @notice Event emitted when a borrow is liquidated
    event LiquidateVAI(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        address vTokenCollateral,
        uint256 seizeTokens
    );

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint256 oldTreasuryPercent, uint256 newTreasuryPercent);

    /// @notice Event emitted when VAIs are minted and fee are transferred
    event MintFee(address minter, uint256 feeAmount);

    /// @notice Emiitted when VAI base rate is changed
    event NewVAIBaseRate(uint256 oldBaseRateMantissa, uint256 newBaseRateMantissa);

    /// @notice Emiitted when VAI float rate is changed
    event NewVAIFloatRate(uint256 oldFloatRateMantissa, uint256 newFlatRateMantissa);

    /// @notice Emiitted when VAI receiver address is changed
    event NewVAIReceiver(address oldReceiver, address newReceiver);

    /// @notice Emiitted when VAI mint cap is changed
    event NewVAIMintCap(uint256 oldMintCap, uint256 newMintCap);

    /// @notice Emitted when VAI token address is changed by admin
    event NewVaiToken(address oldVaiToken, address newVaiToken);

    /*** Main Actions ***/
    struct MintLocalVars {
        uint256 oErr;
        uint256 mintAmount;
        uint256 accountMintVAINew;
        uint256 accountMintableVAI;
    }

    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
        
        vaiMintIndex = INITIAL_VAI_MINT_INDEX;
        accrualBlockNumber = getBlockNumber();
        mintCap = uint256(-1);
    }

    /**
     * @notice The mintVAI function mints and transfers VAI from the protocol to the user, and adds a borrow balance.
     * The amount minted must be less than the user's Account Liquidity and the mint vai limit.
     * @param mintVAIAmount The amount of the VAI to be minted.
     * @return 0 on success, otherwise an error code
     */
    // solhint-disable-next-line code-complexity
    function mintVAI(uint256 mintVAIAmount) external nonReentrant returns (uint256) {
        ensureNonzeroAddress(comptroller);
            ensusreNonZeroValue(mintVAIAmount);
            if(comptroller.actionPaused(address(this), ComptrollerInterface.Action.MINT)){
                revert ActionPaused();
            }

            accrueVAIInterest();

            MintLocalVars memory vars;

            address minter = msg.sender;
            address _vai = vai;
            uint256 vaiTotalSupply = EIP20Interface(_vai).totalSupply();
            uint256 vaiNewTotalSupply = vaiTotalSupply + mintVAIAmount;

            if(vaiNewTotalSupply <= mintCap){
                revert MintCapReached();
            }

            (vars.oErr, vars.accountMintableVAI) = getMintableVAI(minter);
            if (vars.oErr != uint(Error.NO_ERROR)) {
                return uint(Error.REJECTION);
            }

            // check that user have sufficient mintableVAI balance
            if (mintVAIAmount > vars.accountMintableVAI) {
                return fail(Error.REJECTION, FailureInfo.VAI_MINT_REJECTION);
            }

            // Calculate the minted balance based on interest index
            uint256 totalMintedVAI = comptroller.mintedVAIs(minter);

            if (totalMintedVAI > 0) {
                uint256 repayAmount = getVAIRepayAmount(minter);
                uint256 remainedAmount = repayAmount - totalMintedVAI;

                pastVAIInterest[minter] += remainedAmount;
                totalMintedVAI = repayAmount;
            }

            vars.accountMintVAINew = totalMintedVAI + mintVAIAmount;

            setMintedVAIOf(minter, vars.accountMintVAINew);

            uint256 feeAmount;
            uint256 remainedAmount;
            vars.mintAmount = mintVAIAmount;
            if (treasuryPercent != 0) {
                feeAmount = mul_(vars.mintAmount, treasuryPercent) / 1e18;
                remainedAmount = vars.mintAmount - feeAmount;

                IVAI(_vai).mint(treasuryAddress, feeAmount);
                emit MintFee(minter, feeAmount);
            } else {
                remainedAmount = vars.mintAmount;
            }

            IVAI(_vai).mint(minter, remainedAmount);
            vaiMinterInterestIndex[minter] = vaiMintIndex;

            emit MintVAI(minter, remainedAmount);
    }

    /**
     * @notice The repay function transfers VAI into the protocol and burn, reducing the user's borrow balance.
     * Before repaying an asset, users must first approve the VAI to access their VAI balance.
     * @param repayVAIAmount The amount of the VAI to be repaid.
     * @return 0 on success, otherwise an error code
     */
    function repayVAI(uint256 repayVAIAmount) external nonReentrant returns (uint, uint) {
        ensureNonzeroAddress(comptroller);
        ensureNonzeroValue(repayVAIAmount);

        accrueVAIInterest();


        if(comptroller.ActionPaused(address(this), ComptrollerInterface.Action.REPAY)){
            revert ActionPaused();
        }

        return repayVAIFresh(msg.sender, msg.sender, repayVAIAmount);
    }

    /**
     * @notice Repay VAI Internal
     * @notice Borrowed VAIs are repaid by another user (possibly the borrower).
     * @param payer the account paying off the VAI
     * @param borrower the account with the debt being payed off
     * @param repayAmount the amount of VAI being returned
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment amount.
     */
    function repayVAIFresh(address payer, address borrower, uint256 repayAmount) internal returns (uint, uint) {
        MathError mErr;

        (uint256 burn, uint256 partOfCurrentInterest, uint256 partOfPastInterest) = getVAICalculateRepayAmount(
            borrower,
            repayAmount,
            comptroller
        );

        VAI _vai = VAI(vai);
        _vai.burn(payer, burn);
        bool success = _vai.transferFrom(payer, receiver, partOfCurrentInterest);
        require(success == true, "failed to transfer VAI fee");

        uint256 vaiBalanceBorrower = comptroller.mintedVAIs(borrower);
        uint256 accountVAINew = vaiBalanceBorrower - burn - partOfPastInterest;

        pastVAIInterest[borrower] -= partOfPastInterest;


        uint256 error = comptroller.setMintedVAIOf(borrower, accountVAINew);
        if (error != 0) {
            return (error, 0);
        }
        emit RepayVAI(payer, borrower, burn);

        return (uint(Error.NO_ERROR), burn);
    }

    /**
     * @notice The sender liquidates the vai minters collateral. The collateral seized is transferred to the liquidator.
     * @param borrower The borrower of vai to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment amount.
     */
    function liquidateVAI(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
    ) external nonReentrant returns (uint, uint) {
        if(comptroller.ActionPaused()){
            revert ActionPaused();
        }

        uint256 error = vTokenCollateral.accrueInterest();
        if (error != uint(Error.NO_ERROR)) {
            // accrueInterest emits logs on errors, but we still want to log the fact that an attempted liquidation failed
            return (fail(Error(error), FailureInfo.VAI_LIQUIDATE_ACCRUE_COLLATERAL_INTEREST_FAILED), 0);
        }

        // liquidateVAIFresh emits borrow-specific logs on errors, so we don't need to
        return liquidateVAIFresh(msg.sender, borrower, repayAmount, vTokenCollateral, comptroller);
    }

    /**
     * @notice The liquidator liquidates the borrowers collateral by repay borrowers VAI.
     *  The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the VAI and seizing collateral
     * @param borrower The borrower of this VAI to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the VAI to repay
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment VAI.
     */
    function liquidateVAIFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
    ) internal returns (uint, uint) {
        if (address(comptroller) != address(0)) {
            accrueVAIInterest();

            /* Fail if liquidate not allowed */
            uint256 allowed = comptroller.liquidateBorrowAllowed(
                address(this),
                address(vTokenCollateral),
                liquidator,
                borrower,
                repayAmount
            );
            if (allowed != 0) {
                return (failOpaque(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_COMPTROLLER_REJECTION, allowed), 0);
            }

            /* Verify vTokenCollateral market's block number equals current block number */
            //if (vTokenCollateral.accrualBlockNumber() != accrualBlockNumber) {
            if (vTokenCollateral.accrualBlockNumber() != getBlockNumber()) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK), 0);
            }

            /* Fail if borrower = liquidator */
            if (borrower == liquidator) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_LIQUIDATOR_IS_BORROWER), 0);
            }

            /* Fail if repayAmount = 0 */
            if (repayAmount == 0) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO), 0);
            }

            /* Fail if repayAmount = -1 */
            if (repayAmount == uint(-1)) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_CLOSE_AMOUNT_IS_UINT_MAX), 0);
            }

            /* Fail if repayVAI fails */
            (uint256 repayBorrowError, uint256 actualRepayAmount) = repayVAIFresh(liquidator, borrower, repayAmount);
            if (repayBorrowError != uint(Error.NO_ERROR)) {
                return (fail(Error(repayBorrowError), FailureInfo.VAI_LIQUIDATE_REPAY_BORROW_FRESH_FAILED), 0);
            }

            /////////////////////////
            // EFFECTS & INTERACTIONS
            // (No safe failures beyond this point)

            /* We calculate the number of collateral tokens that will be seized */
            (uint256 amountSeizeError, uint256 seizeTokens) = comptroller.liquidateVAICalculateSeizeTokens(
                address(vTokenCollateral),
                actualRepayAmount
            );
            require(
                amountSeizeError == uint(Error.NO_ERROR),
                "VAI_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED"
            );

            /* Revert if borrower collateral token balance < seizeTokens */
            require(vTokenCollateral.balanceOf(borrower) >= seizeTokens, "VAI_LIQUIDATE_SEIZE_TOO_MUCH");

            uint256 seizeError;
            seizeError = vTokenCollateral.seize(liquidator, borrower, seizeTokens);

            /* Revert if seize tokens fails (since we cannot be sure of side effects) */
            require(seizeError == uint(Error.NO_ERROR), "token seizure failed");

            /* We emit a LiquidateBorrow event */
            emit LiquidateVAI(liquidator, borrower, actualRepayAmount, address(vTokenCollateral), seizeTokens);

            /* We call the defense hook */
            comptroller.liquidateBorrowVerify(
                address(this),
                address(vTokenCollateral),
                liquidator,
                borrower,
                actualRepayAmount,
                seizeTokens
            );

            return (uint(Error.NO_ERROR), actualRepayAmount);
        }
    }

    /*** Admin Functions ***/

    /**
     * @notice Sets a new comptroller
     * @dev Admin function to set a new comptroller
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setComptroller(ComptrollerInterface comptroller_) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        ComptrollerInterface oldComptroller = comptroller;
        comptroller = comptroller_;
        emit NewComptroller(oldComptroller, comptroller_);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Set the prime token contract address
     * @param prime_ The new address of the prime token contract
     */
    function setPrimeToken(address prime_) external onlyOwner {
        emit NewPrime(prime, prime_);
        prime = prime_;
    }

    /**
     * @notice Set the VAI token contract address
     * @param vai_ The new address of the VAI token contract
     */
    function setVAIToken(address vai_) external onlyOwner {
        emit NewVaiToken(vai, vai_);
        vai = vai_;
    }

    /**
     * @notice Toggle mint only for prime holder
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function toggleOnlyPrimeHolderMint() external returns (uint) {
        _ensureAllowed("toggleOnlyPrimeHolderMint()");

        if (!mintEnabledOnlyForPrimeHolder && prime == address(0)) {
            return uint(Error.REJECTION);
        }

        emit MintOnlyForPrimeHolder(mintEnabledOnlyForPrimeHolder, !mintEnabledOnlyForPrimeHolder);
        mintEnabledOnlyForPrimeHolder = !mintEnabledOnlyForPrimeHolder;

        return uint(Error.NO_ERROR);
    }

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account total supply balance.
     *  Note that `vTokenBalance` is the number of vTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountAmountLocalVars {
        uint256 oErr;
        MathError mErr;
        uint256 sumSupply;
        uint256 marketSupply;
        uint256 sumBorrowPlusEffects;
        uint256 vTokenBalance;
        uint256 borrowBalance;
        uint256 exchangeRateMantissa;
        uint256 oraclePriceMantissa;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    // solhint-disable-next-line code-complexity
    function getMintableVAI(address minter) public view returns (uint, uint) {
        if (mintEnabledOnlyForPrimeHolder && !IPrime(prime).isUserPrimeHolder(minter)) {
            return (uint(Error.REJECTION), 0);
        }

        ResilientOracleInterface oracle_ = oracle;
        // PriceOracle oracle = comptroller.oracle();
        VToken[] memory enteredMarkets = comptroller.getAssetsIn(minter);

        AccountAmountLocalVars memory vars; // Holds all our calculation results

        uint256 accountMintableVAI;
        uint256 i;

        /**
         * We use this formula to calculate mintable VAI amount.
         * totalSupplyAmount * VAIMintRate - (totalBorrowAmount + mintedVAIOf)
         */
        for (i = 0; i < enteredMarkets.length; i++) {
            (vars.oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = enteredMarkets[i]
                .getAccountSnapshot(minter);
            if (vars.oErr != 0) {
                // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (uint(Error.SNAPSHOT_ERROR), 0);
            }
            vars.exchangeRate = Exp({ mantissa: vars.exchangeRateMantissa });

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(enteredMarkets[i]);
            if (vars.oraclePriceMantissa == 0) {
                return (uint(Error.PRICE_ERROR), 0);
            }
            vars.oraclePrice = Exp({ mantissa: vars.oraclePriceMantissa });

            (vars.mErr, vars.tokensToDenom) = mulExp(vars.exchangeRate, vars.oraclePrice);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            // marketSupply = tokensToDenom * vTokenBalance
            (vars.mErr, vars.marketSupply) = mulScalarTruncate(vars.tokensToDenom, vars.vTokenBalance);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            (, uint256 collateralFactorMantissa) = comptroller.markets(address(enteredMarkets[i]));
            // (vars.mErr, vars.marketSupply) = mulUInt(vars.marketSupply, collateralFactorMantissa);
            (vars.mErr, vars.marketSupply) = mul_(vars.marketSupply, collateralFactorMantissa);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            (vars.mErr, vars.marketSupply) = divUInt(vars.marketSupply, 1e18);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            (vars.mErr, vars.sumSupply) = addUInt(vars.sumSupply, vars.marketSupply);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            (vars.mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(
                vars.oraclePrice,
                vars.borrowBalance,
                vars.sumBorrowPlusEffects
            );
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }
        }

        uint256 totalMintedVAI = comptroller.mintedVAIs(minter);
        uint256 repayAmount = 0;

        if (totalMintedVAI > 0) {
            repayAmount = getVAIRepayAmount(minter);
        }

        (vars.mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, repayAmount);
        if (vars.mErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (vars.mErr, accountMintableVAI) = mulUInt(vars.sumSupply, comptroller.vaiMintRate());
        require(vars.mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (vars.mErr, accountMintableVAI) = divUInt(accountMintableVAI, 10000);
        require(vars.mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (vars.mErr, accountMintableVAI) = subUInt(accountMintableVAI, vars.sumBorrowPlusEffects);
        if (vars.mErr != MathError.NO_ERROR) {
            return (uint(Error.REJECTION), 0);
        }

        return (uint(Error.NO_ERROR), accountMintableVAI);
    }

    function setTreasuryData(
        address newTreasuryAddress,
        uint256 newTreasuryPercent
    ) external {
        // Check caller is admin
        _checkAccessAllowed("setTreasuryData(address,uint256)");

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");

        address oldTreasuryAddress = treasuryAddress;
        uint256 oldTreasuryPercent = treasuryPercent;

        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;

        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);
    }

    function getVAIRepayRate() public view returns (uint) {
        ResilientOracleInterface oracle_ = oracle;
        MathError mErr;

        if (baseRateMantissa > 0) {
            if (floatRateMantissa > 0) {
                uint256 oraclePrice = oracle_.getUnderlyingPrice(VToken(getVAIAddress()));
                if (1e18 > oraclePrice) {
                    uint256 delta;
                    uint256 rate;

                    (mErr, delta) = subUInt(1e18, oraclePrice);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    (mErr, delta) = mulUInt(delta, floatRateMantissa);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    (mErr, delta) = divUInt(delta, 1e18);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    (mErr, rate) = addUInt(delta, baseRateMantissa);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    return rate;
                } else {
                    return baseRateMantissa;
                }
            } else {
                return baseRateMantissa;
            }
        } else {
            return 0;
        }
    }

    function getVAIRepayRatePerBlock() public view returns (uint) {
        uint256 yearlyRate = getVAIRepayRate();

        MathError mErr;
        uint256 rate;

        (mErr, rate) = divUInt(yearlyRate, getBlocksPerYear());
        require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

        return rate;
    }

    function getVAIMinterInterestIndex(address minter) public view returns (uint) {
        uint256 storedIndex = vaiMinterInterestIndex[minter];
        // If the user minted VAI before the stability fee was introduced, accrue
        // starting from stability fee launch
        if (storedIndex == 0) {
            return INITIAL_VAI_MINT_INDEX;
        }
        return storedIndex;
    }

    /**
     * @notice Get the current total VAI a user needs to repay
     * @param account The address of the VAI borrower
     * @return (uint) The total amount of VAI the user needs to repay
     */
    function getVAIRepayAmount(address account) public view returns (uint) {
        MathError mErr;
        uint256 delta;

        uint256 amount = comptroller.mintedVAIs(account);
        uint256 interest = pastVAIInterest[account];
        uint256 totalMintedVAI;
        uint256 newInterest;

        (mErr, totalMintedVAI) = subUInt(amount, interest);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, delta) = subUInt(vaiMintIndex, getVAIMinterInterestIndex(account));
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, newInterest) = mulUInt(delta, totalMintedVAI);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, newInterest) = divUInt(newInterest, 1e18);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, amount) = addUInt(amount, newInterest);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        return amount;
    }

    /**
     * @notice Calculate how much VAI the user needs to repay
     * @param borrower The address of the VAI borrower
     * @param repayAmount The amount of VAI being returned
     * @return (uint, uint, uint) Amount of VAI to be burned, amount of VAI the user needs to pay in current interest and amount of VAI the user needs to pay in past interest
     */
    function getVAICalculateRepayAmount(address borrower, uint256 repayAmount) public view returns (uint, uint, uint) {
        MathError mErr;
        uint256 totalRepayAmount = getVAIRepayAmount(borrower);
        uint256 currentInterest;

        (mErr, currentInterest) = subUInt(totalRepayAmount, comptroller.mintedVAIs(borrower));
        require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

        (mErr, currentInterest) = addUInt(pastVAIInterest[borrower], currentInterest);
        require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

        uint256 burn;
        uint256 partOfCurrentInterest = currentInterest; // 6
        uint256 partOfPastInterest = pastVAIInterest[borrower]; 2

        if (repayAmount >= totalRepayAmount) {
            (mErr, burn) = subUInt(totalRepayAmount, currentInterest); 48
            require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");
        } else {
            uint256 delta;

            (mErr, delta) = mulUInt(repayAmount, 1e18); //27 / 54
            require(mErr == MathError.NO_ERROR, "VAI_PART_CALCULATION_FAILED");

            (mErr, delta) = divUInt(delta, totalRepayAmount); 0.5
            require(mErr == MathError.NO_ERROR, "VAI_PART_CALCULATION_FAILED");

            uint256 totalMintedAmount;
            (mErr, totalMintedAmount) = subUInt(totalRepayAmount, currentInterest);
            require(mErr == MathError.NO_ERROR, "VAI_MINTED_AMOUNT_CALCULATION_FAILED");

            (mErr, burn) = mulUInt(totalMintedAmount, delta);
            require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

            (mErr, burn) = divUInt(burn, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

            (mErr, partOfCurrentInterest) = mulUInt(currentInterest, delta);
            require(mErr == MathError.NO_ERROR, "VAI_CURRENT_INTEREST_AMOUNT_CALCULATION_FAILED");

            (mErr, partOfCurrentInterest) = divUInt(partOfCurrentInterest, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_CURRENT_INTEREST_AMOUNT_CALCULATION_FAILED");

            (mErr, partOfPastInterest) = mulUInt(pastVAIInterest[borrower], delta);
            require(mErr == MathError.NO_ERROR, "VAI_PAST_INTEREST_CALCULATION_FAILED");

            (mErr, partOfPastInterest) = divUInt(partOfPastInterest, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_PAST_INTEREST_CALCULATION_FAILED");
        }

        return (burn, partOfCurrentInterest, partOfPastInterest);
    }

    function accrueVAIInterest() public {
        MathError mErr;
        uint256 delta;

        (mErr, delta) = mulUInt(getVAIRepayRatePerBlock(), getBlockNumber() - accrualBlockNumber);
        require(mErr == MathError.NO_ERROR, "VAI_INTEREST_ACCURE_FAILED");

        (mErr, delta) = addUInt(delta, vaiMintIndex);
        require(mErr == MathError.NO_ERROR, "VAI_INTEREST_ACCURE_FAILED");

        vaiMintIndex = delta;
        accrualBlockNumber = getBlockNumber();
    }

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Admin function to set the access control address
     * @param newAccessControlAddress New address for the access control
     */
    function setAccessControl(address newAccessControlAddress) external onlyOwner {
        _ensureNonzeroAddress(newAccessControlAddress);

        address oldAccessControlAddress = accessControl;
        accessControl = newAccessControlAddress;
        emit NewAccessControl(oldAccessControlAddress, accessControl);
    }

    /**
     * @notice Set VAI borrow base rate
     * @param newBaseRateMantissa the base rate multiplied by 10**18
     */
    function setBaseRate(uint256 newBaseRateMantissa) external {
        _ensureAllowed("setBaseRate(uint256)");

        uint256 old = baseRateMantissa;
        baseRateMantissa = newBaseRateMantissa;
        emit NewVAIBaseRate(old, baseRateMantissa);
    }

    /**
     * @notice Set VAI borrow float rate
     * @param newFloatRateMantissa the VAI float rate multiplied by 10**18
     */
    function setFloatRate(uint256 newFloatRateMantissa) external {
        _ensureAllowed("setFloatRate(uint256)");

        uint256 old = floatRateMantissa;
        floatRateMantissa = newFloatRateMantissa;
        emit NewVAIFloatRate(old, floatRateMantissa);
    }

    /**
     * @notice Set VAI stability fee receiver address
     * @param newReceiver the address of the VAI fee receiver
     */
    function setReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "invalid receiver address");

        address old = receiver;
        receiver = newReceiver;
        emit NewVAIReceiver(old, newReceiver);
    }

    /**
     * @notice Set VAI mint cap
     * @param _mintCap the amount of VAI that can be minted
     */
    function setMintCap(uint256 _mintCap) external {
        _ensureAllowed("setMintCap(uint256)");

        uint256 old = mintCap;
        mintCap = _mintCap;
        emit NewVAIMintCap(old, _mintCap);
    }

    function getBlockNumber() internal view returns (uint) {
        return block.number;
    }

    function getBlocksPerYear() public view returns (uint) {
        return 10512000; //(24 * 60 * 60 * 365) / 3;
    }

    /**
     * @notice Return the address of the VAI token
     * @return The address of VAI
     */
    function getVAIAddress() public view returns (address) {
        return vai;
    }
}
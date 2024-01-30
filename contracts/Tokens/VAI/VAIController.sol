// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ensureNonzeroAddress, ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { IPrime } from "../../Interfaces/IPrime.sol";
import { TokenErrorReporter } from "../../ErrorReporter.sol";
import { ExponentialNoError } from "../../ExponentialNoError.sol";
import { IComptroller } from "../../ComptrollerInterface.sol";
import { VToken } from "../../VToken.sol";
import { IVAI } from "./IVAI.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";
import { VAIControllerStorage } from "./VAIControllerStorage.sol";

/**
 * @title VAIController
 * @author Venus
 * @notice This VAIController functions as market for VAI token
 */
contract VAIController is
    Ownable2StepUpgradeable,
    AccessControlledV8,
    ReentrancyGuardUpgradeable,
    VAIControllerStorage,
    TokenErrorReporter,
    ExponentialNoError
{
    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account total supply balance.
     *  Note that `vTokenBalance` is the number of vTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountAmountLocalVars {
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

    /// @notice Initial index used in interest computations
    uint256 public constant INITIAL_VAI_MINT_INDEX = 1e18;

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(IComptroller indexed oldComptroller, IComptroller indexed newComptroller);

    /// @notice Emitted when mint for prime holder is changed
    event MintOnlyForPrimeHolder(
        bool indexed previousMintEnabledOnlyForPrimeHolder,
        bool indexed newMintEnabledOnlyForPrimeHolder
    );

    /// @notice Emitted when Prime is changed
    event NewPrime(address indexed oldPrime, address indexed newPrime);

    /// @notice Event emitted when VAI is minted
    event MintVAI(address indexed minter, uint256 mintVaiAmount);

    /// @notice Event emitted when VAI is repaid
    event RepayVAI(address indexed payer, address indexed borrower, uint256 repayVaiAmount);

    /// @notice Event emitted when a borrow is liquidated
    event LiquidateVAI(
        address indexed liquidator,
        address indexed borrower,
        uint256 repayAmount,
        address indexed vTokenCollateral,
        uint256 seizeTokens
    );

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address indexed oldTreasuryGuardian, address indexed newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address indexed oldTreasuryAddress, address indexed newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint256 indexed oldTreasuryPercent, uint256 indexed newTreasuryPercent);

    /// @notice Event emitted when VAIs are minted and fee are transferred
    event MintFee(address indexed minter, uint256 indexed feeAmount);

    /// @notice Emitted when VAI base rate is changed
    event NewVAIBaseRate(uint256 indexed oldBaseRateMantissa, uint256 indexed newBaseRateMantissa);

    /// @notice Emitted when VAI float rate is changed
    event NewVAIFloatRate(uint256 indexed oldFloatRateMantissa, uint256 indexed newFlatRateMantissa);

    /// @notice Emitted when VAI receiver address is changed
    event NewVAIReceiver(address indexed oldReceiver, address indexed newReceiver);

    /// @notice Emitted when VAI mint cap is changed
    event NewVAIMintCap(uint256 indexed oldMintCap, uint256 indexed newMintCap);

    /// @notice Emitted when VAI token address is changed by admin
    event NewVAIToken(address indexed oldVaiToken, address indexed newVaiToken);

    /// @notice Emitted when vaiMintRate is changed
    event NewVAIMintRate(uint256 indexed oldVaiMintRate, uint256 indexed newVaiMintRate);

    /// @notice Thrown when action is restricted to the caller
    error CallerNotAuthorized();

    /// @notice Thrown when treasury percent is overflowed
    error TreasuryPercentOverflow();

    /// @notice Thrown when trying to perform an action that is paused
    error ActionPaused();

    /// @notice Thrown when further minting of VAI tokens is restricted due to reaching the MintCap
    error MintCapReached();

    /// @notice Thrown when mint enables only for prime holders is 'false' and Prime address is not set
    error ToggleConditionNotMet();

    /// @notice Thrown when there is an insufficient balance of mintable VAI tokens
    error InsufficientMintableVAIBalance();

    /**
     * @notice Initializes the VAI Controller
     *  @param accessControlManager_ Address of the AccessControlManager contract
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();

        vaiMintIndex = INITIAL_VAI_MINT_INDEX;
        accrualBlockNumber = _getBlockNumber();
        mintCap = type(uint256).max;
    }

    /**
     * @notice The mintVAI function mints and transfers VAI from the protocol to the user, and adds a borrow balance
     * The amount minted must be less than the user's Account Liquidity and the mint VAI limit
     * @param mintVaiAmount The amount of the VAI to be minted
     * @custom:event MintFee emits on success
     * @custom:event MintVAI emits on success
     * @custom:error ZeroAddressNotAllowed is thrown when comptroller address is zero
     * @custom:error ZeroValueNotAllowed is thrown if mintVaiAmount is 0
     * @custom:error ActionPaused is thrown when mint action is disabled
     * @custom:error MintCapReached is thrown when mint limit is reached
     * @custom:error InsufficientMintableVAIBalance is thrown when VAI mint amount is more than account mintable VAI amount
     */
    function mintVAI(uint256 mintVaiAmount) external nonReentrant {
        ensureNonzeroAddress(address(comptroller));
        ensureNonzeroValue(mintVaiAmount);
        if (comptroller.actionPaused(address(this), IComptroller.Action.MINT)) {
            revert ActionPaused();
        }

        accrueVAIInterest();

        address minter = msg.sender;
        IVAI _vai = IVAI(vai);
        uint256 vaiTotalSupply = _vai.totalSupply();
        uint256 vaiNewTotalSupply = vaiTotalSupply + mintVaiAmount;

        if (vaiNewTotalSupply > mintCap) {
            revert MintCapReached();
        }

        uint256 accountMintableVai = getMintableVAI(minter);

        // check that user have sufficient mintableVAI balance
        if (mintVaiAmount > accountMintableVai) {
            revert InsufficientMintableVAIBalance();
        }

        // Calculate the minted balance based on interest index
        uint256 totalMintedVai = mintedVais[minter];

        if (totalMintedVai > 0) {
            uint256 repayAmount = getVAIRepayAmount(minter);
            uint256 remainedRepayAmount = repayAmount - totalMintedVai;

            pastVaiInterest[minter] += remainedRepayAmount;
            totalMintedVai = repayAmount;
        }

        mintedVais[minter] = totalMintedVai + mintVaiAmount;

        uint256 feeAmount;
        uint256 remainedAmount;
        uint256 mintAmount = mintVaiAmount;
        if (treasuryPercent != 0) {
            feeAmount = mul_(mintAmount, treasuryPercent) / 1e18;
            remainedAmount = mintAmount - feeAmount;

            IVAI(_vai).mint(treasuryAddress, feeAmount);
            emit MintFee(minter, feeAmount);
        } else {
            remainedAmount = mintAmount;
        }

        IVAI(_vai).mint(minter, remainedAmount);
        vaiMinterInterestIndex[minter] = vaiMintIndex;

        emit MintVAI(minter, remainedAmount);
    }

    /**
     * @notice The repay function transfers VAI into the protocol and burn, reducing the user's borrow balance
     * Before repaying an asset, users must first approve the VAI to access their VAI balance
     * @param repayVaiAmount The amount of the VAI to be repaid
     * @return uint256 The actual repayment amount
     * @custom:error ZeroAddressNotAllowed is thrown when comptroller address is zero
     * @custom:error ZeroValueNotAllowed is thrown if repayVaiAmount is 0
     * @custom:error ActionPaused is thrown when repay action is disabled
     */
    function repayVAI(uint256 repayVaiAmount) external nonReentrant returns (uint256) {
        ensureNonzeroAddress(address(comptroller));
        ensureNonzeroValue(repayVaiAmount);

        accrueVAIInterest();

        if (comptroller.actionPaused(address(this), IComptroller.Action.REPAY)) {
            revert ActionPaused();
        }

        return _repayVAIFresh(msg.sender, msg.sender, repayVaiAmount);
    }

    /**
     * @notice Sets a new comptroller
     * @param comptroller_ address of comptroller
     * @custom:error ZeroAddressNotAllowed is thrown when new comptroller address is zero
     * @custom:event NewComptroller emits on success
     * @custom:access Only Governance
     */
    function setComptroller(IComptroller comptroller_) external onlyOwner {
        ensureNonzeroAddress(address(comptroller_));

        emit NewComptroller(comptroller, comptroller_);
        comptroller = comptroller_;
    }

    /**
     * @notice Set the prime token contract address
     * @param prime_ The new address of the prime token contract
     * @custom:error ZeroAddressNotAllowed is thrown when new prime address is zero
     * @custom:event NewPrime emits on success
     * @custom:access Only Governance
     */
    function setPrimeToken(address prime_) external onlyOwner {
        ensureNonzeroAddress(prime_);

        emit NewPrime(prime, prime_);
        prime = prime_;
    }

    /**
     * @notice Set the VAI token contract address
     * @param vai_ The new address of the VAI token contract
     * @custom:error ZeroAddressNotAllowed is thrown when new VAI address is zero
     * @custom:event NewVAIToken emits on success
     * @custom:access Only Governance
     */
    function setVAIToken(address vai_) external onlyOwner {
        ensureNonzeroAddress(vai_);

        emit NewVAIToken(vai, vai_);
        vai = vai_;
    }

    /**
     * @notice Set the VAI mint rate
     * @param newVaiMintRate The new VAI mint rate to be set
     * @custom:event NewVaiMintRate emits on success
     * @custom:access Controlled by AccessControlManager
     */
    function setVAIMintRate(uint256 newVaiMintRate) external {
        _checkAccessAllowed("setVAIMintRate(uint256)");

        emit NewVAIMintRate(vaiMintRate, newVaiMintRate);
        vaiMintRate = newVaiMintRate;
    }

    /**
     * @notice Toggle mint only for prime holder
     * @custom:event MintOnlyForPrimeHolder emits on success
     * @custom:error ToggleConditionNotMet is thrown when mint is disabled for prime holders and prime address is not set
     * @custom:access Controlled by AccessControlManager
     */
    function toggleOnlyPrimeHolderMint() external {
        _checkAccessAllowed("toggleOnlyPrimeHolderMint()");

        if (!mintEnabledOnlyForPrimeHolder && prime == address(0)) {
            revert ToggleConditionNotMet();
        }

        emit MintOnlyForPrimeHolder(mintEnabledOnlyForPrimeHolder, !mintEnabledOnlyForPrimeHolder);
        mintEnabledOnlyForPrimeHolder = !mintEnabledOnlyForPrimeHolder;
    }

    /**
     * @notice The sender liquidates the VAI minters collateral. The collateral seized is transferred to the liquidator
     * @param borrower The borrower of VAI to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @return uint256 The actual repayment amount
     * @custom:error ActionPaused is thrown when liquidation action is paused
     */
    function liquidateVAI(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) external nonReentrant returns (uint256) {
        if (comptroller.actionPaused(address(this), IComptroller.Action.LIQUIDATE)) {
            revert ActionPaused();
        }

        vTokenCollateral.accrueInterest();

        // _liquidateVAIFresh emits borrow-specific logs on errors, so we don't need to
        return _liquidateVAIFresh(msg.sender, borrower, repayAmount, vTokenCollateral);
    }

    /**
     * @notice Set VAI borrow base rate
     * @param newBaseRateMantissa the base rate multiplied by 10**18
     * @custom:event NewVAIBaseRate emits on success
     * @custom:access Controlled by AccessControlManager
     */
    function setBaseRate(uint256 newBaseRateMantissa) external {
        _checkAccessAllowed("setBaseRate(uint256)");

        emit NewVAIBaseRate(baseRateMantissa, newBaseRateMantissa);
        baseRateMantissa = newBaseRateMantissa;
    }

    /**
     * @notice Set VAI borrow float rate
     * @param newFloatRateMantissa the VAI float rate multiplied by 10**18
     * @custom:event NewVAIFloatRate emits on success
     * @custom:access Controlled by AccessControlManager
     */
    function setFloatRate(uint256 newFloatRateMantissa) external {
        _checkAccessAllowed("setFloatRate(uint256)");

        emit NewVAIFloatRate(floatRateMantissa, newFloatRateMantissa);
        floatRateMantissa = newFloatRateMantissa;
    }

    /**
     * @notice Set VAI stability fee receiver address
     * @param newReceiver the address of the VAI fee receiver
     * @custom:error ZeroAddressNotAllowed is thrown when new receiver address is zero
     * @custom:event NewVAIReceiver emits on success
     * @custom:access Controlled by AccessControlManager
     */
    function setReceiver(address newReceiver) external onlyOwner {
        ensureNonzeroAddress(newReceiver);

        emit NewVAIReceiver(receiver, newReceiver);
        receiver = newReceiver;
    }

    /**
     * @notice Set VAI mint cap
     * @param _mintCap the amount of VAI that can be minted
     * @custom:event NewVAIMintCap emits on success
     * @custom:access Controlled by AccessControlManager
     */
    function setMintCap(uint256 _mintCap) external {
        _checkAccessAllowed("setMintCap(uint256)");

        emit NewVAIMintCap(mintCap, _mintCap);
        mintCap = _mintCap;
    }

    /**
     * @notice Set Treasury Details
     * @param newTreasuryGuardian new TreasuryGuardian address
     * @param newTreasuryAddress new Treasury address
     * @param newTreasuryPercent new Treasury percentage
     * @custom:error ZeroAddressNotAllowed is thrown if newTreasuryGuardian is zero address
     * @custom:error ZeroAddressNotAllowed is thrown if newTreasuryAddress is zero address
     * @custom:error CallerNotAuthorized is thrown if caller is not owner or treasury guardian
     * @custom:error TreasuryPercentOverflow is thrown if newTreasuryPercent exceeds 1e18
     * @custom:event NewTreasuryGuardian emits on success
     * @custom:event NewTreasuryAddress emits on success
     * @custom:event NewTreasuryPercent emits on success
     * @custom:access Controlled by Governance and TreasuryGuardian
     */
    function setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint256 newTreasuryPercent
    ) external {
        // Check caller is owner
        if (!(msg.sender == owner() || msg.sender == treasuryGuardian)) {
            revert CallerNotAuthorized();
        }

        ensureNonzeroAddress(newTreasuryGuardian);
        ensureNonzeroAddress(newTreasuryAddress);

        if (newTreasuryPercent > 1e18) {
            revert TreasuryPercentOverflow();
        }

        emit NewTreasuryGuardian(treasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(treasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(treasuryPercent, newTreasuryPercent);

        treasuryGuardian = newTreasuryGuardian;
        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;
    }

    /**
     * @notice Accrues Vai Interest
     */
    function accrueVAIInterest() public {
        uint256 delta = getVAIRepayRatePerBlock() * (_getBlockNumber() - accrualBlockNumber);
        delta += vaiMintIndex;

        vaiMintIndex = delta;
        accrualBlockNumber = _getBlockNumber();
    }

    /**
     * @notice This function calculates the VAI amount that can be minted to the minter
     * @param minter Address of the minter
     * @custom:error ZeroValueNotAllowed is thrown if oraclePrice is 0
     * @return (uint256) Returns the mintable VAI amount
     */
    function getMintableVAI(address minter) public view returns (uint256) {
        if (mintEnabledOnlyForPrimeHolder && !IPrime(prime).isUserPrimeHolder(minter)) {
            return 0;
        }

        ResilientOracleInterface oracle = comptroller.oracle();
        VToken[] memory enteredMarkets = comptroller.getAssetsIn(minter);

        AccountAmountLocalVars memory vars; // Holds all our calculation results

        uint256 accountMintableVai;
        uint256 numberOfMarkets = enteredMarkets.length;

        /**
         * We use this formula to calculate mintable VAI amount.
         * totalSupplyAmount * vaiMintRate - (totalBorrowAmount + mintedVAIOf)
         */
        for (uint256 i; i < numberOfMarkets; ) {
            (, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = enteredMarkets[i]
                .getAccountSnapshot(minter);
            vars.exchangeRate = Exp({ mantissa: vars.exchangeRateMantissa });

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(address(enteredMarkets[i]));
            ensureNonzeroValue(vars.oraclePriceMantissa);

            vars.oraclePrice = Exp({ mantissa: vars.oraclePriceMantissa });

            vars.tokensToDenom = mulExp(vars.exchangeRate, vars.oraclePrice);

            vars.marketSupply = mul_ScalarTruncate(vars.tokensToDenom, vars.vTokenBalance);

            (, uint256 collateralFactorMantissa) = comptroller.markets(address(enteredMarkets[i]));

            vars.marketSupply = vars.marketSupply * collateralFactorMantissa;

            vars.marketSupply = vars.marketSupply / 1e18;

            vars.sumSupply = vars.sumSupply + vars.marketSupply;

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            vars.sumBorrowPlusEffects += mul_ScalarTruncateAddUInt(
                vars.oraclePrice,
                vars.borrowBalance,
                vars.sumBorrowPlusEffects
            );

            unchecked {
                ++i;
            }
        }

        uint256 totalMintedVai = mintedVais[minter];
        uint256 repayAmount;

        if (totalMintedVai > 0) {
            repayAmount = getVAIRepayAmount(minter);
        }

        vars.sumBorrowPlusEffects = vars.sumBorrowPlusEffects + repayAmount;

        accountMintableVai = (vars.sumSupply * vaiMintRate) / 10000;
        accountMintableVai -= vars.sumBorrowPlusEffects;
        return accountMintableVai;
    }

    /**
     * @notice This function calculates the VAI repay rate
     * @return (uint256) Returns the repay rate for VAI
     */
    function getVAIRepayRate() public view returns (uint256) {
        ResilientOracleInterface oracle_ = comptroller.oracle();
        if (baseRateMantissa > 0) {
            if (floatRateMantissa > 0) {
                uint256 oraclePrice = oracle_.getUnderlyingPrice(address(VToken(getVAIAddress())));
                if (1e18 > oraclePrice) {
                    uint256 delta = ((1e18 - oraclePrice) * floatRateMantissa) / 1e18;
                    uint256 rate = delta + baseRateMantissa;
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

    /**
     * @notice This function calculates the VAI repay rate per block
     * @return (uint256) Returns the repay rate for VAI per block
     */
    function getVAIRepayRatePerBlock() public view returns (uint256) {
        uint256 yearlyRate = getVAIRepayRate();
        uint256 rate = yearlyRate / getBlocksPerYear();
        return rate;
    }

    /**
     * @notice This function returns the interest index for the minter
     * @param minter Address of the minter
     * @return (uint256) Returns the interest index for the minter
     */
    function getVAIMinterInterestIndex(address minter) public view returns (uint256) {
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
     * @return (uint256) The total amount of VAI the user needs to repay
     */
    function getVAIRepayAmount(address account) public view returns (uint256) {
        uint256 delta;

        uint256 amount = mintedVais[account];
        uint256 interest = pastVaiInterest[account];

        uint256 totalMintedVai = amount - interest;

        delta = vaiMintIndex - getVAIMinterInterestIndex(account);

        uint256 newInterest = (delta * totalMintedVai) / 1e18;
        uint256 newAmount = amount + newInterest;

        return newAmount;
    }

    /**
     * @notice Calculate how much VAI the user needs to repay
     * @param borrower The address of the VAI borrower
     * @param repayAmount The amount of VAI being returned
     * @return (uint256, uint256, uint256) Amount of VAI to be burned, Amount of VAI the user needs to pay in current interest and Amount
     * of VAI the user needs to pay in past interest
     */
    function getVAICalculateRepayAmount(
        address borrower,
        uint256 repayAmount
    ) public view returns (uint256, uint256, uint256) {
        uint256 totalRepayAmount = getVAIRepayAmount(borrower);
        uint256 currentInterest;

        currentInterest = totalRepayAmount - mintedVais[borrower];

        currentInterest = pastVaiInterest[borrower] + currentInterest;

        uint256 burn;
        uint256 partOfCurrentInterest = currentInterest;
        uint256 partOfPastInterest = pastVaiInterest[borrower];

        if (repayAmount >= totalRepayAmount) {
            burn = totalRepayAmount - currentInterest;
        } else {
            uint256 delta = (repayAmount * 1e18) / totalRepayAmount;

            uint256 totalMintedAmount = totalRepayAmount - currentInterest;

            burn = (totalMintedAmount * delta) / 1e18;
            partOfCurrentInterest = (currentInterest * delta) / 1e18;
            partOfPastInterest = (pastVaiInterest[borrower] * delta) / 1e18;
        }

        return (burn, partOfCurrentInterest, partOfPastInterest);
    }

    /**
     * @notice Return the address of the VAI token
     * @return The address of VAI
     */
    function getVAIAddress() public view returns (address) {
        return vai;
    }

    /**
     * @notice Return the number of blocks mined in a year
     * @return The number of blocks mined per year
     */
    function getBlocksPerYear() public view virtual returns (uint256) {
        return 10512000; //(24 * 60 * 60 * 365) / 3;
    }

    /**
     * @notice Repay VAI Internal
     * @notice Borrowed VAIs are repaid by another user (possibly the borrower)
     * @param payer the account paying off the VAI
     * @param borrower the account with the debt being payed off
     * @param repayAmount the amount of VAI being returned
     * @return uint256 The actual repayment amount
     * @custom:event RepayVAI emits on success
     */
    function _repayVAIFresh(address payer, address borrower, uint256 repayAmount) internal returns (uint256) {
        (uint256 burn, uint256 partOfCurrentInterest, uint256 partOfPastInterest) = getVAICalculateRepayAmount(
            borrower,
            repayAmount
        );

        IVAI _vai = IVAI(vai);
        _vai.burn(payer, burn);

        bool success = _vai.transferFrom(payer, receiver, partOfCurrentInterest);
        require(success, "Failed to transfer VAI fee");

        uint256 vaiBalanceBorrower = mintedVais[borrower];
        uint256 accountVaiNew = vaiBalanceBorrower - burn - partOfPastInterest;

        pastVaiInterest[borrower] -= partOfPastInterest;

        mintedVais[borrower] = accountVaiNew;

        emit RepayVAI(payer, borrower, burn);
        return burn;
    }

    /**
     * @notice The liquidator liquidates the borrowers collateral by repaying borrowers VAI,
     *  The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the VAI and seizing collateral
     * @param borrower The borrower of this VAI to be liquidated
     * @param repayAmount The amount of the VAI to repay
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @return uint256 The actual repayment VAI
     * @custom:error ZeroAddressNotAllowed is thrown when comptroller address is zero
     * @custom:error LiquidateCollateralFreshnessCheck is thrown when current and markets block numbers don't match
     * @custom:error LiquidateLiquidatorIsBorrower is thrown when the liquidator is also the borrower
     * @custom:error LiquidateCloseAmountIsZero is thrown when the liquidation amount is zero
     * @custom:error LiquidateCloseAmountIsUintMax is thrown when the liquidation amount is the maximum value of uint256
     * @custom:event Emits on success
     */
    function _liquidateVAIFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) internal returns (uint256) {
        ensureNonzeroAddress(address(comptroller));
        accrueVAIInterest();

        /* Fail if liquidate not allowed */
        comptroller.preLiquidateHook(address(this), address(vTokenCollateral), borrower, repayAmount, false);

        /* Verify vTokenCollateral market's block number equals current block number */
        if (vTokenCollateral.accrualBlockNumber() != _getBlockNumber()) {
            revert LiquidateCollateralFreshnessCheck();
        }

        /* Fail if borrower = liquidator */
        if (borrower == liquidator) {
            revert LiquidateLiquidatorIsBorrower();
        }

        /* Fail if repayAmount = 0 */
        if (repayAmount == 0) {
            revert LiquidateCloseAmountIsZero();
        }

        /* Fail if repayAmount = -1 */
        if (repayAmount == type(uint256).max) {
            revert LiquidateCloseAmountIsUintMax();
        }

        uint256 actualRepayAmount = _repayVAIFresh(liquidator, borrower, repayAmount);

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /* We calculate the number of collateral tokens that will be seized */
        (, uint256 seizeTokens) = comptroller.liquidateCalculateSeizeTokens(
            address(this),
            address(vTokenCollateral),
            actualRepayAmount
        );

        /* Revert if borrower collateral token balance < seizeTokens */
        require(vTokenCollateral.balanceOf(borrower) >= seizeTokens, "VAI_LIQUIDATE_SEIZE_TOO_MUCH");

        vTokenCollateral.seize(liquidator, borrower, seizeTokens);

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

        return actualRepayAmount;
    }

    /**
     * @notice Gives current block number
     * @return Return the current block number
     */
    function _getBlockNumber() internal view virtual returns (uint256) {
        return block.number;
    }
}

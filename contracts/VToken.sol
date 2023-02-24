// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./ComptrollerInterface.sol";
import "./VTokenInterfaces.sol";
import "./ErrorReporter.sol";
import "./InterestRateModel.sol";
import "./ExponentialNoError.sol";
import "./Governance/AccessControlManager.sol";
import "./RiskFund/IProtocolShareReserve.sol";
import "./InterestRate/StableRateModel.sol";

/**
 * @title Venus VToken Contract
 * @author Venus Dev Team
 */
contract VToken is Ownable2StepUpgradeable, VTokenInterface, ExponentialNoError, TokenErrorReporter {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Construct a new money market
     * @param underlying_ The address of the underlying asset
     * @param comptroller_ The address of the Comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ ERC-20 name of this token
     * @param symbol_ ERC-20 symbol of this token
     * @param decimals_ ERC-20 decimal precision of this token
     * @param admin_ Address of the administrator of this token
     * @param riskManagement Addresses of risk fund contracts
     * @param stableRateModel_ Address of the stable interest rate model
     */
    function initialize(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        AccessControlManager accessControlManager_,
        RiskManagementInit memory riskManagement,
        StableRateModel stableRateModel_
    ) public initializer {
        // Initialize the market
        _initialize(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            accessControlManager_,
            riskManagement,
            stableRateModel_
        );
    }

    /**
     * @notice Initialize the money market
     * @param underlying_ The address of the underlying asset
     * @param comptroller_ The address of the Comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ EIP-20 name of this token
     * @param symbol_ EIP-20 symbol of this token
     * @param decimals_ EIP-20 decimal precision of this token
     */
    function _initialize(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        AccessControlManager accessControlManager_,
        VTokenInterface.RiskManagementInit memory riskManagement,
        StableRateModel stableRateModel_
    ) internal onlyInitializing {
        __Ownable2Step_init();
        require(accrualBlockNumber == 0 && borrowIndex == 0, "market may only be initialized once");

        _setAccessControlAddress(accessControlManager_);

        // Set initial exchange rate
        initialExchangeRateMantissa = initialExchangeRateMantissa_;
        require(initialExchangeRateMantissa > 0, "initial exchange rate must be greater than zero.");

        _setComptroller(comptroller_);

        // Initialize block number and borrow index (block number mocks depend on comptroller being set)
        accrualBlockNumber = _getBlockNumber();
        borrowIndex = mantissaOne;
        stableBorrowIndex = mantissaOne;

        // Set the interest rate model (depends on block number / borrow index)
        _setInterestRateModelFresh(interestRateModel_);

        // Set the interest rate model (depends on block number / borrow index)
        _setStableInterestRateModelFresh(stableRateModel_);

        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        shortfall = riskManagement.shortfall;
        riskFund = riskManagement.riskFund;
        protocolShareReserve = riskManagement.protocolShareReserve;
        protocolSeizeShareMantissa = 5e16; // 5%

        // Set underlying and sanity check it
        underlying = underlying_;
        IERC20Upgradeable(underlying).totalSupply();

        // The counter starts true to prevent changing it from zero to non-zero (i.e. smaller cost/refund)
        _notEntered = true;
        _transferOwnership(admin_);
    }

    /**
     * @notice Transfer `tokens` tokens from `src` to `dst` by `spender`
     * @dev Called by both `transfer` and `transferFrom` internally
     * @param spender The address of the account performing the transfer
     * @param src The address of the source account
     * @param dst The address of the destination account
     * @param tokens The number of tokens to transfer
     */
    function _transferTokens(
        address spender,
        address src,
        address dst,
        uint256 tokens
    ) internal {
        /* Fail if transfer not allowed */
        comptroller.preTransferHook(address(this), src, dst, tokens);

        /* Do not allow self-transfers */
        if (src == dst) {
            revert TransferNotAllowed();
        }

        /* Get the allowance, infinite for the account owner */
        uint256 startingAllowance;
        if (spender == src) {
            startingAllowance = type(uint256).max;
        } else {
            startingAllowance = transferAllowances[src][spender];
        }

        /* Do the calculations, checking for {under,over}flow */
        uint256 allowanceNew = startingAllowance - tokens;
        uint256 srvTokensNew = accountTokens[src] - tokens;
        uint256 dstTokensNew = accountTokens[dst] + tokens;

        /////////////////////////
        // EFFECTS & INTERACTIONS

        accountTokens[src] = srvTokensNew;
        accountTokens[dst] = dstTokensNew;

        /* Eat some of the allowance (if necessary) */
        if (startingAllowance != type(uint256).max) {
            transferAllowances[src][spender] = allowanceNew;
        }

        /* We emit a Transfer event */
        emit Transfer(src, dst, tokens);
    }

    /**
     * @notice Transfer `amount` tokens from `msg.sender` to `dst`
     * @param dst The address of the destination account
     * @param amount The number of tokens to transfer
     * @return success True if the transfer suceeded, reverts otherwise
     * @custom:events Emits Transfer event on success
     * @custom:error TransferNotAllowed is thrown if trying to transfer to self
     * @custom:access Not restricted
     */
    function transfer(address dst, uint256 amount) external override nonReentrant returns (bool) {
        _transferTokens(msg.sender, msg.sender, dst, amount);
        return true;
    }

    /**
     * @notice Transfer `amount` tokens from `src` to `dst`
     * @param src The address of the source account
     * @param dst The address of the destination account
     * @param amount The number of tokens to transfer
     * @return success True if the transfer suceeded, reverts otherwise
     * @custom:events Emits Transfer event on success
     * @custom:error TransferNotAllowed is thrown if trying to transfer to self
     * @custom:access Not restricted
     */
    function transferFrom(
        address src,
        address dst,
        uint256 amount
    ) external override nonReentrant returns (bool) {
        _transferTokens(msg.sender, src, dst, amount);
        return true;
    }

    /**
     * @notice Approve `spender` to transfer up to `amount` from `src`
     * @dev This will overwrite the approval amount for `spender`
     *  and is subject to issues noted [here](https://eips.ethereum.org/EIPS/eip-20#approve)
     * @param spender The address of the account which may transfer tokens
     * @param amount The number of tokens that are approved (uint256.max means infinite)
     * @return success Whether or not the approval succeeded
     * @custom:events Emits Approval event
     * @custom:access Not restricted
     */
    function approve(address spender, uint256 amount) external override returns (bool) {
        address src = msg.sender;
        transferAllowances[src][spender] = amount;
        emit Approval(src, spender, amount);
        return true;
    }

    /**
     * @notice Get the current allowance from `owner` for `spender`
     * @param owner The address of the account which owns the tokens to be spent
     * @param spender The address of the account which may transfer tokens
     * @return amount The number of tokens allowed to be spent (-1 means infinite)
     */
    function allowance(address owner, address spender) external view override returns (uint256) {
        return transferAllowances[owner][spender];
    }

    /**
     * @notice Get the token balance of the `owner`
     * @param owner The address of the account to query
     * @return amount The number of tokens owned by `owner`
     */
    function balanceOf(address owner) external view override returns (uint256) {
        return accountTokens[owner];
    }

    /**
     * @notice Get the underlying balance of the `owner`
     * @dev This also accrues interest in a transaction
     * @param owner The address of the account to query
     * @return amount The amount of underlying owned by `owner`
     */
    function balanceOfUnderlying(address owner) external override returns (uint256) {
        Exp memory exchangeRate = Exp({ mantissa: exchangeRateCurrent() });
        return mul_ScalarTruncate(exchangeRate, accountTokens[owner]);
    }

    /**
     * @notice Get a snapshot of the account's balances, and the cached exchange rate
     * @dev This is used by comptroller to more efficiently perform liquidity checks.
     * @param account Address of the account to snapshot
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @return vTokenBalance User's balance of vTokens
     * @return borrowBalance Amount owed in terms of underlying
     * @return exchangeRate Stored exchange rate
     */
    function getAccountSnapshot(address account)
        external
        view
        override
        returns (
            uint256 error,
            uint256 vTokenBalance,
            uint256 borrowBalance,
            uint256 exchangeRate
        )
    {
        (uint256 stableBorrowAmount, , ) = _stableBorrowBalanceStored(account);
        uint256 borrowAmount = _borrowBalanceStored(account) + stableBorrowAmount;
        return (NO_ERROR, accountTokens[account], borrowAmount, _exchangeRateStored());
    }

    /**
     * @dev Function to simply retrieve block number
     *  This exists mainly for inheriting test contracts to stub this result.
     */
    function _getBlockNumber() internal view virtual returns (uint256) {
        return block.number;
    }

    /**
     * @notice Returns the current per-block borrow interest rate for this vToken
     * @return rate The borrow interest rate per block, scaled by 1e18
     */
    function borrowRatePerBlock() external view override returns (uint256) {
        return interestRateModel.getBorrowRate(utilizationRate(_getCashPrior(), totalBorrows, totalReserves));
    }

    /**
     * @notice Returns the current per-block borrow interest rate for this vToken
     * @return rate The borrow interest rate per block, scaled by 1e18
     */
    function stableBorrowRatePerBlock() public view override returns (uint256) {
        uint256 variableBorrowRate = interestRateModel.getBorrowRate(
            utilizationRate(_getCashPrior(), totalBorrows, totalReserves)
        );
        return stableRateModel.getBorrowRate(stableBorrows, totalBorrows, variableBorrowRate);
    }

    /**
     * @notice Returns the current per-block supply interest rate for this v
     * @return rate The supply interest rate per block, scaled by 1e18
     */
    function supplyRatePerBlock() external view override returns (uint256) {
        if (totalBorrows == 0) {
            return 0;
        }
        uint256 utilRate = utilizationRate(_getCashPrior(), totalBorrows, totalReserves);
        uint256 averageMarketBorrowRate = _averageMarketBorrowRate();
        return
            (averageMarketBorrowRate * utilRate * (mantissaOne - reserveFactorMantissa)) / (mantissaOne * mantissaOne);
    }

    /// @notice Calculate the average market borrow rate with respect to variable and stable borrows
    function _averageMarketBorrowRate() internal view returns (uint256) {
        uint256 variableBorrowRate = interestRateModel.getBorrowRate(
            utilizationRate(_getCashPrior(), totalBorrows, totalReserves)
        );
        uint256 variableBorrows = totalBorrows - stableBorrows;
        return ((variableBorrows * variableBorrowRate) + (stableBorrows * averageStableBorrowRate)) / totalBorrows;
    }

    /**
     * @notice Returns the current total borrows plus accrued interest
     * @return totalBorrows The total borrows with interest
     */
    function totalBorrowsCurrent() external override nonReentrant returns (uint256) {
        accrueInterest();
        return totalBorrows;
    }

    /**
     * @notice Accrue interest to updated borrowIndex and then calculate account's borrow balance using the updated borrowIndex
     * @param account The address whose balance should be calculated after updating borrowIndex
     * @return borrowBalance The calculated balance
     */
    function borrowBalanceCurrent(address account) external override nonReentrant returns (uint256) {
        accrueInterest();
        (uint256 stableBorrowAmount, , ) = _stableBorrowBalanceStored(account);
        return _borrowBalanceStored(account) + stableBorrowAmount;
    }

    /**
     * @notice Return the borrow balance of account based on stored data
     * @param account The address whose balance should be calculated
     * @return borrowBalance The calculated balance
     */
    function borrowBalanceStored(address account) public view override returns (uint256) {
        (uint256 stableBorrowAmount, , ) = _stableBorrowBalanceStored(account);
        return _borrowBalanceStored(account) + stableBorrowAmount;
    }

    /**
     * @notice Return the borrow balance of account based on stored data
     * @param account The address whose balance should be calculated
     * @return borrowBalance the calculated balance
     */
    function _borrowBalanceStored(address account) internal view returns (uint256) {
        /* Get borrowBalance and borrowIndex */
        BorrowSnapshot storage borrowSnapshot = accountBorrows[account];

        /* If borrowBalance = 0 then borrowIndex is likely also 0.
         * Rather than failing the calculation with a division by 0, we immediately return 0 in this case.
         */
        if (borrowSnapshot.principal == 0) {
            return 0;
        }

        /* Calculate new borrow balance using the interest index:
         *  recentBorrowBalance = borrower.borrowBalance * market.borrowIndex / borrower.borrowIndex
         */
        uint256 principalTimesIndex = borrowSnapshot.principal * borrowIndex;

        return principalTimesIndex / borrowSnapshot.interestIndex;
    }

    /**
     * @notice Return the borrow balance of account based on stored data
     * @param account The address whose balance should be calculated
     * @return borrowBalance the calculated balance
     */
    function _stableBorrowBalanceStored(address account)
        internal
        view
        returns (
            uint256,
            uint256,
            Exp memory
        )
    {
        /* Get borrowBalance and borrowIndex */
        StableBorrowSnapshot storage borrowSnapshot = accountStableBorrows[account];
        Exp memory simpleStableInterestFactor;

        /* If borrowBalance = 0 then borrowIndex is likely also 0.
         * Rather than failing the calculation with a division by 0, we immediately return 0 in this case.
         */
        if (borrowSnapshot.principal == 0) {
            return (0, borrowSnapshot.interestIndex, simpleStableInterestFactor);
        }

        uint256 currentBlockNumber = _getBlockNumber();

        /* Short-circuit accumulating 0 interest */
        if (borrowSnapshot.lastBlockAccrued == currentBlockNumber) {
            return (borrowSnapshot.principal, borrowSnapshot.interestIndex, simpleStableInterestFactor);
        }

        /* Calculate the number of blocks elapsed since the last accrual */
        uint256 blockDelta = currentBlockNumber - borrowSnapshot.lastBlockAccrued;

        simpleStableInterestFactor = mul_(Exp({ mantissa: borrowSnapshot.stableRateMantissa }), blockDelta);

        uint256 stableBorrowIndexNew = mul_ScalarTruncateAddUInt(
            simpleStableInterestFactor,
            borrowSnapshot.interestIndex,
            borrowSnapshot.interestIndex
        );
        uint256 principalUpdated = (borrowSnapshot.principal * stableBorrowIndexNew) / borrowSnapshot.interestIndex;

        return (principalUpdated, stableBorrowIndexNew, simpleStableInterestFactor);
    }

    /**
     * @notice Return the stable borrow balance of account based on stored data
     * @param account The address whose balance should be calculated
     * @return Stable borrowBalance the calculated balance
     * @custom:events UpdatedUserStableBorrowBalance event emitted after updating account's borrow
     */
    function _updateUserStableBorrowBalance(address account) internal returns (uint256) {
        StableBorrowSnapshot storage borrowSnapshot = accountStableBorrows[account];

        Exp memory simpleStableInterestFactor;
        uint256 principalUpdated;
        uint256 stableBorrowIndexNew;

        (principalUpdated, stableBorrowIndexNew, simpleStableInterestFactor) = _stableBorrowBalanceStored(account);
        uint256 stableBorrowsPrior = stableBorrows;
        uint256 totalBorrowsPrior = totalBorrows;
        uint256 totalReservesPrior = totalReserves;

        uint256 stableInterestAccumulated = mul_ScalarTruncate(simpleStableInterestFactor, borrowSnapshot.principal);
        uint256 stableBorrowsUpdated = stableBorrowsPrior + stableInterestAccumulated;
        uint256 totalBorrowsUpdated = totalBorrowsPrior + stableInterestAccumulated;
        uint256 totalReservesUpdated = mul_ScalarTruncateAddUInt(
            Exp({ mantissa: reserveFactorMantissa }),
            stableInterestAccumulated,
            totalReservesPrior
        );

        stableBorrows = stableBorrowsUpdated;
        totalBorrows = totalBorrowsUpdated;
        totalReserves = totalReservesUpdated;
        borrowSnapshot.interestIndex = stableBorrowIndexNew;
        borrowSnapshot.principal = principalUpdated;
        borrowSnapshot.lastBlockAccrued = _getBlockNumber();

        emit UpdatedUserStableBorrowBalance(account, principalUpdated);
        return principalUpdated;
    }

    /**
     * @notice Accrue interest then return the up-to-date exchange rate
     * @return exchangeRate Calculated exchange rate scaled by 1e18
     */
    function exchangeRateCurrent() public override nonReentrant returns (uint256) {
        accrueInterest();
        return _exchangeRateStored();
    }

    /**
     * @notice Calculates the exchange rate from the underlying to the VToken
     * @dev This function does not accrue interest before calculating the exchange rate
     * @return exchangeRate Calculated exchange rate scaled by 1e18
     */
    function exchangeRateStored() public view override returns (uint256) {
        return _exchangeRateStored();
    }

    /**
     * @notice Calculates the exchange rate from the underlying to the VToken
     * @dev This function does not accrue interest before calculating the exchange rate
     * @return exchangeRate Calculated exchange rate scaled by 1e18
     */
    function _exchangeRateStored() internal view virtual returns (uint256) {
        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            /*
             * If there are no tokens minted:
             *  exchangeRate = initialExchangeRate
             */
            return initialExchangeRateMantissa;
        } else {
            /*
             * Otherwise:
             *  exchangeRate = (totalCash + totalBorrows + badDebt - totalReserves) / totalSupply
             */
            uint256 totalCash = _getCashPrior();
            uint256 cashPlusBorrowsMinusReserves = totalCash + totalBorrows + badDebt - totalReserves;
            uint256 exchangeRate = (cashPlusBorrowsMinusReserves * expScale) / _totalSupply;

            return exchangeRate;
        }
    }

    /**
     * @notice Get cash balance of this vToken in the underlying asset
     * @return cash The quantity of underlying asset owned by this contract
     */
    function getCash() external view override returns (uint256) {
        return _getCashPrior();
    }

    /**
     * @notice Applies accrued interest to total borrows and reserves
     * @dev This calculates interest accrued from the last checkpointed block
     *   up to the current block and writes new checkpoint to storage.
     * @return Always NO_ERROR
     * @custom:events Emits AccrueInterest event on success
     * @custom:access Not restricted
     */
    function accrueInterest() public virtual override returns (uint256) {
        /* Remember the initial block number */
        uint256 currentBlockNumber = _getBlockNumber();
        uint256 accrualBlockNumberPrior = accrualBlockNumber;

        /* Short-circuit accumulating 0 interest */
        if (accrualBlockNumberPrior == currentBlockNumber) {
            return NO_ERROR;
        }

        /* Read the previous values out of storage */
        uint256 cashPrior = _getCashPrior();
        uint256 borrowsPrior = totalBorrows - stableBorrows;
        uint256 reservesPrior = totalReserves;
        uint256 borrowIndexPrior = borrowIndex;

        /* Calculate the current borrow interest rate */
        uint256 borrowRateMantissa = interestRateModel.getBorrowRate(
            utilizationRate(cashPrior, borrowsPrior, reservesPrior)
        );
        require(borrowRateMantissa <= borrowRateMaxMantissa, "vToken: borrow rate is absurdly high");

        /* Calculate the number of blocks elapsed since the last accrual */
        uint256 blockDelta = currentBlockNumber - accrualBlockNumberPrior;

        /*
         * Calculate the interest accumulated into borrows and reserves and the new index:
         *  simpleInterestFactor = borrowRate * blockDelta
         *  interestAccumulated = simpleInterestFactor * totalBorrows(for variable borrows only)
         *  totalBorrowsNew = interestAccumulated + totalBorrows(variable + stable)
         *  totalReservesNew = interestAccumulated * reserveFactor + totalReserves
         *  borrowIndexNew = simpleInterestFactor * borrowIndex + borrowIndex
         */

        Exp memory simpleInterestFactor = mul_(Exp({ mantissa: borrowRateMantissa }), blockDelta);
        uint256 interestAccumulated = mul_ScalarTruncate(simpleInterestFactor, borrowsPrior);
        uint256 totalBorrowsNew = interestAccumulated + borrowsPrior + stableBorrows;
        uint256 totalReservesNew = mul_ScalarTruncateAddUInt(
            Exp({ mantissa: reserveFactorMantissa }),
            interestAccumulated,
            reservesPrior
        );
        uint256 borrowIndexNew = mul_ScalarTruncateAddUInt(simpleInterestFactor, borrowIndexPrior, borrowIndexPrior);

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /* We write the previously calculated values into storage */
        accrualBlockNumber = currentBlockNumber;
        borrowIndex = borrowIndexNew;
        totalBorrows = totalBorrowsNew;
        totalReserves = totalReservesNew;

        uint256 err = _accrueStableInterest(blockDelta);

        if (err != 0) {
            return err;
        }

        /* We emit an AccrueInterest event */
        emit AccrueInterest(cashPrior, interestAccumulated, borrowIndexNew, totalBorrowsNew, stableBorrowIndex);

        return NO_ERROR;
    }

    /**
     * @notice Applies accrued stable interest to stable borrows and reserves
     * @dev This calculates interest accrued from the last checkpointed block
     *   up to the current block and writes new checkpoint to storage.
     * @param blockDelta Number of blocks between last accrual and current block
     * @return Always NO_ERROR
     * @custom:events Emits AccrueInterest event on success
     * @custom:access Not restricted
     */
    function _accrueStableInterest(uint256 blockDelta) internal returns (uint256) {
        uint256 stableIndexPrior = stableBorrowIndex;

        uint256 stableBorrowRateMantissa = stableBorrowRatePerBlock();
        require(stableBorrowRateMantissa <= stableBorrowRateMaxMantissa, "vToken: stable borrow rate is absurdly high");

        Exp memory simpleStableInterestFactor = mul_(Exp({ mantissa: stableBorrowRateMantissa }), blockDelta);

        uint256 stableBorrowIndexNew = mul_ScalarTruncateAddUInt(
            simpleStableInterestFactor,
            stableIndexPrior,
            stableIndexPrior
        );

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /* We write the previously calculated values into storage */
        stableBorrowIndex = stableBorrowIndexNew;

        return NO_ERROR;
    }

    /**
     * @notice Sender supplies assets into the market and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param mintAmount The amount of the underlying asset to supply
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits Mint and Transfer events; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function mint(uint256 mintAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _mintFresh emits the actual Mint event if successful and logs on errors, so we don't need to
        _mintFresh(msg.sender, msg.sender, mintAmount);
        return NO_ERROR;
    }

    /**
     * @notice Sender calls on-behalf of minter. minter supplies assets into the market and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param mintAmount The amount of the underlying asset to supply
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits Mint and Transfer events; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function mintBehalf(address minter, uint256 mintAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _mintFresh emits the actual Mint event if successful and logs on errors, so we don't need to
        _mintFresh(msg.sender, minter, mintAmount);
        return NO_ERROR;
    }

    /**
     * @notice User supplies assets into the market and receives vTokens in exchange
     * @dev Assumes interest has already been accrued up to the current block
     * @param payer The address of the account which is sending the assets for supply
     * @param minter The address of the account which is supplying the assets
     * @param mintAmount The amount of the underlying asset to supply
     */
    function _mintFresh(
        address payer,
        address minter,
        uint256 mintAmount
    ) internal {
        /* Fail if mint not allowed */
        comptroller.preMintHook(address(this), minter, mintAmount);

        /* Verify market's block number equals current block number */
        if (accrualBlockNumber != _getBlockNumber()) {
            revert MintFreshnessCheck();
        }

        Exp memory exchangeRate = Exp({ mantissa: _exchangeRateStored() });

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /*
         *  We call `_doTransferIn` for the minter and the mintAmount.
         *  Note: The vToken must handle variations between ERC-20 and ETH underlying.
         *  `_doTransferIn` reverts if anything goes wrong, since we can't be sure if
         *  side-effects occurred. The function returns the amount actually transferred,
         *  in case of a fee. On success, the vToken holds an additional `actualMintAmount`
         *  of cash.
         */
        uint256 actualMintAmount = _doTransferIn(payer, mintAmount);

        /*
         * We get the current exchange rate and calculate the number of vTokens to be minted:
         *  mintTokens = actualMintAmount / exchangeRate
         */

        uint256 mintTokens = div_(actualMintAmount, exchangeRate);

        /*
         * We calculate the new total supply of vTokens and minter token balance, checking for overflow:
         *  totalSupplyNew = totalSupply + mintTokens
         *  accountTokensNew = accountTokens[minter] + mintTokens
         * And write them into storage
         */
        totalSupply = totalSupply + mintTokens;
        accountTokens[minter] = accountTokens[minter] + mintTokens;

        /* We emit a Mint event, and a Transfer event */
        emit Mint(minter, actualMintAmount, mintTokens);
        emit Transfer(address(this), minter, mintTokens);
    }

    /**
     * @notice Sender redeems vTokens in exchange for the underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemTokens The number of vTokens to redeem into underlying
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits Redeem and Transfer events; may emit AccrueInterest
     * @custom:error RedeemTransferOutNotPossible is thrown when the protocol has insufficient cash
     * @custom:access Not restricted
     */
    function redeem(uint256 redeemTokens) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _redeemFresh emits redeem-specific logs on errors, so we don't need to
        _redeemFresh(payable(msg.sender), redeemTokens, 0);
        return NO_ERROR;
    }

    /**
     * @notice Sender redeems vTokens in exchange for a specified amount of underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemAmount The amount of underlying to receive from redeeming vTokens
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     */
    function redeemUnderlying(uint256 redeemAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _redeemFresh emits redeem-specific logs on errors, so we don't need to
        _redeemFresh(payable(msg.sender), 0, redeemAmount);
        return NO_ERROR;
    }

    /**
     * @notice User redeems vTokens in exchange for the underlying asset
     * @dev Assumes interest has already been accrued up to the current block
     * @param redeemer The address of the account which is redeeming the tokens
     * @param redeemTokensIn The number of vTokens to redeem into underlying (only one of redeemTokensIn or redeemAmountIn may be non-zero)
     * @param redeemAmountIn The number of underlying tokens to receive from redeeming vTokens (only one of redeemTokensIn or redeemAmountIn may be non-zero)
     */
    function _redeemFresh(
        address payable redeemer,
        uint256 redeemTokensIn,
        uint256 redeemAmountIn
    ) internal {
        require(redeemTokensIn == 0 || redeemAmountIn == 0, "one of redeemTokensIn or redeemAmountIn must be zero");

        /* Verify market's block number equals current block number */
        if (accrualBlockNumber != _getBlockNumber()) {
            revert RedeemFreshnessCheck();
        }

        /* exchangeRate = invoke Exchange Rate Stored() */
        Exp memory exchangeRate = Exp({ mantissa: _exchangeRateStored() });

        uint256 redeemTokens;
        uint256 redeemAmount;
        /* If redeemTokensIn > 0: */
        if (redeemTokensIn > 0) {
            /*
             * We calculate the exchange rate and the amount of underlying to be redeemed:
             *  redeemTokens = redeemTokensIn
             *  redeemAmount = redeemTokensIn x exchangeRateCurrent
             */
            redeemTokens = redeemTokensIn;
            redeemAmount = mul_ScalarTruncate(exchangeRate, redeemTokensIn);
        } else {
            /*
             * We get the current exchange rate and calculate the amount to be redeemed:
             *  redeemTokens = redeemAmountIn / exchangeRate
             *  redeemAmount = redeemAmountIn
             */
            redeemTokens = div_(redeemAmountIn, exchangeRate);
            redeemAmount = redeemAmountIn;
        }

        // Require tokens is zero or amount is also zero
        if (redeemTokens == 0 && redeemAmount > 0) {
            revert("redeemTokens zero");
        }

        /* Fail if redeem not allowed */
        comptroller.preRedeemHook(address(this), redeemer, redeemTokens);

        /* Fail gracefully if protocol has insufficient cash */
        if (_getCashPrior() < redeemAmount) {
            revert RedeemTransferOutNotPossible();
        }

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /*
         * We write the previously calculated values into storage.
         *  Note: Avoid token reentrancy attacks by writing reduced supply before external transfer.
         */
        totalSupply = totalSupply - redeemTokens;
        accountTokens[redeemer] = accountTokens[redeemer] - redeemTokens;

        /*
         * We invoke _doTransferOut for the redeemer and the redeemAmount.
         *  Note: The vToken must handle variations between ERC-20 and ETH underlying.
         *  On success, the vToken has redeemAmount less of cash.
         *  _doTransferOut reverts if anything goes wrong, since we can't be sure if side effects occurred.
         */
        _doTransferOut(redeemer, redeemAmount);

        /* We emit a Transfer event, and a Redeem event */
        emit Transfer(redeemer, address(this), redeemTokens);
        emit Redeem(redeemer, redeemAmount, redeemTokens);
    }

    /**
     * @notice Sender borrows assets from the protocol to their own address
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits Borrow event; may emit AccrueInterest
     * @custom:error BorrowCashNotAvailable is thrown when the protocol has insufficient cash
     * @custom:access Not restricted
     */
    function borrow(uint256 borrowAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // borrowFresh emits borrow-specific logs on errors, so we don't need to
        _borrowFresh(payable(msg.sender), borrowAmount, InterestRateMode.VARIABLE);
        return NO_ERROR;
    }

    function borrowStable(uint256 borrowAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // borrowFresh emits borrow-specific logs on errors, so we don't need to
        _borrowFresh(payable(msg.sender), borrowAmount, InterestRateMode.STABLE);
        return NO_ERROR;
    }

    /**
     * @notice Users borrow assets from the protocol to their own address
     * @param borrower Address of the borrower
     * @param borrowAmount The amount of the underlying asset to borrow
     * @param interestRateMode The interest rate mode at which the user wants to borrow: 1 for Stable, 2 for Variable
     */
    function _borrowFresh(
        address payable borrower,
        uint256 borrowAmount,
        InterestRateMode interestRateMode
    ) internal {
        /* Fail if borrow not allowed */
        comptroller.preBorrowHook(address(this), borrower, borrowAmount);

        /* Verify market's block number equals current block number */
        if (accrualBlockNumber != _getBlockNumber()) {
            revert BorrowFreshnessCheck();
        }

        /* Fail gracefully if protocol has insufficient underlying cash */
        if (_getCashPrior() < borrowAmount) {
            revert BorrowCashNotAvailable();
        }

        uint256 totalBorrowsNew;
        uint256 accountBorrowsNew;
        if (InterestRateMode(interestRateMode) == InterestRateMode.STABLE) {
            /*
             * We calculate the new borrower and total borrow balances, failing on overflow:
             *  accountBorrowNew = accountStableBorrow + borrowAmount
             *  totalBorrowsNew = totalBorrows + borrowAmount
             */
            uint256 accountBorrowsPrev = _updateUserStableBorrowBalance(borrower);
            accountBorrowsNew = accountBorrowsPrev + borrowAmount;
            totalBorrowsNew = totalBorrows + borrowAmount;

            /**
             * Calculte the average stable borrow rate for the total stable borrows
             */
            uint256 stableBorrowsNew = stableBorrows + borrowAmount;
            uint256 stableBorrowRate = stableBorrowRatePerBlock();
            uint256 averageStableBorrowRateNew = ((stableBorrows * averageStableBorrowRate) +
                (borrowAmount * stableBorrowRate)) / stableBorrowsNew;

            uint256 stableRateMantissaNew = ((accountBorrowsPrev * accountStableBorrows[borrower].stableRateMantissa) +
                (borrowAmount * stableBorrowRate)) / accountBorrowsNew;

            /////////////////////////
            // EFFECTS & INTERACTIONS
            // (No safe failures beyond this point)

            /*
             * We write the previously calculated values into storage.
             *  Note: Avoid token reentrancy attacks by writing increased borrow before external transfer.
             */

            accountStableBorrows[borrower].principal = accountBorrowsNew;
            accountStableBorrows[borrower].interestIndex = stableBorrowIndex;
            accountStableBorrows[borrower].stableRateMantissa = stableRateMantissaNew;
            stableBorrows = stableBorrowsNew;
            averageStableBorrowRate = averageStableBorrowRateNew;
        } else {
            /*
             * We calculate the new borrower and total borrow balances, failing on overflow:
             *  accountBorrowNew = accountBorrow + borrowAmount
             *  totalBorrowsNew = totalBorrows + borrowAmount
             */
            uint256 accountBorrowsPrev = _borrowBalanceStored(borrower);
            accountBorrowsNew = accountBorrowsPrev + borrowAmount;
            totalBorrowsNew = totalBorrows + borrowAmount;

            /////////////////////////
            // EFFECTS & INTERACTIONS
            // (No safe failures beyond this point)

            /*
             * We write the previously calculated values into storage.
             *  Note: Avoid token reentrancy attacks by writing increased borrow before external transfer.
             */
            accountBorrows[borrower].principal = accountBorrowsNew;
            accountBorrows[borrower].interestIndex = borrowIndex;
        }

        totalBorrows = totalBorrowsNew;

        /*
         * We invoke _doTransferOut for the borrower and the borrowAmount.
         *  Note: The vToken must handle variations between ERC-20 and ETH underlying.
         *  On success, the vToken borrowAmount less of cash.
         *  _doTransferOut reverts if anything goes wrong, since we can't be sure if side effects occurred.
         */
        _doTransferOut(borrower, borrowAmount);

        /* We emit a Borrow event */
        emit Borrow(borrower, borrowAmount, accountBorrowsNew, totalBorrowsNew);
    }

    /**
     * @notice Sender repays their own borrow
     * @param repayAmount The amount to repay, or -1 for the full outstanding amount
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits RepayBorrow event; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function repayBorrow(uint256 repayAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _repayBorrowFresh emits repay-borrow-specific logs on errors, so we don't need to
        _repayBorrowFresh(msg.sender, msg.sender, repayAmount, InterestRateMode.VARIABLE);
        return NO_ERROR;
    }

    /**
     * @notice Sender repays their own borrow
     * @param repayAmount The amount to repay, or -1 for the full outstanding amount
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits RepayBorrow event; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function repayBorrowStable(uint256 repayAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _repayBorrowFresh emits repay-borrow-specific logs on errors, so we don't need to
        _repayBorrowFresh(msg.sender, msg.sender, repayAmount, InterestRateMode.STABLE);
        return NO_ERROR;
    }

    /**
     * @notice Sender repays a borrow belonging to borrower
     * @param borrower the account with the debt being payed off
     * @param repayAmount The amount to repay, or -1 for the full outstanding amount
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits RepayBorrow event; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external override nonReentrant returns (uint256) {
        accrueInterest();
        // _repayBorrowFresh emits repay-borrow-specific logs on errors, so we don't need to
        _repayBorrowFresh(msg.sender, borrower, repayAmount, InterestRateMode.VARIABLE);
        return NO_ERROR;
    }

    /**
     * @notice Sender repays a borrow belonging to borrower
     * @param borrower the account with the debt being payed off
     * @param repayAmount The amount to repay, or -1 for the full outstanding amount
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits RepayBorrow event; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function repayBorrowStableBehalf(address borrower, uint256 repayAmount)
        external
        override
        nonReentrant
        returns (uint256)
    {
        accrueInterest();
        // _repayBorrowFresh emits repay-borrow-specific logs on errors, so we don't need to
        _repayBorrowFresh(msg.sender, borrower, repayAmount, InterestRateMode.STABLE);
        return NO_ERROR;
    }

    /**
     * @notice Borrows are repaid by another user (possibly the borrower).
     * @param payer the account paying off the borrow
     * @param borrower the account with the debt being payed off
     * @param repayAmount the amount of underlying tokens being returned, or -1 for the full outstanding amount
     * @param interestRateMode The interest rate mode of the debt the user wants to repay: 1 for Stable, 2 for Variable
     * @return (uint) the actual repayment amount.
     */
    function _repayBorrowFresh(
        address payer,
        address borrower,
        uint256 repayAmount,
        InterestRateMode interestRateMode
    ) internal returns (uint256) {
        /* Fail if repayBorrow not allowed */
        comptroller.preRepayHook(address(this), payer, borrower, repayAmount);

        /* Verify market's block number equals current block number */
        if (accrualBlockNumber != _getBlockNumber()) {
            revert RepayBorrowFreshnessCheck();
        }

        uint256 accountBorrowsPrev;
        if (InterestRateMode(interestRateMode) == InterestRateMode.STABLE) {
            accountBorrowsPrev = _updateUserStableBorrowBalance(borrower);
        } else {
            /* We fetch the amount the borrower owes, with accumulated interest */
            accountBorrowsPrev = _borrowBalanceStored(borrower);
        }

        if (accountBorrowsPrev == 0) {
            return 0;
        }

        /* If repayAmount == -1, repayAmount = accountBorrows */
        uint256 repayAmountFinal = repayAmount == type(uint256).max ? accountBorrowsPrev : repayAmount;

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /*
         * We call _doTransferIn for the payer and the repayAmount
         *  Note: The vToken must handle variations between ERC-20 and ETH underlying.
         *  On success, the vToken holds an additional repayAmount of cash.
         *  _doTransferIn reverts if anything goes wrong, since we can't be sure if side effects occurred.
         *   it returns the amount actually transferred, in case of a fee.
         */
        uint256 actualRepayAmount = _doTransferIn(payer, repayAmountFinal);

        /*
         * We calculate the new borrower and total borrow balances, failing on underflow:
         *  accountBorrowsNew = accountBorrows - actualRepayAmount
         *  totalBorrowsNew = totalBorrows - actualRepayAmount
         */
        uint256 accountBorrowsNew = accountBorrowsPrev - actualRepayAmount;
        uint256 totalBorrowsNew = totalBorrows - actualRepayAmount;

        if (InterestRateMode(interestRateMode) == InterestRateMode.STABLE) {
            uint256 stableBorrowsNew = stableBorrows - actualRepayAmount;

            uint256 averageStableBorrowRateNew;
            if (stableBorrowsNew == 0) {
                averageStableBorrowRateNew = 0;
            } else {
                uint256 stableRateMantissa = accountStableBorrows[borrower].stableRateMantissa;

                unchecked {
                    averageStableBorrowRateNew =
                        ((stableBorrows * averageStableBorrowRate) - (actualRepayAmount * stableRateMantissa)) /
                        stableBorrowsNew;
                }
            }

            accountStableBorrows[borrower].principal = accountBorrowsNew;
            accountStableBorrows[borrower].interestIndex = stableBorrowIndex;

            stableBorrows = stableBorrowsNew;
            averageStableBorrowRate = averageStableBorrowRateNew;
        } else {
            accountBorrows[borrower].principal = accountBorrowsNew;
            accountBorrows[borrower].interestIndex = borrowIndex;
        }
        totalBorrows = totalBorrowsNew;

        /* We emit a RepayBorrow event */
        emit RepayBorrow(payer, borrower, actualRepayAmount, accountBorrowsNew, totalBorrowsNew);

        return actualRepayAmount;
    }

    /**
     * @notice Checks before swapping borrow rate mode
     * @param account Address of the borrow holder
     * @return (uint256, uint256) returns the variableDebt and stableDebt for the account
     */
    function _swapBorrowRateModePreCalculation(address account) internal returns (uint256, uint256) {
        /* Fail if swapBorrowRateMode not allowed */
        comptroller.preSwapBorrowRateModeHook(address(this));

        accrueInterest();

        /* Verify market's block number equals current block number */
        if (accrualBlockNumber != _getBlockNumber()) {
            revert SwapBorrowRateModeFreshnessCheck();
        }

        uint256 variableDebt = _borrowBalanceStored(account);
        uint256 stableDebt = _updateUserStableBorrowBalance(account);

        return (variableDebt, stableDebt);
    }

    /**
     * @notice Update states for the stable borrow while swapping
     * @param swappedAmount Amount need to be swapped
     * @param stableDebt Stable debt for the account
     * @param variableDebt Variable debt for the account
     * @param account Address of the account
     * @param accountBorrowsNew New stable borrow for the account
     * @return (uint256, uint256) returns updated stable borrow for the account and updated average stable borrow rate
     */
    function _updateStatesForStableRateSwap(
        uint256 swappedAmount,
        uint256 stableDebt,
        uint256 variableDebt,
        address account,
        uint256 accountBorrowsNew
    ) internal returns (uint256, uint256) {
        uint256 stableBorrowsNew = stableBorrows + swappedAmount;
        uint256 stableBorrowRate = stableBorrowRatePerBlock();

        uint256 averageStableBorrowRateNew = ((stableBorrows * averageStableBorrowRate) +
            (swappedAmount * stableBorrowRate)) / stableBorrowsNew;

        uint256 stableRateMantissaNew = ((stableDebt * accountStableBorrows[account].stableRateMantissa) +
            (swappedAmount * stableBorrowRate)) / accountBorrowsNew;

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        accountStableBorrows[account].principal = accountBorrowsNew;
        accountStableBorrows[account].interestIndex = stableBorrowIndex;
        accountStableBorrows[account].stableRateMantissa = stableRateMantissaNew;

        accountBorrows[account].principal = variableDebt - swappedAmount;
        accountBorrows[account].interestIndex = borrowIndex;

        return (stableBorrowsNew, averageStableBorrowRateNew);
    }

    /**
     * @notice Update states for the variable borrow during the swap
     * @param swappedAmount Amount need to be swapped
     * @param stableDebt Stable debt for the account
     * @param variableDebt Variable debt for the account
     * @param account Address of the account
     * @return (uint256, uint256) returns updated stable borrow for the account and updated average stable borrow rate
     */
    function _updateStatesForVariableRateSwap(
        uint256 swappedAmount,
        uint256 stableDebt,
        uint256 variableDebt,
        address account
    ) internal returns (uint256, uint256) {
        uint256 newStableDebt = stableDebt - swappedAmount;
        uint256 stableBorrowsNew = stableBorrows - swappedAmount;

        uint256 stableRateMantissa = accountStableBorrows[account].stableRateMantissa;
        uint256 averageStableBorrowRateNew;
        if (stableBorrowsNew == 0) {
            averageStableBorrowRateNew = 0;
        } else {
            unchecked {
                averageStableBorrowRateNew =
                    ((stableBorrows * averageStableBorrowRate) - (swappedAmount * stableRateMantissa)) /
                    stableBorrowsNew;
            }
        }

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)
        accountBorrows[account].principal = variableDebt + swappedAmount;
        accountBorrows[account].interestIndex = borrowIndex;

        accountStableBorrows[account].principal = newStableDebt;
        accountStableBorrows[account].interestIndex = stableBorrowIndex;

        return (stableBorrowsNew, averageStableBorrowRateNew);
    }

    /**
     * @dev Allows a borrower to swap his debt between stable and variable mode, or vice versa with specific amount
     * @param rateMode The rate mode that the user wants to swap to
     * @param sentAmount The amount that the user wants to convert form stable to variable mode or vice versa.
     * @custom:access Not restricted
     **/
    function swapBorrowRateModeWithAmount(uint256 rateMode, uint256 sentAmount) external {
        address account = msg.sender;
        (uint256 variableDebt, uint256 stableDebt) = _swapBorrowRateModePreCalculation(account);

        uint256 stableBorrowsNew;
        uint256 averageStableBorrowRateNew;
        uint256 swappedAmount;

        if (InterestRateMode(rateMode) == InterestRateMode.STABLE) {
            require(variableDebt > 0, "vToken: swapBorrowRateMode variable debt is 0");

            swappedAmount = sentAmount > variableDebt ? variableDebt : sentAmount;
            uint256 accountBorrowsNew = stableDebt + swappedAmount;

            (stableBorrowsNew, averageStableBorrowRateNew) = _updateStatesForStableRateSwap(
                swappedAmount,
                stableDebt,
                variableDebt,
                account,
                accountBorrowsNew
            );
        } else {
            require(stableDebt > 0, "vToken: swapBorrowRateMode stable debt is 0");

            swappedAmount = sentAmount > stableDebt ? stableDebt : sentAmount;

            (stableBorrowsNew, averageStableBorrowRateNew) = _updateStatesForVariableRateSwap(
                swappedAmount,
                stableDebt,
                variableDebt,
                account
            );
        }

        stableBorrows = stableBorrowsNew;
        averageStableBorrowRate = averageStableBorrowRateNew;

        emit SwapBorrowRateMode(account, rateMode, swappedAmount);
    }

    /**
     * @notice The sender liquidates the borrowers collateral.
     *  The collateral seized is transferred to the liquidator.
     * @param borrower The borrower of this vToken to be liquidated
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @return error Always NO_ERROR for compatilibily with Venus core tooling
     * @custom:events Emits LiquidateBorrow event; may emit AccrueInterest
     * @custom:error LiquidateAccrueCollateralInterestFailed is thrown when it is not possible to accrue interest on the collateral vToken
     * @custom:error LiquidateCollateralFreshnessCheck is thrown when interest has not been accrued on the collateral vToken
     * @custom:error LiquidateLiquidatorIsBorrower is thrown when trying to liquidate self
     * @custom:error LiquidateCloseAmountIsZero is thrown when repayment amount is zero
     * @custom:error LiquidateCloseAmountIsUintMax is thrown when repayment amount is UINT_MAX
     * @custom:access Not restricted
     */
    function liquidateBorrow(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) external override returns (uint256) {
        _liquidateBorrow(msg.sender, borrower, repayAmount, vTokenCollateral, false);
        return NO_ERROR;
    }

    /**
     * @notice The sender liquidates the borrowers collateral.
     *  The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the borrow and seizing collateral
     * @param borrower The borrower of this vToken to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @param skipLiquidityCheck If set to true, allows to liquidate up to 100% of the borrow
     *   regardless of the account liquidity
     */
    function _liquidateBorrow(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
        bool skipLiquidityCheck
    ) internal nonReentrant {
        accrueInterest();

        uint256 error = vTokenCollateral.accrueInterest();
        if (error != NO_ERROR) {
            // accrueInterest emits logs on errors, but we still want to log the fact that an attempted liquidation failed
            revert LiquidateAccrueCollateralInterestFailed(error);
        }

        // _liquidateBorrowFresh emits borrow-specific logs on errors, so we don't need to
        _liquidateBorrowFresh(liquidator, borrower, repayAmount, vTokenCollateral, skipLiquidityCheck);
    }

    /**
     * @notice The liquidator liquidates the borrowers collateral.
     *  The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the borrow and seizing collateral
     * @param borrower The borrower of this vToken to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @param skipLiquidityCheck If set to true, allows to liquidate up to 100% of the borrow
     *   regardless of the account liquidity
     */
    function _liquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
        bool skipLiquidityCheck
    ) internal {
        /* Fail if liquidate not allowed */
        comptroller.preLiquidateHook(
            liquidator,
            address(vTokenCollateral),
            liquidator,
            borrower,
            repayAmount,
            skipLiquidityCheck
        );

        /* Verify market's block number equals current block number */
        if (accrualBlockNumber != _getBlockNumber()) {
            revert LiquidateFreshnessCheck();
        }

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

        /* Fail if repayBorrow fails */
        // Repay for both types of interest rate: stable and variable
        uint256 actualRepayAmount = _repayBorrowFresh(liquidator, borrower, repayAmount, InterestRateMode.STABLE) +
            _repayBorrowFresh(liquidator, borrower, repayAmount, InterestRateMode.VARIABLE);

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /* We calculate the number of collateral tokens that will be seized */
        (uint256 amountSeizeError, uint256 seizeTokens) = comptroller.liquidateCalculateSeizeTokens(
            address(this),
            address(vTokenCollateral),
            actualRepayAmount
        );
        require(amountSeizeError == NO_ERROR, "LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED");

        /* Revert if borrower collateral token balance < seizeTokens */
        require(vTokenCollateral.balanceOf(borrower) >= seizeTokens, "LIQUIDATE_SEIZE_TOO_MUCH");

        // If this is also the collateral, call _seize internally to avoid re-entrancy, otherwise make an external call
        if (address(vTokenCollateral) == address(this)) {
            _seize(address(this), liquidator, borrower, seizeTokens);
        } else {
            vTokenCollateral.seize(liquidator, borrower, seizeTokens);
        }

        /* We emit a LiquidateBorrow event */
        emit LiquidateBorrow(liquidator, borrower, actualRepayAmount, address(vTokenCollateral), seizeTokens);
    }

    /**
     * @notice Repays a certain amount of debt, treats the rest of the borrow as bad debt, essentially
     *   "forgiving" the borrower. Healing is a situation that should rarely happen. However, some pools
     *   may list risky assets or be configured improperly – we want to still handle such cases gracefully.
     *   We assume that Comptroller does the seizing, so this function is only available to Comptroller.
     * @dev This function does not call any Comptroller hooks (like "healAllowed"), because we assume
     *   the Comptroller does all the necessary checks before calling this function.
     * @param payer account who repays the debt
     * @param borrower account to heal
     * @param repayAmount amount to repay
     * @custom:events Emits RepayBorrow, BadDebtIncreased events; may emit AccrueInterest
     * @custom:error HealBorrowUnauthorized is thrown when the request does not come from Comptroller
     * @custom:access Only Comptroller
     */
    function healBorrow(
        address payer,
        address borrower,
        uint256 repayAmount
    ) external override nonReentrant {
        if (msg.sender != address(comptroller)) {
            revert HealBorrowUnauthorized();
        }

        accrueInterest();
        uint256 accountBorrowsPrev = _borrowBalanceStored(borrower) + _updateUserStableBorrowBalance(borrower);
        uint256 totalBorrowsNew = totalBorrows;

        uint256 actualRepayAmount;
        if (repayAmount != 0) {
            // _doTransferIn reverts if anything goes wrong, since we can't be sure if side effects occurred.
            // We violate checks-effects-interactions here to account for tokens that take transfer fees
            actualRepayAmount = _doTransferIn(payer, repayAmount);
            totalBorrowsNew = totalBorrowsNew - actualRepayAmount;
            emit RepayBorrow(payer, borrower, actualRepayAmount, 0, totalBorrowsNew);
        }

        // The transaction will fail if trying to repay too much
        uint256 badDebtDelta = accountBorrowsPrev - actualRepayAmount;
        if (badDebtDelta != 0) {
            uint256 badDebtOld = badDebt;
            uint256 badDebtNew = badDebtOld + badDebtDelta;
            totalBorrowsNew = totalBorrowsNew - badDebtDelta;
            badDebt = badDebtNew;

            // We treat healing as "repayment", where vToken is the payer
            emit RepayBorrow(address(this), borrower, badDebtDelta, accountBorrowsPrev - badDebtDelta, totalBorrowsNew);
            emit BadDebtIncreased(borrower, badDebtDelta, badDebtOld, badDebtNew);
        }

        // states for variable rate borrowing
        accountBorrows[borrower].principal = 0;
        accountBorrows[borrower].interestIndex = borrowIndex;
        totalBorrows = totalBorrowsNew;

        // states for stable rate borrowing
        accountStableBorrows[borrower].principal = 0;
        accountStableBorrows[borrower].interestIndex = stableBorrowIndex;
        accountStableBorrows[borrower].lastBlockAccrued = _getBlockNumber();
    }

    /**
     * @notice The extended version of liquidations, callable only by Comptroller. May skip
     *  the close factor check. The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the borrow and seizing collateral
     * @param borrower The borrower of this vToken to be liquidated
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param skipLiquidityCheck If set to true, allows to liquidate up to 100% of the borrow
     *   regardless of the account liquidity
     * @custom:events Emits LiquidateBorrow event; may emit AccrueInterest
     * @custom:error ForceLiquidateBorrowUnauthorized is thrown when the request does not come from Comptroller
     * @custom:error LiquidateAccrueCollateralInterestFailed is thrown when it is not possible to accrue interest on the collateral vToken
     * @custom:error LiquidateCollateralFreshnessCheck is thrown when interest has not been accrued on the collateral vToken
     * @custom:error LiquidateLiquidatorIsBorrower is thrown when trying to liquidate self
     * @custom:error LiquidateCloseAmountIsZero is thrown when repayment amount is zero
     * @custom:error LiquidateCloseAmountIsUintMax is thrown when repayment amount is UINT_MAX
     * @custom:access Only Comptroller
     */
    function forceLiquidateBorrow(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
        bool skipLiquidityCheck
    ) external override {
        if (msg.sender != address(comptroller)) {
            revert ForceLiquidateBorrowUnauthorized();
        }
        _liquidateBorrow(liquidator, borrower, repayAmount, vTokenCollateral, skipLiquidityCheck);
    }

    /**
     * @notice Transfers collateral tokens (this market) to the liquidator.
     * @dev Will fail unless called by another vToken during the process of liquidation.
     *  Its absolutely critical to use msg.sender as the borrowed vToken and not a parameter.
     * @param liquidator The account receiving seized collateral
     * @param borrower The account having collateral seized
     * @param seizeTokens The number of vTokens to seize
     * @custom:events Emits Transfer, ReservesAdded events
     * @custom:error LiquidateSeizeLiquidatorIsBorrower is thrown when trying to liquidate self
     * @custom:access Not restricted
     */
    function seize(
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external override nonReentrant {
        _seize(msg.sender, liquidator, borrower, seizeTokens);
    }

    /**
     * @notice Transfers collateral tokens (this market) to the liquidator.
     * @dev Called only during an in-kind liquidation, or by liquidateBorrow during the liquidation of another VToken.
     *  Its absolutely critical to use msg.sender as the seizer vToken and not a parameter.
     * @param seizerContract The contract seizing the collateral (either borrowed vToken or Comptroller)
     * @param liquidator The account receiving seized collateral
     * @param borrower The account having collateral seized
     * @param seizeTokens The number of vTokens to seize
     */
    function _seize(
        address seizerContract,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) internal {
        /* Fail if seize not allowed */
        comptroller.preSeizeHook(address(this), seizerContract, liquidator, borrower, seizeTokens);

        /* Fail if borrower = liquidator */
        if (borrower == liquidator) {
            revert LiquidateSeizeLiquidatorIsBorrower();
        }

        /*
         * We calculate the new borrower and liquidator token balances, failing on underflow/overflow:
         *  borrowerTokensNew = accountTokens[borrower] - seizeTokens
         *  liquidatorTokensNew = accountTokens[liquidator] + seizeTokens
         */
        uint256 protocolSeizeTokens = mul_(seizeTokens, Exp({ mantissa: protocolSeizeShareMantissa }));
        uint256 liquidatorSeizeTokens = seizeTokens - protocolSeizeTokens;
        Exp memory exchangeRate = Exp({ mantissa: _exchangeRateStored() });
        uint256 protocolSeizeAmount = mul_ScalarTruncate(exchangeRate, protocolSeizeTokens);
        uint256 totalReservesNew = totalReserves + protocolSeizeAmount;

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /* We write the calculated values into storage */
        totalReserves = totalReservesNew;
        totalSupply = totalSupply - protocolSeizeTokens;
        accountTokens[borrower] = accountTokens[borrower] - seizeTokens;
        accountTokens[liquidator] = accountTokens[liquidator] + liquidatorSeizeTokens;

        /* Emit a Transfer event */
        emit Transfer(borrower, liquidator, liquidatorSeizeTokens);
        emit Transfer(borrower, address(this), protocolSeizeTokens);
        emit ReservesAdded(address(this), protocolSeizeAmount, totalReservesNew);
    }

    /**
     * @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market (currently unused)
     * @return The utilization rate as a mantissa between [0, BASE]
     */
    function utilizationRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves
    ) public pure override returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (borrows == 0) {
            return 0;
        }

        return (borrows * mantissaOne) / (cash + borrows - reserves);
    }

    /**
     * @notice Rebalances the stable interest rate of a user to the current stable borrow rate.
     * - Users can be rebalanced if the following conditions are satisfied:
     *     1. Utilization rate is above rebalanceUtilizationRateThreshold.
     *     2. Average market borrow rate should be less than the rebalanceRateFractionThreshold fraction of variable borrow rate.
     * @param account The address of the account to be rebalanced
     * @custom:events RebalancedStableBorrowRate - Emits after rebalancing the stable borrow rate for the user.
     **/
    function rebalanceStableBorrowRate(address account) external {
        accrueInterest();

        validateRebalanceStableBorrowRate();
        _updateUserStableBorrowBalance(account);

        uint256 stableBorrowRate = stableBorrowRatePerBlock();

        uint256 previousStableRateMantissa = accountStableBorrows[account].stableRateMantissa;
        accountStableBorrows[account].stableRateMantissa = stableBorrowRate;

        emit RebalancedStableBorrowRate(account, previousStableRateMantissa, stableBorrowRate);
    }

    /// Validate the conditions to rebalance the stable borrow rate.
    function validateRebalanceStableBorrowRate() public view {
        require(rebalanceUtilizationRateThreshold > 0, "vToken: rebalanceUtilizationRateThreshold is not set.");
        require(rebalanceRateFractionThreshold > 0, "vToken: rebalanceRateFractionThreshold is not set.");

        uint256 utilRate = utilizationRate(_getCashPrior(), totalBorrows, totalReserves);

        /// Utilization rate is above rebalanceUtilizationRateThreshold.
        require(utilRate >= rebalanceUtilizationRateThreshold, "vToken: low utilization rate for rebalacing.");

        uint256 variableBorrowRate = interestRateModel.getBorrowRate(rebalanceUtilizationRateThreshold);

        /// Average market borrow rate should be less than the rebalanceRateFractionThreshold fraction of
        /// variable borrow rate when utilization rate is rebalanceUtilizationRateThreshold
        require(
            _averageMarketBorrowRate() < (variableBorrowRate * rebalanceRateFractionThreshold),
            "vToken: average borrow rate higher than variable rate threshold."
        );
    }

    /*** Admin Functions ***/

    /**
     * @notice Sets a new comptroller for the market
     * @dev Admin function to set a new comptroller
     * @custom:events Emits NewComptroller event
     * @custom:error SetComptrollerOwnerCheck is thrown when the call is not from owner
     * @custom:access Only Governance
     */
    function setComptroller(ComptrollerInterface newComptroller) public override {
        // Check caller is admin
        if (msg.sender != owner()) {
            revert SetComptrollerOwnerCheck();
        }

        _setComptroller(newComptroller);
    }

    function _setComptroller(ComptrollerInterface newComptroller) internal {
        ComptrollerInterface oldComptroller = comptroller;
        // Ensure invoke comptroller.isComptroller() returns true
        require(newComptroller.isComptroller(), "marker method returned false");

        // Set market's comptroller to newComptroller
        comptroller = newComptroller;

        // Emit NewComptroller(oldComptroller, newComptroller)
        emit NewComptroller(oldComptroller, newComptroller);
    }

    /**
     * @notice sets protocol share accumulated from liquidations
     * @dev must be less than liquidation incentive - 1
     * @param newProtocolSeizeShareMantissa_ new protocol share mantissa
     * @custom:events Emits NewProtocolSeizeShare event on success
     * @custom:error Unauthorized is thrown when the call is not authorized by AccessControlManager
     * @custom:error ProtocolSeizeShareTooBig is thrown when the new seize share is too high
     * @custom:access Controlled by AccessControlManager
     */
    function setProtocolSeizeShare(uint256 newProtocolSeizeShareMantissa_) external {
        _checkAccessAllowed("setProtocolSeizeShare(uint256)");

        uint256 liquidationIncentive = ComptrollerViewInterface(address(comptroller)).liquidationIncentiveMantissa();
        if (newProtocolSeizeShareMantissa_ + 1e18 > liquidationIncentive) {
            revert ProtocolSeizeShareTooBig();
        }

        uint256 oldProtocolSeizeShareMantissa = protocolSeizeShareMantissa;
        protocolSeizeShareMantissa = newProtocolSeizeShareMantissa_;
        emit NewProtocolSeizeShare(oldProtocolSeizeShareMantissa, newProtocolSeizeShareMantissa_);
    }

    /**
     * @notice accrues interest and sets a new reserve factor for the protocol using _setReserveFactorFresh
     * @dev Admin function to accrue interest and set a new reserve factor
     * @custom:events Emits NewReserveFactor event; may emit AccrueInterest
     * @custom:error Unauthorized is thrown when the call is not authorized by AccessControlManager
     * @custom:error SetReserveFactorBoundsCheck is thrown when the new reserve factor is too high
     * @custom:access Controlled by AccessControlManager
     */
    function setReserveFactor(uint256 newReserveFactorMantissa) external override nonReentrant {
        _checkAccessAllowed("setReserveFactor(uint256)");

        accrueInterest();
        _setReserveFactorFresh(newReserveFactorMantissa);
    }

    /**
     * @notice Sets a new reserve factor for the protocol (*requires fresh interest accrual)
     * @dev Admin function to set a new reserve factor
     */
    function _setReserveFactorFresh(uint256 newReserveFactorMantissa) internal {
        // Verify market's block number equals current block number
        if (accrualBlockNumber != _getBlockNumber()) {
            revert SetReserveFactorFreshCheck();
        }

        // Check newReserveFactor ≤ maxReserveFactor
        if (newReserveFactorMantissa > reserveFactorMaxMantissa) {
            revert SetReserveFactorBoundsCheck();
        }

        uint256 oldReserveFactorMantissa = reserveFactorMantissa;
        reserveFactorMantissa = newReserveFactorMantissa;

        emit NewReserveFactor(oldReserveFactorMantissa, newReserveFactorMantissa);
    }

    /**
     * @notice The sender adds to reserves.
     * @param addAmount The amount fo underlying token to add as reserves
     * @custom:events Emits ReservesAdded event; may emit AccrueInterest
     * @custom:access Not restricted
     */
    function addReserves(uint256 addAmount) external override nonReentrant {
        accrueInterest();
        _addReservesFresh(addAmount);
    }

    /**
     * @notice Add reserves by transferring from caller
     * @dev Requires fresh interest accrual
     * @param addAmount Amount of addition to reserves
     * @return actualAddAmount The actual amount added, excluding the potential token fees
     */
    function _addReservesFresh(uint256 addAmount) internal returns (uint256) {
        // totalReserves + actualAddAmount
        uint256 totalReservesNew;
        uint256 actualAddAmount;

        // We fail gracefully unless market's block number equals current block number
        if (accrualBlockNumber != _getBlockNumber()) {
            revert AddReservesFactorFreshCheck(actualAddAmount);
        }

        actualAddAmount = _doTransferIn(msg.sender, addAmount);
        totalReservesNew = totalReserves + actualAddAmount;
        totalReserves = totalReservesNew;
        emit ReservesAdded(msg.sender, actualAddAmount, totalReservesNew);

        return actualAddAmount;
    }

    /**
     * @notice Accrues interest and reduces reserves by transferring to the protocol reserve contract
     * @param reduceAmount Amount of reduction to reserves
     * @custom:events Emits ReservesReduced event; may emit AccrueInterest
     * @custom:error ReduceReservesCashNotAvailable is thrown when the vToken does not have sufficient cash
     * @custom:error ReduceReservesCashValidation is thrown when trying to withdraw more cash than the reserves have
     * @custom:access Not restricted
     */
    function reduceReserves(uint256 reduceAmount) external override nonReentrant {
        accrueInterest();
        _reduceReservesFresh(reduceAmount);
    }

    /**
     * @notice Reduces reserves by transferring to the protocol reserve contract
     * @dev Requires fresh interest accrual
     * @param reduceAmount Amount of reduction to reserves
     */
    function _reduceReservesFresh(uint256 reduceAmount) internal {
        // totalReserves - reduceAmount
        uint256 totalReservesNew;

        // We fail gracefully unless market's block number equals current block number
        if (accrualBlockNumber != _getBlockNumber()) {
            revert ReduceReservesFreshCheck();
        }

        // Fail gracefully if protocol has insufficient underlying cash
        if (_getCashPrior() < reduceAmount) {
            revert ReduceReservesCashNotAvailable();
        }

        // Check reduceAmount ≤ reserves[n] (totalReserves)
        if (reduceAmount > totalReserves) {
            revert ReduceReservesCashValidation();
        }

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        totalReservesNew = totalReserves - reduceAmount;

        // Store reserves[n+1] = reserves[n] - reduceAmount
        totalReserves = totalReservesNew;

        // _doTransferOut reverts if anything goes wrong, since we can't be sure if side effects occurred.
        // Transferring an underlying asset to the protocolShareReserve contract to channel the funds for different use.
        _doTransferOut(protocolShareReserve, reduceAmount);

        // Update the pool asset's state in the protocol share reserve for the above transfer.
        IProtocolShareReserve(protocolShareReserve).updateAssetsState(address(comptroller), underlying);

        emit ReservesReduced(protocolShareReserve, reduceAmount, totalReservesNew);
    }

    /**
     * @notice accrues interest and updates the interest rate model using _setInterestRateModelFresh
     * @dev Admin function to accrue interest and update the interest rate model
     * @param newInterestRateModel the new interest rate model to use
     * @custom:events Emits NewMarketInterestRateModel event; may emit AccrueInterest
     * @custom:error Unauthorized is thrown when the call is not authorized by AccessControlManager
     * @custom:access Controlled by AccessControlManager
     */
    function setInterestRateModel(InterestRateModel newInterestRateModel) public override {
        _checkAccessAllowed("setInterestRateModel(address)");

        accrueInterest();
        _setInterestRateModelFresh(newInterestRateModel);
    }

    /**
     * @notice updates the interest rate model (*requires fresh interest accrual)
     * @dev Admin function to update the interest rate model
     * @param newInterestRateModel the new interest rate model to use
     */
    function _setInterestRateModelFresh(InterestRateModel newInterestRateModel) internal {
        // Used to store old model for use in the event that is emitted on success
        InterestRateModel oldInterestRateModel;

        // We fail gracefully unless market's block number equals current block number
        if (accrualBlockNumber != _getBlockNumber()) {
            revert SetInterestRateModelFreshCheck();
        }

        // Track the market's current interest rate model
        oldInterestRateModel = interestRateModel;

        // Ensure invoke newInterestRateModel.isInterestRateModel() returns true
        require(newInterestRateModel.isInterestRateModel(), "marker method returned false");

        // Set the interest rate model to newInterestRateModel
        interestRateModel = newInterestRateModel;

        // Emit NewMarketInterestRateModel(oldInterestRateModel, newInterestRateModel)
        emit NewMarketInterestRateModel(oldInterestRateModel, newInterestRateModel);
    }

    /**
     * @notice Accrues interest and updates the stable interest rate model using _setStableInterestRateModelFresh
     * @dev Admin function to accrue interest and update the stable interest rate model
     * @param newStableInterestRateModel The new interest rate model to use
     * @custom:events Emits NewMarketInterestRateModel event; may emit AccrueInterest
     * @custom:events Emits NewMarketStableInterestRateModel, after setting the new stable rate model
     * @custom:access Controlled by AccessControlManager
     */
    function setStableInterestRateModel(StableRateModel newStableInterestRateModel) public override {
        _checkAccessAllowed("setStableInterestRateModel(address)");

        accrueInterest();
        // _setInterestRateModelFresh emits interest-rate-model-update-specific logs on errors, so we don't need to.
        _setStableInterestRateModelFresh(newStableInterestRateModel);
    }

    /**
     * @notice Updates the stable interest rate model (requires fresh interest accrual)
     * @dev Admin function to update the stable interest rate model
     * @param newStableInterestRateModel The new stable interest rate model to use
     */
    function _setStableInterestRateModelFresh(StableRateModel newStableInterestRateModel) internal {
        // Used to store old model for use in the event that is emitted on success
        StableRateModel oldStableInterestRateModel;

        // We fail gracefully unless market's block number equals current block number
        if (accrualBlockNumber != _getBlockNumber()) {
            revert SetStableInterestRateModelFreshCheck();
        }

        // Track the market's current stable interest rate model
        oldStableInterestRateModel = stableRateModel;

        // Ensure invoke newInterestRateModel.isInterestRateModel() returns true
        require(newStableInterestRateModel.isInterestRateModel(), "marker method returned false");

        // Set the interest rate model to newStableInterestRateModel
        stableRateModel = newStableInterestRateModel;

        // Emit NewMarketStableInterestRateModel(oldStableInterestRateModel, newStableInterestRateModel)
        emit NewMarketStableInterestRateModel(oldStableInterestRateModel, newStableInterestRateModel);
    }

    /**
     * @notice Sets the address of AccessControlManager
     * @dev Admin function to set address of AccessControlManager
     * @param newAccessControlManager The new address of the AccessControlManager
     * @custom:events Emits NewAccessControlManager event
     * @custom:access Only Governance
     */
    function setAccessControlAddress(AccessControlManager newAccessControlManager) external {
        require(msg.sender == owner(), "only admin can set ACL address");
        _setAccessControlAddress(newAccessControlManager);
    }

    /**
     * @notice Sets the address of AccessControlManager
     * @dev Internal function to set address of AccessControlManager
     * @param newAccessControlManager The new address of the AccessControlManager
     */
    function _setAccessControlAddress(AccessControlManager newAccessControlManager) internal {
        AccessControlManager oldAccessControlManager = accessControlManager;
        accessControlManager = newAccessControlManager;
        emit NewAccessControlManager(oldAccessControlManager, accessControlManager);
    }

    /**
     * @notice Sets the utilization threshold for stable rate rebalancing
     * @param utilizationRateThreshold The utilization rate threshold
     * @custom:access Controlled by AccessControlManager
     */
    function setRebalanceUtilizationRateThreshold(uint256 utilizationRateThreshold) external {
        _checkAccessAllowed("setRebalanceUtilizationRateThreshold(uint256)");

        uint256 oldThreshold = rebalanceUtilizationRateThreshold;
        rebalanceUtilizationRateThreshold = utilizationRateThreshold;

        emit RebalanceUtilizationRateThresholdUpdated(oldThreshold, rebalanceUtilizationRateThreshold);
    }

    /**
     * @notice Sets the fraction threshold for stable rate rebalancing
     * @param fractionThreshold The fraction threshold for the validation of the stable rate rebalancing
     * @custom:access Controlled by AccessControlManager
     */
    function setRebalanceRateFractionThreshold(uint256 fractionThreshold) external {
        _checkAccessAllowed("setRebalanceRateFractionThreshold(uint256)");

        uint256 oldThreshold = rebalanceRateFractionThreshold;
        rebalanceRateFractionThreshold = fractionThreshold;

        emit RebalanceRateFractionThresholdUpdated(oldThreshold, rebalanceRateFractionThreshold);
    }

    /*** Reentrancy Guard ***/

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }

    /*** Handling Bad Debt and Shortfall ***/

    /**
     * @notice Updates bad debt
     * @dev Called only when bad debt is recovered from auction
     * @param recoveredAmount_ The amount of bad debt recovered
     * @custom:events Emits BadDebtRecovered event
     * @custom:access Only Shortfall contract
     */
    function badDebtRecovered(uint256 recoveredAmount_) external {
        require(msg.sender == shortfall, "only shortfall contract can update bad debt");
        require(recoveredAmount_ <= badDebt, "more than bad debt recovered from auction");

        uint256 badDebtOld = badDebt;
        uint256 badDebtNew = badDebtOld - recoveredAmount_;
        badDebt = badDebtNew;

        emit BadDebtRecovered(badDebtOld, badDebtNew);
    }

    /**
     * @notice A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to admin (timelock)
     * @param token The address of the ERC-20 token to sweep
     * @custom:access Only Governance
     */
    function sweepToken(IERC20Upgradeable token) external override {
        require(msg.sender == owner(), "VToken::sweepToken: only admin can sweep tokens");
        require(address(token) != underlying, "VToken::sweepToken: can not sweep underlying token");
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
    }

    /*** Safe Token ***/

    /**
     * @notice Gets balance of this contract in terms of the underlying
     * @dev This excludes the value of the current message, if any
     * @return The quantity of underlying tokens owned by this contract
     */
    function _getCashPrior() internal view virtual returns (uint256) {
        IERC20Upgradeable token = IERC20Upgradeable(underlying);
        return token.balanceOf(address(this));
    }

    /**
     * @dev Similar to ERC-20 transfer, but handles tokens that have transfer fees.
     *      This function returns the actual amount received,
     *      which may be less than `amount` if there is a fee attached to the transfer.
     */
    function _doTransferIn(address from, uint256 amount) internal virtual returns (uint256) {
        IERC20Upgradeable token = IERC20Upgradeable(underlying);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        // Return the amount that was *actually* transferred
        return balanceAfter - balanceBefore;
    }

    /**
     * @dev Just a regular ERC-20 transfer, reverts on failure
     */
    function _doTransferOut(address payable to, uint256 amount) internal virtual {
        IERC20Upgradeable token = IERC20Upgradeable(underlying);
        token.safeTransfer(to, amount);
    }

    /// @notice Reverts if the call is not allowed by AccessControlManager
    /// @param signature Method signature
    function _checkAccessAllowed(string memory signature) internal view {
        bool isAllowedToCall = AccessControlManager(accessControlManager).isAllowedToCall(msg.sender, signature);

        if (!isAllowedToCall) {
            revert Unauthorized(msg.sender, address(this), signature);
        }
    }
}

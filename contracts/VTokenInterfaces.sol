// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "./ComptrollerInterface.sol";
import "./InterestRateModel.sol";
import "./ErrorReporter.sol";

// solhint-disable-next-line max-states-count
contract VTokenStorage {
    /**
     * @notice Container for borrow balance information
     * @member principal Total balance (with accrued interest), after applying the most recent balance-changing action
     * @member interestIndex Global borrowIndex as of the most recent balance-changing action
     */
    struct BorrowSnapshot {
        uint256 principal;
        uint256 interestIndex;
    }

    /**
     * @dev Guard variable for re-entrancy checks
     */
    bool internal _notEntered;

    /**
     * @notice Underlying asset for this VToken
     */
    address public underlying;

    /**
     * @notice EIP-20 token name for this token
     */
    string public name;

    /**
     * @notice EIP-20 token symbol for this token
     */
    string public symbol;

    /**
     * @notice EIP-20 token decimals for this token
     */
    uint8 public decimals;

    /**
     * @notice Protocol share Reserve contract address
     */
    address payable public protocolShareReserve;

    // Maximum borrow rate that can ever be applied (.0005% / block)
    uint256 internal constant borrowRateMaxMantissa = 0.0005e16;

    // Maximum fraction of interest that can be set aside for reserves
    uint256 internal constant reserveFactorMaxMantissa = 1e18;

    /**
     * @notice Contract which oversees inter-vToken operations
     */
    ComptrollerInterface public comptroller;

    /**
     * @notice Model which tells what the current interest rate should be
     */
    InterestRateModel public interestRateModel;

    // Initial exchange rate used when minting the first VTokens (used when totalSupply = 0)
    uint256 internal initialExchangeRateMantissa;

    /**
     * @notice Fraction of interest currently set aside for reserves
     */
    uint256 public reserveFactorMantissa;

    /**
     * @notice Block number that interest was last accrued at
     */
    uint256 public accrualBlockNumber;

    /**
     * @notice Accumulator of the total earned interest rate since the opening of the market
     */
    uint256 public borrowIndex;

    /**
     * @notice Total amount of outstanding borrows of the underlying in this market
     */
    uint256 public totalBorrows;

    /**
     * @notice Total amount of reserves of the underlying held in this market
     */
    uint256 public totalReserves;

    /**
     * @notice Total number of tokens in circulation
     */
    uint256 public totalSupply;

    /**
     * @notice Total bad debt of the market
     */
    uint256 public badDebt;

    // Official record of token balances for each account
    mapping(address => uint256) internal accountTokens;

    // Approved token transfer amounts on behalf of others
    mapping(address => mapping(address => uint256)) internal transferAllowances;

    // Mapping of account addresses to outstanding borrow balances
    mapping(address => BorrowSnapshot) internal accountBorrows;

    /**
     * @notice Share of seized collateral that is added to reserves
     */
    uint256 public protocolSeizeShareMantissa;

    /**
     * @notice Storage of Shortfall contract address
     */
    address public shortfall;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}

abstract contract VTokenInterface is VTokenStorage {
    struct RiskManagementInit {
        address shortfall;
        address payable protocolShareReserve;
    }

    /**
     * @notice Indicator that this is a VToken contract (for inspection)
     */
    bool public constant isVToken = true;

    /*** Market Events ***/

    /**
     * @notice Event emitted when interest is accrued
     */
    event AccrueInterest(uint256 cashPrior, uint256 interestAccumulated, uint256 borrowIndex, uint256 totalBorrows);

    /**
     * @notice Event emitted when tokens are minted
     */
    event Mint(address indexed minter, uint256 mintAmount, uint256 mintTokens, uint256 accountBalance);

    /**
     * @notice Event emitted when tokens are redeemed
     */
    event Redeem(address indexed redeemer, uint256 redeemAmount, uint256 redeemTokens, uint256 accountBalance);

    /**
     * @notice Event emitted when underlying is borrowed
     */
    event Borrow(address indexed borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows);

    /**
     * @notice Event emitted when a borrow is repaid
     */
    event RepayBorrow(
        address indexed payer,
        address indexed borrower,
        uint256 repayAmount,
        uint256 accountBorrows,
        uint256 totalBorrows
    );

    /**
     * @notice Event emitted when bad debt is accumulated on a market
     * @param borrower borrower to "forgive"
     * @param badDebtDelta amount of new bad debt recorded
     * @param badDebtOld previous bad debt value
     * @param badDebtNew new bad debt value
     */
    event BadDebtIncreased(address indexed borrower, uint256 badDebtDelta, uint256 badDebtOld, uint256 badDebtNew);

    /**
     * @notice Event emitted when bad debt is recovered via an auction
     * @param badDebtOld previous bad debt value
     * @param badDebtNew new bad debt value
     */
    event BadDebtRecovered(uint256 badDebtOld, uint256 badDebtNew);

    /**
     * @notice Event emitted when a borrow is liquidated
     */
    event LiquidateBorrow(
        address indexed liquidator,
        address indexed borrower,
        uint256 repayAmount,
        address indexed vTokenCollateral,
        uint256 seizeTokens
    );

    /*** Admin Events ***/

    /**
     * @notice Event emitted when comptroller is changed
     */
    event NewComptroller(ComptrollerInterface indexed oldComptroller, ComptrollerInterface indexed newComptroller);

    /**
     * @notice Event emitted when shortfall contract address is changed
     */
    event NewShortfallContract(address indexed oldShortfall, address indexed newShortfall);

    /**
     * @notice Event emitted when protocol share reserve contract address is changed
     */
    event NewProtocolShareReserve(address indexed oldProtocolShareReserve, address indexed newProtocolShareReserve);

    /**
     * @notice Event emitted when interestRateModel is changed
     */
    event NewMarketInterestRateModel(
        InterestRateModel indexed oldInterestRateModel,
        InterestRateModel indexed newInterestRateModel
    );

    /**
     * @notice Event emitted when protocol seize share is changed
     */
    event NewProtocolSeizeShare(uint256 oldProtocolSeizeShareMantissa, uint256 newProtocolSeizeShareMantissa);

    /**
     * @notice Event emitted when the reserve factor is changed
     */
    event NewReserveFactor(uint256 oldReserveFactorMantissa, uint256 newReserveFactorMantissa);

    /**
     * @notice Event emitted when the reserves are added
     */
    event ReservesAdded(address indexed benefactor, uint256 addAmount, uint256 newTotalReserves);

    /**
     * @notice Event emitted when the reserves are reduced
     */
    event ReservesReduced(address indexed admin, uint256 reduceAmount, uint256 newTotalReserves);

    /**
     * @notice EIP20 Transfer event
     */
    event Transfer(address indexed from, address indexed to, uint256 amount);

    /**
     * @notice EIP20 Approval event
     */
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /**
     * @notice Event emitted when the healing the borrow
     */
    event HealBorrow(address payer, address borrower, uint256 repayAmount);

    /**
     * @notice Event emitted when tokens are swept
     */
    event SweepToken(address token);

    /*** User Interface ***/

    function mint(uint256 mintAmount) external virtual returns (uint256);

    function mintBehalf(address minter, uint256 mintAllowed) external virtual returns (uint256);

    function redeem(uint256 redeemTokens) external virtual returns (uint256);

    function redeemUnderlying(uint256 redeemAmount) external virtual returns (uint256);

    function borrow(uint256 borrowAmount) external virtual returns (uint256);

    function repayBorrow(uint256 repayAmount) external virtual returns (uint256);

    function repayBorrowBehalf(address borrower, uint256 repayAmount) external virtual returns (uint256);

    function liquidateBorrow(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) external virtual returns (uint256);

    function healBorrow(
        address payer,
        address borrower,
        uint256 repayAmount
    ) external virtual;

    function forceLiquidateBorrow(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
        bool skipCloseFactorCheck
    ) external virtual;

    function seize(
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external virtual;

    function transfer(address dst, uint256 amount) external virtual returns (bool);

    function transferFrom(
        address src,
        address dst,
        uint256 amount
    ) external virtual returns (bool);

    function accrueInterest() external virtual returns (uint256);

    function sweepToken(IERC20Upgradeable token) external virtual;

    /*** Admin Functions ***/

    function setReserveFactor(uint256 newReserveFactorMantissa) external virtual;

    function reduceReserves(uint256 reduceAmount) external virtual;

    function exchangeRateCurrent() external virtual returns (uint256);

    function borrowBalanceCurrent(address account) external virtual returns (uint256);

    function setInterestRateModel(InterestRateModel newInterestRateModel) external virtual;

    function addReserves(uint256 addAmount) external virtual;

    function totalBorrowsCurrent() external virtual returns (uint256);

    function balanceOfUnderlying(address owner) external virtual returns (uint256);

    function approve(address spender, uint256 amount) external virtual returns (bool);

    function allowance(address owner, address spender) external view virtual returns (uint256);

    function balanceOf(address owner) external view virtual returns (uint256);

    function getAccountSnapshot(address account)
        external
        view
        virtual
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function borrowRatePerBlock() external view virtual returns (uint256);

    function supplyRatePerBlock() external view virtual returns (uint256);

    function borrowBalanceStored(address account) external view virtual returns (uint256);

    function exchangeRateStored() external view virtual returns (uint256);

    function getCash() external view virtual returns (uint256);
}

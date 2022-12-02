// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../VToken.sol";
import "../Governance/AccessControlManager.sol";
import "./ComptrollerScenario.sol";

contract VTokenHarness is VToken {
    uint256 public blockNumber = 100000;
    uint256 public harnessExchangeRate;
    bool public harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        AccessControlManager accessControlManager_,
        RiskManagementInit memory riskManagement
    ) {
        initialize(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            accessControlManager_,
            riskManagement
        );
    }

    function _doTransferOut(address payable to, uint256 amount) internal override {
        require(failTransferToAddresses[to] == false, "HARNESS_TOKEN_TRANSFER_OUT_FAILED");
        return super._doTransferOut(to, amount);
    }

    function _exchangeRateStored() internal view override returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super._exchangeRateStored();
    }

    function _getBlockNumber() internal view override returns (uint256) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() external pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockNumber(uint256 accrualBlockNumber_) external {
        accrualBlockNumber = accrualBlockNumber_;
    }

    function harnessSetBlockNumber(uint256 newBlockNumber) external {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint256 blocks) external {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) external {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) external {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) external {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) external {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) external {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address to_, bool fail_) external {
        failTransferToAddresses[to_] = fail_;
    }

    function harnessMintFresh(address account, uint256 mintAmount) external {
        super._mintFresh(account, mintAmount);
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 vTokenAmount,
        uint256 underlyingAmount
    ) external {
        super._redeemFresh(account, vTokenAmount, underlyingAmount);
    }

    function harnessAccountBorrows(address account) external view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) external {
        accountBorrows[account] = BorrowSnapshot({ principal: principal, interestIndex: interestIndex });
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) external {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) external {
        _borrowFresh(account, borrowAmount);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) external {
        _repayBorrowFresh(payer, account, repayAmount);
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VToken vTokenCollateral,
        bool skipLiquidityCheck
    ) external {
        _liquidateBorrowFresh(liquidator, borrower, repayAmount, vTokenCollateral, skipLiquidityCheck);
    }

    function harnessReduceReservesFresh(uint256 amount) external {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) external {
        _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) external {
        _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return comptroller.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract VTokenScenario is VToken {
    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        AccessControlManager accessControlManager_,
        VTokenInterface.RiskManagementInit memory riskManagement
    ) {
        initialize(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            accessControlManager_,
            riskManagement
        );
    }

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function _getBlockNumber() internal view override returns (uint256) {
        ComptrollerScenario comptrollerScenario = ComptrollerScenario(address(comptroller));
        return comptrollerScenario.blockNumber();
    }
}

contract VEvil is VTokenScenario {
    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        AccessControlManager accessControlManager_,
        VTokenInterface.RiskManagementInit memory riskManagement
    )
        VTokenScenario(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            accessControlManager_,
            riskManagement
        )
    {}

    function evilSeize(
        VToken treasure,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) public {
        treasure.seize(liquidator, borrower, seizeTokens);
    }
}

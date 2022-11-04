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

    function doTransferOut(address payable to, uint256 amount)
        internal
        override
    {
        require(
            failTransferToAddresses[to] == false,
            "HARNESS_TOKEN_TRANSFER_OUT_FAILED"
        );
        return super.doTransferOut(to, amount);
    }

    function exchangeRateStoredInternal()
        internal
        view
        override
        returns (uint256)
    {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockNumber() internal view override returns (uint256) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockNumber(uint256 _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
    }

    function harnessSetBlockNumber(uint256 newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint256 blocks) public {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount)
        public
        returns (uint256)
    {
        super.mintFresh(account, mintAmount);
        return NO_ERROR;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 vTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        super.redeemFresh(account, vTokenAmount, underlyingAmount);
        return NO_ERROR;
    }

    function harnessAccountBorrows(address account)
        public
        view
        returns (uint256 principal, uint256 interestIndex)
    {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({
            principal: principal,
            interestIndex: interestIndex
        });
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount)
        public
        returns (uint256)
    {
        borrowFresh(account, borrowAmount);
        return NO_ERROR;
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public returns (uint256) {
        repayBorrowFresh(payer, account, repayAmount);
        return NO_ERROR;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VToken vTokenCollateral,
        bool skipLiquidityCheck
    ) public returns (uint256) {
        liquidateBorrowFresh(
            liquidator,
            borrower,
            repayAmount,
            vTokenCollateral,
            skipLiquidityCheck
        );
        return NO_ERROR;
    }

    function harnessReduceReservesFresh(uint256 amount)
        public
        returns (uint256)
    {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa)
        public
        returns (uint256)
    {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(
        InterestRateModel newInterestRateModel
    ) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress)
        public
    {
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

    function getBlockNumber() internal view override returns (uint256) {
        ComptrollerScenario comptrollerScenario = ComptrollerScenario(
            address(comptroller)
        );
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

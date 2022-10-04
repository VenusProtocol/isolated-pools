// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../VBep20Immutable.sol";
import "../VBep20Delegator.sol";
import "../VBep20Delegate.sol";
import "../Governance/AccessControlManager.sol";
import "./ComptrollerScenario.sol";

contract VBep20Harness is VBep20Immutable {
    uint public blockNumber = 100000;
    uint public harnessExchangeRate;
    bool public harnessExchangeRateStored;

    mapping (address => bool) public failTransferToAddresses;

    constructor(address underlying_,
                ComptrollerInterface comptroller_,
                InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable admin_,
                AccessControlManager accessControlManager_, 
                RiskManagementInit memory riskManagement
        ) {
            initializeVToken(underlying_, comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_, admin_, accessControlManager_, riskManagement);
        }
  

    function doTransferOut(address payable to, uint amount) override internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
    }

    function exchangeRateStoredInternal() override internal view returns (uint) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockNumber() override internal view returns (uint) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockNumber(uint _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint blocks) public {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(uint totalSupply_, uint totalBorrows_, uint totalReserves_) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint mintAmount) public returns (uint) {
        super.mintFresh(account, mintAmount);
        return NO_ERROR;
    }

    function harnessRedeemFresh(address payable account, uint vTokenAmount, uint underlyingAmount) public returns (uint) {
        super.redeemFresh(account, vTokenAmount, underlyingAmount);
        return NO_ERROR;
    }

    function harnessAccountBorrows(address account) public view returns (uint principal, uint interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(address account, uint principal, uint interestIndex) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint borrowAmount) public returns (uint) {
        borrowFresh(account, borrowAmount);
        return NO_ERROR;
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        repayBorrowFresh(payer, account, repayAmount);
        return NO_ERROR;
    }

    function harnessLiquidateBorrowFresh(address liquidator, address borrower, uint repayAmount, VToken vTokenCollateral) public returns (uint) {
        liquidateBorrowFresh(liquidator, borrower, repayAmount, vTokenCollateral);
        return NO_ERROR;
    }

    function harnessReduceReservesFresh(uint amount) public returns (uint) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint newReserveFactorMantissa) public returns (uint) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint amount) public returns (uint) {
        return comptroller.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract VBep20Scenario is VBep20Immutable {
    constructor(address underlying_,
                ComptrollerInterface comptroller_,
                InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable admin_,
                AccessControlManager accessControlManager_,
                VBep20Interface.RiskManagementInit memory riskManagement
        )   {
                initializeVToken(underlying_, comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_, admin_, accessControlManager_, riskManagement);
        }
                
    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockNumber() override internal view returns (uint) {
        ComptrollerScenario comptrollerScenario = ComptrollerScenario(address(comptroller));
        return comptrollerScenario.blockNumber();
    }
}

contract CEvil is VBep20Scenario {
    constructor(address underlying_,
                ComptrollerInterface comptroller_,
                InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable admin_,
                AccessControlManager accessControlManager_,
                VBep20Interface.RiskManagementInit memory riskManagement)
        VBep20Scenario(
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
        ) {}

    function evilSeize(VToken treasure, address liquidator, address borrower, uint seizeTokens) public returns (uint) {
        return treasure.seize(liquidator, borrower, seizeTokens);
    }
}

contract VBep20DelegatorScenario is VBep20Delegator {
    constructor(address underlying_,
                ComptrollerInterface comptroller_,
                InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable admin_,
                address implementation_,
                bytes memory becomeImplementationData)
    VBep20Delegator(
    underlying_,
    comptroller_,
    interestRateModel_,
    initialExchangeRateMantissa_,
    name_,
    symbol_,
    decimals_,
    admin_,
    implementation_,
    becomeImplementationData) {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }
}

contract VBep20DelegateHarness is VBep20Delegate {
    event Log(string x, address y);
    event Log(string x, uint y);

    uint blockNumber = 100000;
    uint harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping (address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() override internal view returns (uint) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(address payable to, uint amount) override internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
    }

    function getBlockNumber() override internal view returns (uint) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint) {
        return borrowRateMaxMantissa;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint blocks) public {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetAccrualBlockNumber(uint _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
    }

    function harnessSetTotalSupply(uint totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessIncrementTotalBorrows(uint addtlBorrow_) public {
        totalBorrows = totalBorrows + addtlBorrow_;
    }

    function harnessSetTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(uint totalSupply_, uint totalBorrows_, uint totalReserves_) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint mintAmount) public returns (uint) {
        super.mintFresh(account, mintAmount);
        return NO_ERROR;
    }

    function harnessRedeemFresh(address payable account, uint vTokenAmount, uint underlyingAmount) public returns (uint) {
        super.redeemFresh(account, vTokenAmount, underlyingAmount);
        return NO_ERROR;
    }

    function harnessAccountBorrows(address account) public view returns (uint principal, uint interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(address account, uint principal, uint interestIndex) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint borrowAmount) public returns (uint) {
        borrowFresh(account, borrowAmount);
        return NO_ERROR;
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        repayBorrowFresh(payer, account, repayAmount);
        return NO_ERROR;
    }

    function harnessLiquidateBorrowFresh(address liquidator, address borrower, uint repayAmount, VToken vTokenCollateral) public returns (uint) {
        liquidateBorrowFresh(liquidator, borrower, repayAmount, vTokenCollateral);
        return NO_ERROR;
    }

    function harnessReduceReservesFresh(uint amount) public returns (uint) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint newReserveFactorMantissa) public returns (uint) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint amount) public returns (uint) {
        return comptroller.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract VBep20DelegateScenario is VBep20Delegate {
    constructor() {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }
}

contract VBep20DelegateScenarioExtra is VBep20DelegateScenario {
    function iHaveSpoken() public pure returns (string memory) {
      return "i have spoken";
    }

    function itIsTheWay() public {
      admin = payable(address(1)); // make a change to test effect
    }

    function babyYoda() public pure {
      revert("protect the baby");
    }
}
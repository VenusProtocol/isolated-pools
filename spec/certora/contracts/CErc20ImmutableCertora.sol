pragma solidity ^0.8.10;

import "../../../contracts/VBep20Immutable.sol";
import "../../../contracts/EIP20Interface.sol";

import "./VTokenCollateral.sol";

contract VBep20ImmutableCertora is VBep20Immutable {
    VTokenCollateral public otherToken;

    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    )
        public
        VBep20Immutable(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_
        )
    {}

    function balanceOfInOther(address account) public view returns (uint256) {
        return otherToken.balanceOf(account);
    }

    function borrowBalanceStoredInOther(address account) public view returns (uint256) {
        return otherToken.borrowBalanceStored(account);
    }

    function exchangeRateStoredInOther() public view returns (uint256) {
        return otherToken.exchangeRateStored();
    }

    function getCashInOther() public view returns (uint256) {
        return otherToken.getCash();
    }

    function getCashOf(address account) public view returns (uint256) {
        return EIP20Interface(underlying).balanceOf(account);
    }

    function getCashOfInOther(address account) public view returns (uint256) {
        return otherToken.getCashOf(account);
    }

    function totalSupplyInOther() public view returns (uint256) {
        return otherToken.totalSupply();
    }

    function totalBorrowsInOther() public view returns (uint256) {
        return otherToken.totalBorrows();
    }

    function totalReservesInOther() public view returns (uint256) {
        return otherToken.totalReserves();
    }

    function underlyingInOther() public view returns (address) {
        return otherToken.underlying();
    }

    function mintFreshPub(address minter, uint256 mintAmount) public returns (uint256) {
        (uint256 error, ) = mintFresh(minter, mintAmount);
        return error;
    }

    function redeemFreshPub(
        address payable redeemer,
        uint256 redeemTokens,
        uint256 redeemUnderlying
    ) public returns (uint256) {
        return redeemFresh(redeemer, redeemTokens, redeemUnderlying);
    }

    function borrowFreshPub(address payable borrower, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(borrower, borrowAmount);
    }

    function repayBorrowFreshPub(address payer, address borrower, uint256 repayAmount) public returns (uint256) {
        (uint256 error, ) = repayBorrowFresh(payer, borrower, repayAmount);
        return error;
    }

    function liquidateBorrowFreshPub(
        address liquidator,
        address borrower,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 error, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, otherToken);
        return error;
    }
}

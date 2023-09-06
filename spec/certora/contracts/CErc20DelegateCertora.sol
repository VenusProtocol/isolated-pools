pragma solidity ^0.8.10;

import "../../../contracts/VBep20Delegate.sol";
import "../../../contracts/EIP20Interface.sol";

import "./VTokenCollateral.sol";

contract VBep20DelegateCertora is VBep20Delegate {
    VTokenCollateral public otherToken;

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

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../../contracts/InterestRateModel.sol";

/**
 * @title An Interest Rate Model for tests that can be instructed to return a failure instead of doing a calculation
 * @author Compound
 */
contract InterestRateModelHarness is InterestRateModel {
    uint256 public constant opaqueBorrowFailureCode = 20;
    bool public failBorrowRate;
    uint256 public borrowRate;

    constructor(uint256 borrowRate_) {
        borrowRate = borrowRate_;
    }

    function setFailBorrowRate(bool failBorrowRate_) public {
        failBorrowRate = failBorrowRate_;
    }

    function setBorrowRate(uint256 borrowRate_) public {
        borrowRate = borrowRate_;
    }

    function getBorrowRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) public view override returns (uint256) {
        _cash; // unused
        _borrows; // unused
        _reserves; // unused
        require(!failBorrowRate, "INTEREST_RATE_MODEL_ERROR");
        return borrowRate;
    }

    function getSupplyRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves,
        uint256 _reserveFactor
    ) external view returns (uint256) {
        _cash; // unused
        _borrows; // unused
        _reserves; // unused
        return borrowRate * (1 - _reserveFactor);
    }

    function utilizationRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves
    ) public pure override returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (borrows == 0) {
            return 0;
        }

        return (borrows) / (cash + borrows - reserves);
    }
}

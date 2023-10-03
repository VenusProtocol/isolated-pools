pragma solidity ^0.8.10;

import "../../../contracts/InterestRateModel.sol";

contract InterestRateModelModel is InterestRateModel {
    uint256 borrowDummy;
    uint256 supplyDummy;

    function isInterestRateModel() external pure override returns (bool) {
        return true;
    }

    function getBorrowRate(uint256 utRate) external view override returns (uint256) {
        return borrowDummy;
    }
}

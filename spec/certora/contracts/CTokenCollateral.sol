pragma solidity ^0.8.10;

import "../../../contracts/VBep20Immutable.sol";
import "../../../contracts/EIP20Interface.sol";

contract VTokenCollateral is VBep20Immutable {
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

    function getCashOf(address account) public view returns (uint256) {
        return EIP20Interface(underlying).balanceOf(account);
    }
}

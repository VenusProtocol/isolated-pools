pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";

contract PriceOracleModel is PriceOracle {
    uint256 dummy;

    function isPriceOracle() external pure override returns (bool) {
        return true;
    }

    function getUnderlyingPrice(VToken vToken) external view override returns (uint256) {
        return dummy;
    }
}

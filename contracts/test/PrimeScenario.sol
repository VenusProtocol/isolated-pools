pragma solidity 0.8.20;

import { Prime } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/Prime.sol";
import { IPrimeLiquidityProvider } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/Interfaces/IPrimeLiquidityProvider.sol";
import { Scores } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/libs/Scores.sol";

contract PrimeScenario is Prime {
    constructor(
        address _wbnb,
        address _vbnb,
        uint256 _blocksPerYear,
        uint256 _stakingPeriod,
        uint256 _minimumStakedXVS,
        uint256 _maximumXVSCap,
        bool _timeBased
    ) Prime(_wbnb, _vbnb, _blocksPerYear, _stakingPeriod, _minimumStakedXVS, _maximumXVSCap, _timeBased) {}

    function setPLP(address plp) external {
        primeLiquidityProvider = plp;
    }

    function calculateScore(uint256 xvs, uint256 capital) external view returns (uint256) {
        return Scores._calculateScore(xvs, capital, alphaNumerator, alphaDenominator);
    }
}

pragma solidity 0.8.13;

import { Prime } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/Prime.sol";

contract PrimeScenario is Prime {
    constructor(
        address _wbnb,
        address _vbnb,
        uint256 _blocksPerYear,
        uint256 _stakingPeriod,
        uint256 _minimumStakedXVS,
        uint256 _maximumXVSCap
    ) Prime(_wbnb, _vbnb, _blocksPerYear, _stakingPeriod, _minimumStakedXVS, _maximumXVSCap) {}
}

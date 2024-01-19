pragma solidity 0.8.13;

import { PrimeLiquidityProvider } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/PrimeLiquidityProvider.sol";

contract PrimeLiquidityProviderScenario is PrimeLiquidityProvider {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(bool _isTimeBased, uint256 _blocksPerYer) PrimeLiquidityProvider(_isTimeBased, _blocksPerYer) {}
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { PrimeLiquidityProvider } from "@venusprotocol/venus-protocol/contracts/Tokens/Prime/PrimeLiquidityProvider.sol";

contract PrimeLiquidityProviderScenario is PrimeLiquidityProvider {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(bool _timeBased, uint256 _blocksPerYear) PrimeLiquidityProvider(_timeBased, _blocksPerYear) {}
}

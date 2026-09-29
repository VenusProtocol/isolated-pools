// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SpokeComptrollerViewInterface } from "../../../../Spoke/SpokeComptrollerInterface.sol";

/**
 * @title ISpokeComptroller
 * @author Venus
 * @notice The name `AdapterSpokeV1` imports for its view of a spoke pool. In `venus-liquidity-hub` this is a
 *         hand-written copy of the five getters the adapter calls, because that repo does not depend on this one. Here
 *         the name is bound to this repo's own `SpokeComptrollerViewInterface`, so the adapter compiles against the
 *         declarations the pool actually ships rather than against a second copy of them that nothing keeps in step.
 * @dev `isMarketListed` is the one getter declared here. `SpokeComptrollerViewInterface` does not carry it, because the
 *      pool implements it with a `VToken` parameter, as the shared `Comptroller` does. Both encode as
 *      `isMarketListed(address)`, so the adapter calls the selector the pool answers.
 *
 *      The hub's copy still exists on its side of the boundary and still has to match. `tests/hardhat/Spoke/
 *      interfaces.ts` checks these declarations against the compiled `SpokeComptroller`, and `tests/hardhat/Fork/
 *      HubSpoke/interfaces.ts` calls them on the deployed pool.
 */
interface ISpokeComptroller is SpokeComptrollerViewInterface {
    /**
     * @notice Whether the Comptroller lists `vToken` as one of its markets
     * @param vToken The market to query
     * @return listed True if `vToken` is a listed market of this Comptroller
     */
    function isMarketListed(address vToken) external view returns (bool listed);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SpokeComptrollerViewInterface } from "../../../../Spoke/SpokeComptrollerInterface.sol";

/**
 * @title ISpokeComptroller
 * @author Venus
 * @notice The name `AdapterSpokeV1` imports for its view of a spoke pool. In `venus-liquidity-hub` this is a
 *         hand-written copy of the same four getters, because that repo does not depend on this one. Here the name is
 *         bound to this repo's own `SpokeComptrollerViewInterface`, so the adapter compiles against the declarations
 *         the pool actually ships rather than against a second copy of them that nothing keeps in step.
 * @dev The hub's copy still exists on its side of the boundary and still has to match. `tests/hardhat/Fork/HubSpoke/
 *      interfaces.ts` asserts that it does, selector for selector and return type for return type, against both this
 *      interface and the deployed `SpokeComptroller`.
 */
// solhint-disable-next-line no-empty-blocks
interface ISpokeComptroller is SpokeComptrollerViewInterface {

}

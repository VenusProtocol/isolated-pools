// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { MaxLoopsLimitHelper } from "../MaxLoopsLimitHelper.sol";

contract HarnessMaxLoopsLimitHelper is MaxLoopsLimitHelper {
    function setMaxLoopsLimit(uint256 limit) external {
        _setMaxLoopsLimit(limit);
    }

    function ensureMaxLoops(uint256 limit) external view {
        _ensureMaxLoops(limit);
    }
}

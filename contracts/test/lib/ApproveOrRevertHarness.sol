// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ApproveOrRevert } from "../../lib/ApproveOrRevert.sol";

contract ApproveOrRevertHarness {
    using ApproveOrRevert for IERC20Upgradeable;

    function approve(IERC20Upgradeable token, address spender, uint256 amount) external {
        token.approveOrRevert(spender, amount);
    }
}

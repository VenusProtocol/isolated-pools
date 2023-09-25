// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { TokenDebtTracker } from "../../lib/TokenDebtTracker.sol";

contract TokenDebtTrackerHarness is TokenDebtTracker {
    function initialize() external initializer {
        __TokenDebtTracker_init();
    }

    function addTokenDebt(IERC20Upgradeable token, address user, uint256 amount) external {
        tokenDebt[token][user] += amount;
        totalTokenDebt[token] += amount;
    }

    function transferOutOrTrackDebt(IERC20Upgradeable token, address user, uint256 amount) external {
        _transferOutOrTrackDebt(token, user, amount);
    }

    function transferOutOrTrackDebtSkippingBalanceCheck(
        IERC20Upgradeable token,
        address user,
        uint256 amount
    ) external {
        _transferOutOrTrackDebtSkippingBalanceCheck(token, user, amount);
    }
}

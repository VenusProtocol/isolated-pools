// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VenusERC4626 } from "../../ERC4626/VenusERC4626.sol";

contract MockVenusERC4626 is VenusERC4626 {
    uint256 private mockTotalAssets;
    uint256 private mockMaxDeposit;
    uint256 private mockMaxWithdraw;

    // Mock functions for testing
    function setTotalAssets(uint256 _totalAssets) external {
        mockTotalAssets = _totalAssets;
    }

    function setMaxWithdraw(uint256 _maxWithdraw) external {
        mockMaxWithdraw = _maxWithdraw;
    }

    function setMaxDeposit(uint256 _maxDeposit) external {
        mockMaxDeposit = _maxDeposit;
    }

    // Expose internal functions for testing
    function getDecimalsOffset() external view returns (uint8) {
        return _decimalsOffset();
    }

    // Override totalAssets to return the mocked value
    function totalAssets() public view override returns (uint256) {
        return mockTotalAssets;
    }

    // Override maxDeposit to return the mocked value
    function maxDeposit(address) public view override returns (uint256) {
        return mockMaxDeposit;
    }

    // Override maxWithdraw to return the mocked value
    function maxWithdraw(address) public view override returns (uint256) {
        return mockMaxWithdraw;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VenusERC4626 } from "../../ERC4626/VenusERC4626.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract MockVenusERC4626 is VenusERC4626 {
    mapping(address => uint256) private _balances;
    uint256 private mockTotalAssets;
    uint256 private mockMaxDeposit;
    uint256 private mockMaxWithdraw;
    uint256 private mockMaxMint;
    uint256 private mockMaxRedeem;
    uint256 private mockTotalSupply;

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

    function setMaxRedeem(uint256 _maxRedeem) external {
        mockMaxRedeem = _maxRedeem;
    }

    function setMaxMint(uint256 _maxMint) external {
        mockMaxMint = _maxMint;
    }

    function setTotalSupply(uint256 _totalSupply) external {
        mockTotalSupply = _totalSupply;
    }

    function setAccountBalance(address account, uint256 balance) public {
        _balances[account] = balance;
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

    function maxMint(address) public view override returns (uint256) {
        return mockMaxMint;
    }

    function maxRedeem(address) public view override returns (uint256) {
        return mockMaxRedeem;
    }

    function totalSupply() public view override(ERC20Upgradeable, IERC20Upgradeable) returns (uint256) {
        return mockTotalSupply;
    }

    function _mint(address account, uint256 amount) internal override {
        mockTotalSupply += amount;
        _balances[account] += amount;
        super._mint(account, amount);
    }

    function _burn(address account, uint256 amount) internal override {
        mockTotalSupply -= amount;
        _balances[account] -= amount;
        super._burn(account, amount);
    }
}

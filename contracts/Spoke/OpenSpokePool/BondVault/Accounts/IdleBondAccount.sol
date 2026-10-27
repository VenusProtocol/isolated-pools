// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IBondAccount } from "../../../interfaces/IBondAccount.sol";
import { BaseBondAccount } from "./BaseBondAccount.sol";

/**
 * @title IdleBondAccount
 * @author Venus
 * @notice A bond account that holds its asset idle, with no source. It pays a seizure, the yield and the bond holder at
 * release from its balance at once
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract IdleBondAccount is BaseBondAccount {
    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    // solhint-disable-next-line no-empty-blocks
    constructor(address bondManager) BaseBondAccount(bondManager) {}

    // ──────────────────────────────────────────────────────────────────────
    // SpokeBondManager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function deposit(uint256 amount) external onlyBondManager {
        _recordDeposit(amount);
    }

    /// @inheritdoc IBondAccount
    function claimYield(uint256 floor) external onlyBondManager returns (uint256 amount) {
        amount = _claimable(floor, _bondAssets());
        _transferOut(bondHolder, amount);
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external onlyBondManager returns (uint256 paidNow) {
        _ensureSeizable(amount, _bondAssets());
        _transferOut(receiver, amount);
        paidNow = amount;
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager {
        released = true;
        deposited = 0;
        _transferOut(bondHolder, asset.balanceOf(address(this)));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Returns the balance
    function _bondAssets() internal view override returns (uint256) {
        return asset.balanceOf(address(this));
    }
}

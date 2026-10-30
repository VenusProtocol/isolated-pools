// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ILiquidityHub } from "../../../interfaces/external/ILiquidityHub.sol";
import { BondAccount } from "./BondAccount.sol";

/**
 * @title LiquidityHubBondAccount
 * @author Venus
 * @notice A bond account that deposits its stablecoin in the stablecoin's Liquidity Hub. A withdrawal, a seizure or the
 * release reverts when the Hub cannot pay it at once. The position is valued net of the Hub's exit fee
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract LiquidityHubBondAccount is BondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    // solhint-disable-next-line no-empty-blocks
    constructor(address bondManager) BondAccount(bondManager) {}

    // ──────────────────────────────────────────────────────────────────────
    // Source hooks
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Deposits the balance in the Hub, which refuses it while paused or at its cap
    function _depositInSource() internal override {
        uint256 balance = asset.balanceOf(address(this));
        if (balance == 0) {
            return;
        }
        asset.forceApprove(source, balance);
        // solhint-disable-next-line no-empty-blocks
        try ILiquidityHub(source).deposit(balance, address(this)) {} catch {
            asset.forceApprove(source, 0);
            emit SourceDepositRefused(balance);
        }
    }

    /// @dev Settles the Hub's fees so its share price is current; skipped while it is paused, when it pays nothing
    function _accrueSource() internal override {
        if (!ILiquidityHub(source).hubPaused()) {
            ILiquidityHub(source).accrueFees();
        }
    }

    /**
     * @dev Withdraws what the balance lacks of `amount` from the Hub, which reverts when it cannot pay it now. The
     *   whole position is redeemed by shares, as withdrawing it by assets rounds the exit fee up and would leave a wei
     */
    function _withdrawFromSource(uint256 amount) internal override {
        (uint256 balance, uint256 inHub) = _holdings();
        if (amount <= balance) {
            return;
        }
        ILiquidityHub hub = ILiquidityHub(source);
        if (amount - balance >= inHub) {
            hub.redeem(hub.balanceOf(address(this)), address(this), address(this));
        } else {
            hub.withdraw(amount - balance, address(this), address(this));
        }
    }

    /// @dev Returns the balance plus the Hub position
    function _bondAssets() internal view override returns (uint256) {
        (uint256 balance, uint256 inHub) = _holdings();
        return balance + inHub;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Returns the balance and the Hub position, net of the exit fee
    function _holdings() private view returns (uint256 balance, uint256 inHub) {
        ILiquidityHub hub = ILiquidityHub(source);
        balance = asset.balanceOf(address(this));
        inHub = hub.previewRedeem(hub.balanceOf(address(this)));
    }
}

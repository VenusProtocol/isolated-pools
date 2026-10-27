// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IBondAccount } from "../../../interfaces/IBondAccount.sol";
import { ILiquidityHub } from "../../../interfaces/external/ILiquidityHub.sol";
import { BaseBondAccount } from "./BaseBondAccount.sol";

/**
 * @title LiquidityHubBondAccount
 * @author Venus
 * @notice A bond account that deposits its stablecoin in the stablecoin's Liquidity Hub. A seizure or the release
 * reverts when the Hub cannot pay it at once. The position is valued net of the Hub's exit fee. A Hub loss lowers the
 * bond's value, and no yield is paid until the position grows back above the principal
 */
contract LiquidityHubBondAccount is BaseBondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

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
        principal += amount;
        uint256 balance = asset.balanceOf(address(this));
        if (released || balance == 0) {
            return;
        }
        // The Hub refuses a deposit while paused or at its cap
        asset.forceApprove(source, balance);
        // solhint-disable-next-line no-empty-blocks
        try ILiquidityHub(source).deposit(balance, address(this)) {} catch {
            asset.forceApprove(source, 0);
            emit SourceDepositRefused(balance);
        }
    }

    /// @inheritdoc IBondAccount
    function claimYield() external onlyBondManager returns (uint256 amount) {
        _accrueFees();
        (uint256 balance, uint256 inHub) = _holdings();
        uint256 bondAssets = balance + inHub;
        if (bondAssets > principal) {
            amount = _pay(bondHolder, bondAssets - principal, balance, inHub);
        }
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external onlyBondManager returns (uint256 paidNow) {
        _accrueFees();
        (uint256 balance, uint256 inHub) = _holdings();
        _recordSeizure(amount, balance + inHub);
        paidNow = _pay(receiver, amount, balance, inHub);
        if (paidNow < amount) {
            revert InsufficientLiquidity(amount - paidNow);
        }
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager {
        released = true;
        principal = 0;
        _accrueFees();
        (uint256 balance, uint256 inHub) = _holdings();
        uint256 total = balance + inHub;
        uint256 paid = _pay(bondHolder, total, balance, inHub);
        if (paid < total) {
            revert InsufficientLiquidity(total - paid);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Returns the balance plus the Hub position
    function _bondAssets() internal view override returns (uint256) {
        (uint256 balance, uint256 inHub) = _holdings();
        return balance + inHub;
    }

    /// @dev Settles the Hub's fees so its share price is current; skipped while it is paused, when it pays nothing
    function _accrueFees() private {
        if (!ILiquidityHub(source).hubPaused()) {
            ILiquidityHub(source).accrueFees();
        }
    }

    /**
     * @dev Pays `receiver` up to `amount` now: up to `balance` from the account, then what the Hub pays at once. When
     *   the whole position is wanted, it is redeemed by shares, as `maxWithdraw` rounds the exit fee up and would leave
     *   a wei. The Hub's fees were accrued this block, so the limits read here hold
     */
    function _pay(address receiver, uint256 amount, uint256 balance, uint256 inHub) private returns (uint256 paid) {
        paid = amount < balance ? amount : balance;
        if (paid < amount) {
            ILiquidityHub hub = ILiquidityHub(source);
            uint256 wanted = amount - paid;
            if (wanted >= inHub) {
                uint256 shares = hub.maxRedeem(address(this));
                if (shares != 0) {
                    paid += hub.redeem(shares, address(this), address(this));
                }
            } else {
                uint256 liquid = hub.maxWithdraw(address(this));
                uint256 withdrawn = wanted < liquid ? wanted : liquid;
                if (withdrawn != 0) {
                    hub.withdraw(withdrawn, address(this), address(this));
                    paid += withdrawn;
                }
            }
        }
        _transferOut(receiver, paid);
    }

    /// @dev Returns the balance and the Hub position, net of the exit fee
    function _holdings() private view returns (uint256 balance, uint256 inHub) {
        ILiquidityHub hub = ILiquidityHub(source);
        balance = asset.balanceOf(address(this));
        inHub = hub.previewRedeem(hub.balanceOf(address(this)));
    }
}

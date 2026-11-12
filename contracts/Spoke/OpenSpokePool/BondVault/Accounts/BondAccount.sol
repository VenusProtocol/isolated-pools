// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ensureNonzeroAddress } from "../../../../lib/validators.sol";
import { IBondAccount } from "../../../interfaces/IBondAccount.sol";

/**
 * @title BondAccount
 * @author Venus
 * @notice Holds one open spoke pool bond, keeping its asset idle in the account. The bond holder can withdraw what the
 * bond holds beyond the bond the tier requires, yield and extra top-ups alike
 * @dev An EIP-1167 clone created by `BOND_MANAGER`, its only caller; clones share the implementation's immutables. An
 * account whose asset earns yield in a source overrides `_depositInSource`, `_accrueSource`, `_withdrawFromSource` and
 * `_bondAssets`
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract BondAccount is Initializable, IBondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @inheritdoc IBondAccount
    address public immutable BOND_MANAGER;

    /// @inheritdoc IBondAccount
    address public bondHolder;

    /// @inheritdoc IBondAccount
    IERC20Upgradeable public asset;

    /// @inheritdoc IBondAccount
    bool public released;

    /// @inheritdoc IBondAccount
    address public source;

    /// @dev Reverts unless the caller is `BOND_MANAGER`
    modifier onlyBondManager() {
        if (msg.sender != BOND_MANAGER) {
            revert NotBondManager(msg.sender);
        }
        _;
    }

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    constructor(address bondManager) {
        ensureNonzeroAddress(bondManager);
        BOND_MANAGER = bondManager;
        _disableInitializers();
    }

    /// @inheritdoc IBondAccount
    function initialize(address bondHolder_, IERC20Upgradeable asset_, address source_) external initializer {
        bondHolder = bondHolder_;
        asset = asset_;
        source = source_;
    }

    // ──────────────────────────────────────────────────────────────────────
    // SpokeBondManager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function depositInSource() external onlyBondManager {
        if (released) revert BondAlreadyReleased();
        _depositInSource();
    }

    /// @inheritdoc IBondAccount
    function withdrawExcess(uint256 floor) external onlyBondManager returns (uint256 amount) {
        _accrueSource();
        uint256 bondAssets = _bondAssets();
        if (bondAssets <= floor) {
            revert NoExcessBond(bondAssets, floor);
        }
        amount = bondAssets - floor;
        _pay(bondHolder, amount);
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external onlyBondManager {
        _accrueSource();
        uint256 bondAssets = _bondAssets();
        if (amount > bondAssets) {
            revert InsufficientFunds(amount, bondAssets);
        }
        _pay(receiver, amount);
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager {
        released = true;
        _accrueSource();
        _pay(bondHolder, _bondAssets());
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function currentBondAmount() external view returns (uint256) {
        return released ? 0 : _bondAssets();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Source hooks
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Moves the account's balance into the source, keeping it here if refused; a no-op with no source
    // solhint-disable-next-line no-empty-blocks
    function _depositInSource() internal virtual {}

    /// @dev Brings the source's valuation up to date before the bond is valued; a no-op with no source
    // solhint-disable-next-line no-empty-blocks
    function _accrueSource() internal virtual {}

    /// @dev Withdraws from the source what the balance lacks to pay `amount`, or reverts; a no-op with no source
    // solhint-disable-next-line no-empty-blocks
    function _withdrawFromSource(uint256 amount) internal virtual {}

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Pays `receiver` all of `amount`, withdrawing from the source what the balance lacks
    function _pay(address receiver, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        _withdrawFromSource(amount);
        asset.safeTransfer(receiver, amount);
        emit Paid(receiver, amount);
    }

    /// @dev Returns what the bond holds: the balance, plus the position in the source if any
    function _bondAssets() internal view virtual returns (uint256) {
        return asset.balanceOf(address(this));
    }
}

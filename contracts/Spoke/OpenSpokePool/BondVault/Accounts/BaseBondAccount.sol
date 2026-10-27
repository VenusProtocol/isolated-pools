// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ensureNonzeroAddress } from "../../../../lib/validators.sol";
import { IBondAccount } from "../../../interfaces/IBondAccount.sol";

/**
 * @title BaseBondAccount
 * @author Venus
 * @notice Base of the bond accounts: keeps a bond's principal and takes seizures from yield first; yield is everything
 * beyond the principal, including assets sent here directly
 * @dev An EIP-1167 clone created by `BOND_MANAGER`, its only caller; clones share the implementation's immutables. Each
 * account moves the asset in `deposit`, `claimYield`, `seize` and `release`, keeping the books with `_recordSeizure`
 * and `_transferOut`, and reports what it holds in `_bondAssets`
 * @custom:oz-upgrades-unsafe-allow constructor
 */
abstract contract BaseBondAccount is Initializable, IBondAccount {
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

    /// @inheritdoc IBondAccount
    uint256 public principal;

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
    /// @dev A no-op for an account that never owes; an account whose source pays later overrides it
    // solhint-disable-next-line no-empty-blocks
    function payReceiver(address receiver) external virtual onlyBondManager {}

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function value() external view returns (uint256) {
        uint256 bondAssets = _bondAssets();
        return bondAssets < principal ? bondAssets : principal;
    }

    /// @inheritdoc IBondAccount
    function seizableAmount() external view returns (uint256) {
        return _bondAssets();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Records a seizure of `amount` against `bondAssets`, what the bond holds now: yield first, then principal.
     *   Reverts with InsufficientFunds when the bond holds less
     */
    function _recordSeizure(uint256 amount, uint256 bondAssets) internal {
        if (amount > bondAssets) {
            revert InsufficientFunds(amount, bondAssets);
        }
        uint256 yield = bondAssets > principal ? bondAssets - principal : 0;
        if (amount > yield) {
            principal -= amount - yield;
        }
    }

    /// @dev Sends `amount` of the asset to `receiver`, if any
    function _transferOut(address receiver, uint256 amount) internal {
        if (amount != 0) {
            asset.safeTransfer(receiver, amount);
            emit Paid(receiver, amount);
        }
    }

    /// @dev Returns what the bond holds, as the views read it: what is in the account and its source, less what it owes
    function _bondAssets() internal view virtual returns (uint256);
}

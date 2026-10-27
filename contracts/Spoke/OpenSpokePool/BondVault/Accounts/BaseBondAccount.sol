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
 * @notice Base of the bond accounts: keeps what a bond holder has deposited, the floor above which yield is paid, and
 * what the bond holds. Yield is everything beyond the deposits and the bond the tier requires, including assets sent
 * here directly; a seizure takes from what the bond holds and leaves the deposits as they are, so no yield is paid
 * until the bond grows back or a top-up forgives the loss
 * @dev An EIP-1167 clone created by `BOND_MANAGER`, its only caller; clones share the implementation's immutables. Each
 * account moves the asset in `deposit`, `claimYield`, `seize` and `release`, keeping the books with `_recordDeposit`,
 * `_claimable`, `_ensureSeizable` and `_transferOut`, and reports what it holds in `_bondAssets`
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
    uint256 public deposited;

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
    function seizableAmount() external view returns (uint256) {
        return released ? 0 : _bondAssets();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Adds `amount`, already in the account, to `deposited`, first lowering that to what the bond held before the
     *   deposit, so a seizure or loss is forgiven and later growth counts as yield again
     */
    function _recordDeposit(uint256 amount) internal {
        uint256 bondAssets = _bondAssets();
        uint256 before = bondAssets > amount ? bondAssets - amount : 0;
        if (before < deposited) {
            deposited = before;
        }
        deposited += amount;
    }

    /// @dev Sends `amount` of the asset to `receiver`, if any
    function _transferOut(address receiver, uint256 amount) internal {
        if (amount != 0) {
            asset.safeTransfer(receiver, amount);
            emit Paid(receiver, amount);
        }
    }

    /// @dev Returns the yield in `bondAssets`: what is beyond the higher of `deposited` and `floor`
    function _claimable(uint256 floor, uint256 bondAssets) internal view returns (uint256) {
        uint256 kept = deposited > floor ? deposited : floor;
        return bondAssets > kept ? bondAssets - kept : 0;
    }

    /// @dev Returns what the bond holds, as the views read it: what is in the account and its source, less what it owes
    function _bondAssets() internal view virtual returns (uint256);

    /// @dev Checks a seizure of `amount` fits in `bondAssets`, what the bond holds now; reverts with InsufficientFunds
    function _ensureSeizable(uint256 amount, uint256 bondAssets) internal pure {
        if (amount > bondAssets) {
            revert InsufficientFunds(amount, bondAssets);
        }
    }
}

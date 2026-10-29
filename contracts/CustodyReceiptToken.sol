// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {
    IAccessControlManagerV8
} from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

/**
 * @title CustodyReceiptToken
 * @author Venus
 * @notice A generic, non-upgradeable mintable / burnable ERC-20 that mirrors an asset held in
 * off-chain custody. It is used solely by the Fixed Rate Vaults, not by the core protocol.
 *
 * Minting and burning are gated by the Venus AccessControlManager, so only the addresses that
 * governance grants the `mint(address,uint256)` / `burn(address,uint256)` permissions to (e.g. the
 * Timelocks and the Guardians) can change the supply.
 *
 * As an emergency safeguard, holder-to-holder transfers can be paused via the AccessControlManager
 * (`pause()` / `unpause()`). Pausing only blocks transfers; minting and burning remain available so
 * custody can still be reconciled while transfers are frozen.
 */
contract CustodyReceiptToken is ERC20, Ownable2Step {
    /// @notice Number of decimals the token uses, set at construction.
    uint8 private immutable _decimals;

    /// @notice Address of the Access Control Manager contract that gates mint / burn / pause.
    address public accessControlManager;

    /// @notice Whether holder-to-holder transfers are currently paused. Minting and burning are unaffected.
    bool public paused;

    /// @notice Emitted when the address of the access control manager is updated.
    event NewAccessControlManager(address indexed oldAccessControlManager, address indexed newAccessControlManager);

    /// @notice Emitted when holder-to-holder transfers are paused.
    event Paused(address indexed account);

    /// @notice Emitted when holder-to-holder transfers are unpaused.
    event Unpaused(address indexed account);

    /// @notice Thrown when the caller is not allowed to perform the requested action.
    error Unauthorized();

    /// @notice Thrown when a zero address is supplied where a non-zero address is required.
    error ZeroAddressNotAllowed();

    /// @notice Thrown when a holder-to-holder transfer is attempted while transfers are paused.
    error ActionPaused();

    /// @notice Thrown when pausing transfers that are already paused.
    error AlreadyPaused();

    /// @notice Thrown when unpausing transfers that are not paused.
    error NotPaused();

    /**
     * @param name_ Name of the token.
     * @param symbol_ Symbol of the token.
     * @param decimals_ Number of decimals of the token.
     * @param accessControlManager_ Address of the Venus Access Control Manager contract.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address accessControlManager_
    ) ERC20(name_, symbol_) {
        _ensureNonZeroAddress(accessControlManager_);
        accessControlManager = accessControlManager_;
        _decimals = decimals_;
    }

    /**
     * @notice Creates `amount_` tokens and assigns them to `account_`, increasing the total supply.
     * @param account_ Address to which the tokens are assigned.
     * @param amount_ Amount of tokens to be minted.
     * @custom:access Controlled by AccessControlManager.
     */
    function mint(
        address account_,
        uint256 amount_
    ) external {
        _ensureAllowed("mint(address,uint256)");
        _mint(account_, amount_);
    }

    /**
     * @notice Destroys `amount_` tokens from `account_`, reducing the total supply.
     * @dev Unlike ERC20 `burnFrom`, this does not check or consume `account_`'s allowance for the
     * caller -- access is gated solely by AccessControlManager.
     * @param account_ Address from which the tokens are destroyed.
     * @param amount_ Amount of tokens to be burned.
     * @custom:access Controlled by AccessControlManager.
     */
    function burn(
        address account_,
        uint256 amount_
    ) external {
        _ensureAllowed("burn(address,uint256)");
        _burn(account_, amount_);
    }

    /**
     * @notice Pauses holder-to-holder transfers as an emergency safeguard. Minting and burning
     * remain available.
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits Paused.
     * @custom:error AlreadyPaused is thrown when transfers are already paused.
     */
    function pause() external {
        _ensureAllowed("pause()");
        if (paused) {
            revert AlreadyPaused();
        }
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpauses holder-to-holder transfers after a pause.
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits Unpaused.
     * @custom:error NotPaused is thrown when transfers are not paused.
     */
    function unpause() external {
        _ensureAllowed("unpause()");
        if (!paused) {
            revert NotPaused();
        }
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Sets the address of the access control manager of this contract.
     * @param newAccessControlManager_ New address for the access control manager.
     * @custom:access Only owner.
     * @custom:event Emits NewAccessControlManager.
     */
    function setAccessControlManager(
        address newAccessControlManager_
    ) external onlyOwner {
        _ensureNonZeroAddress(newAccessControlManager_);
        emit NewAccessControlManager(accessControlManager, newAccessControlManager_);
        accessControlManager = newAccessControlManager_;
    }

    /**
     * @notice Disabled to prevent the owner from being renounced, which would permanently
     * lock `setAccessControlManager`.
     * @dev Overridden with an empty body so renouncing ownership is a no-op.
     */
    function renounceOwnership() public override { }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     * @return The number of decimals the token uses.
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Blocks holder-to-holder transfers while paused, leaving minting and burning available.
     * @dev Called by ERC20 on every mint, burn and transfer. Mint has `from_ == address(0)` and burn
     * has `to_ == address(0)`, so gating on both being non-zero pauses only true transfers.
     * @param from_ Address tokens are moving from (zero on mint).
     * @param to_ Address tokens are moving to (zero on burn).
     * @custom:error ActionPaused is thrown when a holder-to-holder transfer is attempted while paused.
     */
    function _beforeTokenTransfer(
        address from_,
        address to_,
        uint256
    ) internal view override {
        if (from_ != address(0) && to_ != address(0) && paused) {
            revert ActionPaused();
        }
    }

    /**
     * @notice Reverts if the caller is not allowed to call `functionSig_`.
     * @param functionSig_ Function signature on which access is to be checked.
     * @custom:error Unauthorized is thrown when the caller is not allowed to call `functionSig_`.
     */
    function _ensureAllowed(
        string memory functionSig_
    ) internal view {
        if (!IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig_)) {
            revert Unauthorized();
        }
    }

    /**
     * @notice Reverts if `address_` is the zero address.
     * @param address_ Address to validate.
     * @custom:error ZeroAddressNotAllowed is thrown when `address_` is the zero address.
     */
    function _ensureNonZeroAddress(
        address address_
    ) internal pure {
        if (address_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
    }
}

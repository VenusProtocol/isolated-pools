// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract WithAdminUpgradeable is Initializable, ContextUpgradeable {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Emitted when pendingAdmin is changed
     */
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /**
     * @notice Emitted when pendingAdmin is accepted, which means admin is updated
     */
    event NewAdmin(address oldAdmin, address newAdmin);

    /**
     * @notice Thrown if the caller is not authorized to perform an action
     */
    error OnlyAdminAllowed();

    /**
     * @dev Initializes the contract setting the deployer as the initial admin.
     */
    function __WithAdmin_init() internal onlyInitializing {
        __WithAdmin_init_unchained();
    }

    /**
     * @dev Initializes the contract setting the deployer as the initial owner. An "unchained" version, following
     * OpenZeppelin convention.
     */
    function __WithAdmin_init_unchained() internal onlyInitializing {
        admin = _msgSender();
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyAdmin() {
        _ensureAdmin();
        _;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    function _ensureAdmin() internal view {
        if (_msgSender() != admin) {
            revert OnlyAdminAllowed();
        }
    }

    /**
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin_ New pending admin.
     */
    function setPendingAdmin(address newPendingAdmin_) external {
        _ensureAdmin();
        _updatePendingAdmin(newPendingAdmin_);
    }

    /**
     * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
     * @dev Admin function for pending admin to accept role and update admin
     */
    function acceptAdmin() external {
        // Check caller is pendingAdmin
        if (_msgSender() != pendingAdmin) {
            revert OnlyAdminAllowed();
        }

        _updateAdmin(pendingAdmin);
        _updatePendingAdmin(address(0));
    }

    function _updateAdmin(address newAdmin_) private {
        address oldAdmin = admin;
        admin = newAdmin_;
        emit NewAdmin(oldAdmin, newAdmin_);
    }

    function _updatePendingAdmin(address newPendingAdmin_) private {
        address oldPendingAdmin = pendingAdmin;
        pendingAdmin = newPendingAdmin_;
        emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin_);
    }
}

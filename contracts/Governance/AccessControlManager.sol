// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Venus Access Control Contract
 * @author 0xLucian
 * @dev This contract is a wrapper of OpenZeppelin AccessControl
 *		extending it in a way to standartize access control
 *		within Venus Smart Contract Ecosystem
 */
contract AccessControlManager is AccessControl {
<<<<<<< HEAD
=======

    /// @notice Emitted when an account is given a permission to a certain contract function
    /// NOTE: If contract address is 0x000..0 this means that the account is a default admin of this function and
    /// can call any contract function with this signature
    event PermissionGranted(address account, address contractAddress, string functionSig);

    /// @notice Emitted when an account is revoked a permission to a certain contract function
    event PermissionRevoked(address account, address contractAddress, string functionSig);


>>>>>>> e56bf74 (add events for permission grant and revoke)
    constructor() {
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Verifies if the given account can call a praticular contract's function
     * @dev Since the contract is calling itself this function, we can get contracts address with msg.sender
     * @param caller contract for which call permissions will be checked
     * @param functionSig signature e.g. "functionName(uint,bool)"
     * @return false if the user account cannot call the particular contract function
     *
     */
    function isAllowedToCall(address caller, string memory functionSig)
        public
        view
        returns (bool)
    {
        bytes32 role = keccak256(abi.encodePacked(msg.sender, functionSig));

        if (hasRole(role, caller)) {
            return true;
        } else {
            role = keccak256(abi.encodePacked(DEFAULT_ADMIN_ROLE, functionSig));
            return hasRole(role, caller);
        }
    }

    /**
     * @notice Gives a function call permission to one single account
     * @dev this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
     * 		May emit a {RoleGranted} event.
     * @param contractAddress address of contract for which call permissions will be granted
     * NOTE: if contractAddress is zero address, we give the account DEFAULT_ADMIN_ROLE,
     *      meaning that this account can access the certain function on ANY contract managed by this ACL
     * @param functionSig signature e.g. "functionName(uint,bool)"
     * @param accountToPermit account that will be given access to the contract function
     */
    function giveCallPermission(
        address contractAddress,
        string memory functionSig,
        address accountToPermit
    ) public {
        bytes32 role;
        if (contractAddress == address(0)) {
            role = keccak256(abi.encodePacked(DEFAULT_ADMIN_ROLE, functionSig));
        } else {
            role = keccak256(abi.encodePacked(contractAddress, functionSig));
        }

        grantRole(role, accountToPermit);
        emit PermissionGranted(accountToPermit,contractAddress,functionSig);
    }

    /**
     * @notice Revokes an account's permission to a particular function call
     * @dev this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
     * 		May emit a {RoleRevoked} event.
     * @param contractAddress address of contract for which call permissions will be revoked
     * @param functionSig signature e.g. "functionName(uint,bool)"
     */
    function revokeCallPermission(
        address contractAddress,
        string memory functionSig,
        address accountToRevoke
    ) public {
        bytes32 role = keccak256(
            abi.encodePacked(contractAddress, functionSig)
        );
        revokeRole(role, accountToRevoke);
        emit PermissionRevoked(accountToRevoke,contractAddress,functionSig);
    }
}

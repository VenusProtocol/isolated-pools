// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";

/**
 * @title TokenController
 * @author Venus
 * @notice TokenController contract acts as a governance and access control mechanism,
 * allowing the owner to manage minting restrictions and blacklist certain addresses to maintain control and security within the token ecosystem.
 * It provides a flexible framework for token-related operations.
 */

contract TokenController is Ownable, Pausable {
    /**
     * @notice Access control manager contract address.
     */
    address public accessControlManager;
    /**
     * @notice A Mapping used to keep track of the blacklist status of addresses.
     */
    mapping(address => bool) public _blacklist;
    /**
     * @notice A mapping is used to keep track of the maximum amount a minter is permitted to miny..
     */
    mapping(address => uint256) public minterToCap;
    /**
     * @notice A Mapping used to keep track of the amount i.e already m inted by minter.
     */
    mapping(address => uint256) public minterToMintedAmount;

    /**
     * @notice Emitted when the blacklist status of a user is updated.
     */
    event BlacklistUpdated(address indexed user, bool value);
    /**
     * @notice Emitted when the minting limit for a minter is increased.
     */
    event MintLimitIncreased(address indexed minter, uint256 newLimit);
    /**
     * @notice Emitted when the minting limit for a minter is decreased.
     */
    event MintLimitDecreased(address indexed minter, uint256 newLimit);
    /**
     * @notice Emitted when the minting cap for a minter is changed.
     */
    event MintCapChanged(address indexed minter, uint256 amount);
    /**
     * @notice Emitted when the address of the access control manager of the contract is updated.
     */
    event NewAccessControlManager(address indexed oldAccessControlManager, address indexed newAccessControlManager);

    /**
     * @notice This error is used to indicate that the minting limit has been exceeded. It is typically thrown when a minting operation would surpass the defined cap.
     */
    error MintLimitExceed();
    /**
     * @notice This error is used to indicate that minting is not allowed for the specified addresses.
     */
    error MintNotAllowed(address from, address to);

    /**
     * @param accessControlManager_ Address of access control manager contract.
     * @custom:error ZeroAddressNotAllowed is thrown when accessControlManager contract address is zero.
     */
    constructor(address accessControlManager_) {
        ensureNonzeroAddress(accessControlManager_);
        accessControlManager = accessControlManager_;
    }

    /**
     * @notice Pauses Token
     * @custom:access Controlled by AccessControlManager.
     */
    function pause() external {
        _ensureAllowed("pause()");
        _pause();
    }

    /**
     * @notice Resumes Token
     * @custom:access Controlled by AccessControlManager.
     */
    function unpause() external {
        _ensureAllowed("unpause()");
        _unpause();
    }

    /**
     * @notice Function to update blacklist.
     * @param user_ User address to be affected.
     * @param value_ Boolean to toggle value.
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits BlacklistUpdated event.
     */
    function updateBlacklist(address user_, bool value_) external {
        _ensureAllowed("updateBlacklist(address,bool)");
        _blacklist[user_] = value_;
        emit BlacklistUpdated(user_, value_);
    }

    /**
     * @notice Sets the minitng cap for minter.
     * @param minter_ Minter address.
     * @param amount_ Cap for the minter.
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits MintCapChanged.
     */
    function setMintCap(address minter_, uint256 amount_) external {
        _ensureAllowed("setMintCap(address,uint256)");
        minterToCap[minter_] = amount_;
        emit MintCapChanged(minter_, amount_);
    }

    /**
     * @notice Sets the address of the access control manager of this contract.
     * @dev Admin function to set the access control address.
     * @param newAccessControlAddress_ New address for the access control.
     * @custom:access Only owner.
     * @custom:event Emits NewAccessControlManager.
     * @custom:error ZeroAddressNotAllowed is thrown when newAccessControlAddress_ contract address is zero.
     */
    function setAccessControlManager(address newAccessControlAddress_) external onlyOwner {
        ensureNonzeroAddress(newAccessControlAddress_);
        emit NewAccessControlManager(accessControlManager, newAccessControlAddress_);
        accessControlManager = newAccessControlAddress_;
    }

    /**
     * @notice Returns the blacklist status of the address.
     * @param user_ Address of user to check blacklist status.
     * @return bool status of blacklist.
     */
    function isBlackListed(address user_) external view returns (bool) {
        return _blacklist[user_];
    }

    /**
     * @dev Checks the minter cap and eligibility of receiver to receive tokens.
     * @param from_  Minter address.
     * @param to_  Receiver address.
     * @param amount_  Amount to be mint.
     */
    function _isEligibleToMint(address from_, address to_, uint256 amount_) internal {
        if (_blacklist[to_]) {
            revert MintNotAllowed(from_, to_);
        }
        uint256 mintingCap = minterToCap[from_];
        uint256 totalMintedOld = minterToMintedAmount[from_];
        uint256 totalMintedNew = totalMintedOld + amount_;

        if (totalMintedNew > mintingCap) {
            revert MintLimitExceed();
        }
        minterToMintedAmount[from_] = totalMintedNew;
        uint256 availableLimit = minterToCap[from_] - totalMintedNew;
        emit MintLimitDecreased(from_, availableLimit);
    }

    /**
     * @dev This is post hook of burn function, increases minitng limit of the minter.
     * @param from_ Minter address.
     * @param amount_  Amount burned.
     */
    function _increaseMintLimit(address from_, uint256 amount_) internal {
        uint256 totalMintedOld = minterToMintedAmount[from_];
        uint256 totalMintedNew = totalMintedOld - amount_;
        minterToMintedAmount[from_] = totalMintedNew;
        uint256 availableLimit = minterToCap[from_] - totalMintedNew;
        emit MintLimitIncreased(from_, availableLimit);
    }

    /// @dev Checks the caller is allowed to call the specified fuction
    function _ensureAllowed(string memory functionSig_) internal view {
        require(
            IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig_),
            "access denied"
        );
    }
}

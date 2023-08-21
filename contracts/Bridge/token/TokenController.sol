// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";

contract TokenController is Ownable, Pausable {
    address public accessControlManager;
    mapping(address => bool) internal _blacklist;
    mapping(address => uint256) internal minterToCap;
    mapping(address => uint256) internal minterToMintedAmount;

    event BlacklistUpdated(address indexed user, bool value);
    event MintLimitIncreased(address indexed minter, uint256 newLimit);
    event MintCapChanged(address indexed minter, uint256 amount);
    event NewAccessControlManager(address indexed oldAccessControlManager, address indexed newAccessControlManager);

    error MintLimitExceed();
    error MintNotAllowed(address from, address to);

    constructor(address accessControlManager_) {
        accessControlManager = accessControlManager_;
    }

    function pause() external {
        _ensureAllowed("pause()");
        _pause();
    }

    function unpause() external {
        _ensureAllowed("unpause()");
        _unpause();
    }

    /**
     * @notice Function to update blacklist
     * @param user_ User address to be affected
     * @param value_ Boolean to toggle value
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
     */
    function setAccessControlManager(address newAccessControlAddress_) external onlyOwner {
        ensureNonzeroAddress(newAccessControlAddress_);
        emit NewAccessControlManager(accessControlManager, newAccessControlAddress_);
        accessControlManager = newAccessControlAddress_;
    }

    function isBlackListed(address user_) external view returns (bool) {
        return _blacklist[user_];
    }

    /**
     * @dev Checks the minter cap and eligibility of receiver to receive tokens.
     * @param from_  Minter address.
     * @param to_  Receiver address.
     * @param amount_  Amount to be mint.
     */
    function _isEligibleToMint(
        address from_,
        address to_,
        uint256 amount_
    ) internal {
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

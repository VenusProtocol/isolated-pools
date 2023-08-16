// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { BaseOFTV2 } from "@layerzerolabs/solidity-examples/contracts/token/oft/v2/BaseOFTV2.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";

contract XVSProxyOFTDest is Pausable, BaseOFTV2 {
    using SafeERC20 for IERC20;

    /**
     * @dev Address of underlying token of this bridge.
     */
    IERC20 internal immutable innerToken;
    /**
     * @notice Conversion rate of innerToken decimals to shared decimals.
     */
    uint256 public immutable ld2sdRate;
    /**
     * @notice Address of access control manager contract.
     */
    address public accessControlManager;
    /**
     * @notice The address of ResilientOracle contract wrapped in its interface.
     */
    ResilientOracleInterface public oracle;

    /**
     * @notice Emmited when address of accessControlManager contract is modified.
     */
    event NewAccessControlManager(address indexed oldAccessControlManager, address indexed newAccessControlManager);
    /**
     * @notice Event emitted when oracle is modified.
     */
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    constructor(
        address to_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address accessControlManager_,
        address oracle_
    ) BaseOFTV2(sharedDecimals_, lzEndpoint_) {
        innerToken = IERC20(to_);

        (bool success, bytes memory data) = to_.staticcall(abi.encodeWithSignature("decimals()"));
        require(success, "ProxyOFT: failed to get token decimals");
        uint8 decimals = abi.decode(data, (uint8));

        require(sharedDecimals_ <= decimals, "ProxyOFT: sharedDecimals must be <= decimals");
        ld2sdRate = 10**(decimals - sharedDecimals_);
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(oracle_);
        accessControlManager = accessControlManager_;
        oracle = ResilientOracleInterface(oracle);
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

    /**
     * @notice Set the address of the ResilientOracle contract.
     * @dev Reverts if the new address is zero.
     * @param oracleAddress_ The new address of the ResilientOracle contract.
     */
    function setOracle(address oracleAddress_) external {
        _ensureAllowed("setOracle(address)");
        ensureNonzeroAddress(oracleAddress_);
        emit OracleChanged(address(oracle), oracleAddress_);
        oracle = ResilientOracleInterface(oracleAddress_);
    }

    /**
     * @notice Triggers stopped state of the bridge.
     */
    function pause() external {
        _ensureAllowed("pause()");
        _pause();
    }

    /**
     * @notice Triggers resume state of the bridge.
     */
    function unpause() external {
        _ensureAllowed("unpause()");
        _unpause();
    }

    /**
     * @return Circulating supply of current chain.
     */
    function circulatingSupply() public view override returns (uint256) {
        uint256 balance = innerToken.balanceOf(address(this));
        return innerToken.totalSupply() - balance;
    }

    /**
     * @return Address of underlying token.
     */
    function token() public view virtual override returns (address) {
        return address(innerToken);
    }

    function _debitFrom(
        address from_,
        uint16,
        bytes32,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        require(from_ == _msgSender(), "ProxyOFT: owner is not send caller");
        amount_ = _transferFrom(from_, address(this), amount_);

        // amount_ still may have dust if the token has transfer fee, then give the dust back to the sender
        (uint256 amount, uint256 dust) = _removeDust(amount_);
        if (dust > 0) innerToken.safeTransfer(from_, dust);
        return amount;
    }

    function _creditTo(
        uint16,
        address toAddress_,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        return _transferFrom(address(this), toAddress_, amount_);
    }

    function _transferFrom(
        address from_,
        address to_,
        uint256 amount_
    ) internal override returns (uint256) {
        uint256 before = innerToken.balanceOf(to_);
        if (from_ == address(this)) {
            innerToken.safeTransfer(to_, amount_);
        } else {
            innerToken.safeTransferFrom(from_, to_, amount_);
        }
        return innerToken.balanceOf(to_) - before;
    }

    /// @dev Checks the caller is allowed to call the specified fuction
    function _ensureAllowed(string memory functionSig_) internal view {
        require(
            IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig_),
            "access denied"
        );
    }

    function _ld2sdRate() internal view override returns (uint256) {
        return ld2sdRate;
    }
}

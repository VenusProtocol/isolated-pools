// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ProxyOFTV2 } from "./oft/ProxyOFTV2.sol";
import { ILayerZeroUserApplicationConfig } from "./interfaces/ILayerZeroUserApplicationConfig.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { IXVS } from "./interfaces/IXVS.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { EXP_SCALE } from "../lib/constants.sol";

contract XVSProxyOFTDest is Pausable, ILayerZeroUserApplicationConfig, ProxyOFTV2 {
    /**
     * @notice Address of access control manager contract.
     */
    address public accessControlManager;
    /**
     * @notice The address of ResilientOracle contract wrapped in its interface.
     */
    ResilientOracleInterface public oracle;
    /**
     * @notice Mapping of chain ID to max limit in USD of single transaction.
     */
    mapping(uint16 => uint256) public chainIdToMaxSingleTransactionLimit;
    /**
     * @notice Mapping of chain ID to max limit in USD in 24 hour window.
     */
    mapping(uint16 => uint256) public chainIdToMaxDailyLimit;
    /**
     * @notice Mapping of chain ID to transferred amount in USD in current 24 hour window.
     */
    mapping(uint16 => uint256) public chainIdToLast24HourTransferred;
    /**
     * @notice Mapping of chain ID to start timestamp of current 24 hour window.
     */
    mapping(uint16 => uint256) public chainIdToLast24HourWindowStart;
    /**
     * @notice Address on which cap check and bound limit is not appicable.
     */
    mapping(address => bool) public whitelist;

    /**
     * @notice Emmited when address is added to whitelist.
     */
    event SetWhitelist(address indexed addr, bool isWhitelist);
    /**
     * @notice Emmited when limit of single transaction is modified.
     */
    event SetMaxSingleTransactionLimit(uint256 oldMaxLimit, uint256 newMaxLimit);
    /**
     * @notice Emmited when limit of daily (24Hour) is modified.
     */
    event SetMaxDailyLimit(uint256 oldMaxLimit, uint256 newMaxLimit);
    /**
     * @notice Emmited when address of accessControlManager contract is modified.
     */
    event NewAccessControlManager(address indexed oldAccessControlManager, address indexed newAccessControlManager);
    /**
     * @notice Event emitted when oracle is modified.
     */
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    error MaxDailyLimitExceed(uint256 amount, uint256 limit);
    error MaxSingleTransactionLimitExceed(uint256 amount, uint256 limit);

    constructor(
        address tokenAddress_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address accessControlManager_,
        address oracle_
    ) ProxyOFTV2(tokenAddress_, sharedDecimals_, lzEndpoint_) {
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(oracle_);
        accessControlManager = accessControlManager_;
        oracle = ResilientOracleInterface(oracle_);
    }

    // generic config for LayerZero user Application
    function setConfig(
        uint16 version_,
        uint16 chainId_,
        uint256 configType_,
        bytes calldata config_
    ) external override {
        _ensureAllowed("setConfig(uint16,uint16,uint256,bytes)");
        lzEndpoint.setConfig(version_, chainId_, configType_, config_);
    }

    function setSendVersion(uint16 version_) external override {
        _ensureAllowed("setSendVersion(uint16)");
        lzEndpoint.setSendVersion(version_);
    }

    function setReceiveVersion(uint16 version_) external override {
        _ensureAllowed("setReceiveVersion(uint16)");
        lzEndpoint.setReceiveVersion(version_);
    }

    function forceResumeReceive(uint16 srcChainId_, bytes calldata srcAddress_) external override {
        _ensureAllowed("forceResumeReceive(uint16,bytes)");
        lzEndpoint.forceResumeReceive(srcChainId_, srcAddress_);
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
     * @notice Sets the limit of single transaction amount.
     * @param chainId_ Destination chain id.
     * @param limit_ Amount in USD.
     */
    function setMaxSingleTransactionLimit(uint16 chainId_, uint256 limit_) external {
        _ensureAllowed("setMaxSingleTransactionLimit(uint16,uint256)");
        emit SetMaxSingleTransactionLimit(chainIdToMaxSingleTransactionLimit[chainId_], limit_);
        chainIdToMaxSingleTransactionLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the limit of daily (24 Hour) transactions amount.
     * @param chainId_ Destination chain id.
     * @param limit_ Amount in USD.
     */
    function setMaxDailyLimit(uint16 chainId_, uint256 limit_) external {
        _ensureAllowed("setMaxDailyLimit(uint16,uint256)");
        emit SetMaxDailyLimit(chainIdToMaxDailyLimit[chainId_], limit_);
        chainIdToMaxDailyLimit[chainId_] = limit_;
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

    function _debitFrom(
        address from_,
        uint16 dstChainId_,
        bytes32,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        _isEligibleToSend(from_, dstChainId_, amount_);
        IXVS(address(innerToken)).burn(from_, amount_);
        return amount_;
    }

    function _creditTo(
        uint16,
        address toAddress_,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        IXVS(address(innerToken)).mint(toAddress_, amount_);
        return amount_;
    }

    function _isEligibleToSend(
        address from_,
        uint16 dstChainId_,
        uint256 amount_
    ) internal {
        if (whitelist[from_]) {
            return;
        }
        uint256 amountInUsd;
        uint256 oraclePrice = oracle.getPrice(address(innerToken));
        amountInUsd = (oraclePrice * amount_) / EXP_SCALE;

        uint256 currentBlock = block.timestamp;
        uint256 lastDayWindowStart = chainIdToLast24HourWindowStart[dstChainId_];
        uint256 transferredInWindow = chainIdToLast24HourTransferred[dstChainId_];
        uint256 maxSingleTransactionLimit = chainIdToMaxSingleTransactionLimit[dstChainId_];
        uint256 maxDailyLimit = chainIdToMaxDailyLimit[dstChainId_];

        if (amountInUsd > maxSingleTransactionLimit) {
            revert MaxSingleTransactionLimitExceed(amountInUsd, maxSingleTransactionLimit);
        }

        if (currentBlock - lastDayWindowStart > 1 days) {
            transferredInWindow = amountInUsd;
            chainIdToLast24HourWindowStart[dstChainId_] = currentBlock;
        } else {
            transferredInWindow += amountInUsd;
        }

        if (transferredInWindow > maxDailyLimit) {
            revert MaxDailyLimitExceed(amountInUsd, maxDailyLimit);
        }
        chainIdToLast24HourTransferred[dstChainId_] = transferredInWindow;
        return;
    }

    /// @dev Checks the caller is allowed to call the specified fuction
    function _ensureAllowed(string memory functionSig_) internal view {
        require(
            IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig_),
            "access denied"
        );
    }
}

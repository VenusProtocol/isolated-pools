// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { BaseOFTV2 } from "./oft/BaseOFTV2.sol";

abstract contract BaseXVSProxyOFT is Pausable, ExponentialNoError, BaseOFTV2 {
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
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address accessControlManager_,
        address oracle_
    ) BaseOFTV2(sharedDecimals_, lzEndpoint_) {
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(oracle_);
        accessControlManager = accessControlManager_;
        oracle = ResilientOracleInterface(oracle_);
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
        require(limit_ >= chainIdToMaxSingleTransactionLimit[chainId_], "Daily limit < single transaction limit");
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

    function _isEligibleToSend(
        address from_,
        uint16 dstChainId_,
        uint256 amount_
    ) internal {
        bool isWhiteListedUser = whitelist[from_];

        uint256 amountInUsd;
        Exp memory oraclePrice = Exp({ mantissa: oracle.getPrice(address(token())) });
        amountInUsd = mul_ScalarTruncate(oraclePrice, amount_);

        uint256 currentBlock = block.timestamp;
        uint256 lastDayWindowStart = chainIdToLast24HourWindowStart[dstChainId_];
        uint256 transferredInWindow = chainIdToLast24HourTransferred[dstChainId_];
        uint256 maxSingleTransactionLimit = chainIdToMaxSingleTransactionLimit[dstChainId_];
        uint256 maxDailyLimit = chainIdToMaxDailyLimit[dstChainId_];

        if (amountInUsd > maxSingleTransactionLimit && !isWhiteListedUser) {
            revert MaxSingleTransactionLimitExceed(amountInUsd, maxSingleTransactionLimit);
        }

        if (currentBlock - lastDayWindowStart > 1 days) {
            transferredInWindow = amountInUsd;
            chainIdToLast24HourWindowStart[dstChainId_] = currentBlock;
        } else {
            transferredInWindow += amountInUsd;
        }

        if (transferredInWindow > maxDailyLimit && !isWhiteListedUser) {
            revert MaxDailyLimitExceed(amountInUsd, maxDailyLimit);
        }
        chainIdToLast24HourTransferred[dstChainId_] = transferredInWindow;
        return;
    }
}

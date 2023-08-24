// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { BaseOFTV2 } from "./oft/BaseOFTV2.sol";

abstract contract BaseXVSProxyOFT is ExponentialNoError, BaseOFTV2 {
    /**
     * @notice The address of ResilientOracle contract wrapped in its interface.
     */
    ResilientOracleInterface public oracle;
    /**
     * @notice Maximum limit for a single transaction in USD from local chain.
     */
    mapping(uint16 => uint256) public chainIdToMaxSingleTransactionLimit;
    /**
     * @notice Maximum daily limit for transactions in USD from local chain.
     */
    mapping(uint16 => uint256) public chainIdToMaxDailyLimit;
    /**
     * @notice Total sent amount in USD within the last 24-hour window from local chain.
     */
    mapping(uint16 => uint256) public chainIdToLast24HourTransferred;
    /**
     * @notice Timestamp when the last 24-hour window started from local chain.
     */
    mapping(uint16 => uint256) public chainIdToLast24HourWindowStart;
    /**
     * @notice Maximum limit for a single receive transaction in USD from remote chain.
     */
    mapping(uint16 => uint256) public chainIdToMaxSingleReceiveTransactionLimit;
    /**
     * @notice Maximum daily limit for receiving transactions in USD from remote chain.
     */
    mapping(uint16 => uint256) public chainIdToMaxDailyReceiveLimit;
    /**
     * @notice Total received amount in USD within the last 24-hour window from remote chain.
     */
    mapping(uint16 => uint256) public chainIdToLast24HourReceived;
    /**
     * @notice Timestamp when the last 24-hour window started from remote chain.
     */
    mapping(uint16 => uint256) public chainIdToLast24HourReceiveWindowStart;
    /**
     * @notice Address on which cap check and bound limit is not appicable.
     */
    mapping(address => bool) public whitelist;

    /**
     * @notice Emmited when address is added to whitelist.
     */
    event SetWhitelist(address indexed addr, bool isWhitelist);
    /**
     * @notice  Emitted when the maximum limit for a single transaction from local chain is modified.
     */
    event SetMaxSingleTransactionLimit(uint256 oldMaxLimit, uint256 newMaxLimit);
    /**
     * @notice Emitted when the maximum daily limit of transactions from local chain is modified.
     */
    event SetMaxDailyLimit(uint256 oldMaxLimit, uint256 newMaxLimit);
    /**
     * @notice Emitted when the maximum limit for a single receive transaction from remote chain is modified.
     */
    event SetMaxSingleReceiveTransactionLimit(uint256 oldMaxLimit, uint256 newMaxLimit);
    /**
     * @notice Emitted when the maximum daily limit for receiving transactions from remote chain is modified.
     */
    event SetMaxDailyReceiveLimit(uint256 oldMaxLimit, uint256 newMaxLimit);
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
     * @notice Sets the maximum limit for a single receive transaction.
     * @param chainId The destination chain ID.
     * @param limit The new maximum limit in USD.
     */
    function setMaxSingleReceiveTransactionLimit(uint16 chainId, uint256 limit) external {
        _ensureAllowed("setMaxSingleReceiveTransactionLimit(uint16,uint256)");
        emit SetMaxSingleReceiveTransactionLimit(chainIdToMaxSingleReceiveTransactionLimit[chainId], limit);
        chainIdToMaxSingleReceiveTransactionLimit[chainId] = limit;
    }

    /**
     * @notice Sets the maximum daily limit for receiving transactions.
     * @param chainId The destination chain ID.
     * @param limit The new maximum daily limit in USD.
     */
    function setMaxDailyReceiveLimit(uint16 chainId, uint256 limit) external {
        _ensureAllowed("setMaxDailyReceiveLimit(uint16,uint256)");
        require(
            limit >= chainIdToMaxSingleReceiveTransactionLimit[chainId],
            "Daily limit < single receive transaction limit"
        );
        emit SetMaxDailyReceiveLimit(chainIdToMaxDailyReceiveLimit[chainId], limit);
        chainIdToMaxDailyReceiveLimit[chainId] = limit;
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
        // Check if the recipient's address is whitelisted
        bool isWhiteListedUser = whitelist[from_];

        // Calculate the received amount in USD using the oracle price
        uint256 amountInUsd;
        Exp memory oraclePrice = Exp({ mantissa: oracle.getPrice(address(token())) });
        amountInUsd = mul_ScalarTruncate(oraclePrice, amount_);

        // Load values for the 24-hour window checks for receiving
        uint256 currentBlock = block.timestamp;
        uint256 lastDayWindowStart = chainIdToLast24HourWindowStart[dstChainId_];
        uint256 transferredInWindow = chainIdToLast24HourTransferred[dstChainId_];
        uint256 maxSingleTransactionLimit = chainIdToMaxSingleTransactionLimit[dstChainId_];
        uint256 maxDailyLimit = chainIdToMaxDailyLimit[dstChainId_];

        // Check if the received amount exceeds the single transaction limit and the recipient is not whitelisted
        if (amountInUsd > maxSingleTransactionLimit && !isWhiteListedUser) {
            revert MaxSingleTransactionLimitExceed(amountInUsd, maxSingleTransactionLimit);
        }

        // Check if the time window has changed (more than 24 hours have passed)
        if (currentBlock - lastDayWindowStart > 1 days) {
            transferredInWindow = amountInUsd;
            chainIdToLast24HourWindowStart[dstChainId_] = currentBlock;
        } else {
            transferredInWindow += amountInUsd;
        }

        // Check if the received amount exceeds the daily limit and the recipient is not whitelisted
        if (transferredInWindow > maxDailyLimit && !isWhiteListedUser) {
            revert MaxDailyLimitExceed(amountInUsd, maxDailyLimit);
        }

        // Update the received amount for the 24-hour window
        chainIdToLast24HourTransferred[dstChainId_] = transferredInWindow;
    }

    function _isEligibleToReceive(uint16 srcChainId, uint256 receivedAmount) internal {
        // Check if the recipient's address is whitelisted
        bool isWhiteListedUser = whitelist[msg.sender];

        // Calculate the received amount in USD using the oracle price
        uint256 receivedAmountInUsd;
        Exp memory oraclePrice = Exp({ mantissa: oracle.getPrice(address(token())) });
        receivedAmountInUsd = mul_ScalarTruncate(oraclePrice, receivedAmount);

        uint256 currentBlock = block.timestamp;

        // Load values for the 24-hour window checks for receiving
        uint256 lastDayReceiveWindowStart = chainIdToLast24HourReceiveWindowStart[srcChainId];
        uint256 receivedInWindow = chainIdToLast24HourReceived[srcChainId];
        uint256 maxSingleReceiveTransactionLimit = chainIdToMaxSingleReceiveTransactionLimit[srcChainId];
        uint256 maxDailyReceiveLimit = chainIdToMaxDailyReceiveLimit[srcChainId];

        // Check if the received amount exceeds the single transaction limit and the recipient is not whitelisted
        if (receivedAmountInUsd > maxSingleReceiveTransactionLimit && !isWhiteListedUser) {
            revert MaxSingleTransactionLimitExceed(receivedAmountInUsd, maxSingleReceiveTransactionLimit);
        }

        // Check if the time window has changed (more than 24 hours have passed)
        if (currentBlock - lastDayReceiveWindowStart > 1 days) {
            receivedInWindow = receivedAmountInUsd;
            chainIdToLast24HourReceiveWindowStart[srcChainId] = currentBlock;
        } else {
            receivedInWindow += receivedAmountInUsd;
        }

        // Check if the received amount exceeds the daily limit and the recipient is not whitelisted
        if (receivedInWindow > maxDailyReceiveLimit && !isWhiteListedUser) {
            revert MaxDailyLimitExceed(receivedAmountInUsd, maxDailyReceiveLimit);
        }

        // Update the received amount for the 24-hour window
        chainIdToLast24HourReceived[srcChainId] = receivedInWindow;
    }
}

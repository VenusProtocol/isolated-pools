// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { BaseOFTV2 } from "@layerzerolabs/solidity-examples/contracts/token/oft/v2/BaseOFTV2.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";

abstract contract BaseXVSProxyOFT is Pausable, ExponentialNoError, BaseOFTV2 {
    using SafeERC20 for IERC20;
    IERC20 internal immutable innerToken;
    uint256 internal immutable ld2sdRate;

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
    event SetMaxSingleTransactionLimit(uint16 chainId, uint256 oldMaxLimit, uint256 newMaxLimit);
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
     * @notice Event emitted when oracle is modified.
     */
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    constructor(
        address tokenAddress_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address oracle_
    ) BaseOFTV2(sharedDecimals_, lzEndpoint_) {
        innerToken = IERC20(tokenAddress_);

        (bool success, bytes memory data) = tokenAddress_.staticcall(abi.encodeWithSignature("decimals()"));
        require(success, "ProxyOFT: failed to get token decimals");
        uint8 decimals = abi.decode(data, (uint8));

        require(sharedDecimals_ <= decimals, "ProxyOFT: sharedDecimals must be <= decimals");
        ld2sdRate = 10 ** (decimals - sharedDecimals_);

        ensureNonzeroAddress(oracle_);
        oracle = ResilientOracleInterface(oracle_);
    }

    /**
     * @notice Set the address of the ResilientOracle contract.
     * @dev Reverts if the new address is zero.
     * @param oracleAddress_ The new address of the ResilientOracle contract.
     */
    function setOracle(address oracleAddress_) external onlyOwner {
        ensureNonzeroAddress(oracleAddress_);
        emit OracleChanged(address(oracle), oracleAddress_);
        oracle = ResilientOracleInterface(oracleAddress_);
    }

    /**
     * @notice Sets the limit of single transaction amount.
     * @param chainId_ Destination chain id.
     * @param limit_ Amount in USD.
     */
    function setMaxSingleTransactionLimit(uint16 chainId_, uint256 limit_) external onlyOwner {
        emit SetMaxSingleTransactionLimit(chainId_, chainIdToMaxSingleTransactionLimit[chainId_], limit_);
        chainIdToMaxSingleTransactionLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the limit of daily (24 Hour) transactions amount.
     * @param chainId_ Destination chain id.
     * @param limit_ Amount in USD.
     */
    function setMaxDailyLimit(uint16 chainId_, uint256 limit_) external onlyOwner {
        require(limit_ >= chainIdToMaxSingleTransactionLimit[chainId_], "Daily limit < single transaction limit");
        emit SetMaxDailyLimit(chainIdToMaxDailyLimit[chainId_], limit_);
        chainIdToMaxDailyLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the maximum limit for a single receive transaction.
     * @param chainId_ The destination chain ID.
     * @param limit_ The new maximum limit in USD.
     */
    function setMaxSingleReceiveTransactionLimit(uint16 chainId_, uint256 limit_) external onlyOwner {
        emit SetMaxSingleReceiveTransactionLimit(chainIdToMaxSingleReceiveTransactionLimit[chainId_], limit_);
        chainIdToMaxSingleReceiveTransactionLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the maximum daily limit for receiving transactions.
     * @param chainId_ The destination chain ID.
     * @param limit_ The new maximum daily limit in USD.
     */
    function setMaxDailyReceiveLimit(uint16 chainId_, uint256 limit_) external onlyOwner {
        require(
            limit_ >= chainIdToMaxSingleReceiveTransactionLimit[chainId_],
            "Daily limit < single receive transaction limit"
        );
        emit SetMaxDailyReceiveLimit(chainIdToMaxDailyReceiveLimit[chainId_], limit_);
        chainIdToMaxDailyReceiveLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the whitelist address to skip checks on transaction limit.
     * @param user_ Adress to be add in whitelist.
     * @param val_ Boolean to be set (true for isWhitelisted address)
     */
    function setWhitelist(address user_, bool val_) external onlyOwner {
        emit SetWhitelist(user_, val_);
        whitelist[user_] = val_;
    }

    /**
     * @notice Triggers stopped state of the bridge.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Triggers resume state of the bridge.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Empty implementation of renounce ownership to avoid any mishappening.
     */
    function renounceOwnership() public override {}

    function token() public view override returns (address) {
        return address(innerToken);
    }

    function _isEligibleToSend(address from_, uint16 dstChainId_, uint256 amount_) internal {
        // Check if the recipient's address is whitelisted
        bool isWhiteListedUser = whitelist[from_];

        // Calculate the amount in USD using the oracle price
        uint256 amountInUsd;
        Exp memory oraclePrice = Exp({ mantissa: oracle.getPrice(token()) });
        amountInUsd = mul_ScalarTruncate(oraclePrice, amount_);

        // Load values for the 24-hour window checks
        uint256 currentBlockTimestamp = block.timestamp;
        uint256 lastDayWindowStart = chainIdToLast24HourWindowStart[dstChainId_];
        uint256 transferredInWindow = chainIdToLast24HourTransferred[dstChainId_];
        uint256 maxSingleTransactionLimit = chainIdToMaxSingleTransactionLimit[dstChainId_];
        uint256 maxDailyLimit = chainIdToMaxDailyLimit[dstChainId_];

        // Revert if the amount exceeds the single transaction limit and the recipient is not whitelisted
        require(amountInUsd <= maxSingleTransactionLimit || isWhiteListedUser, "Single Transaction Limit Exceed");

        // Check if the time window has changed (more than 24 hours have passed)
        if (currentBlockTimestamp - lastDayWindowStart > 1 days) {
            transferredInWindow = amountInUsd;
            chainIdToLast24HourWindowStart[dstChainId_] = currentBlockTimestamp;
        } else {
            transferredInWindow += amountInUsd;
        }

        // Revert if the amount exceeds the daily limit and the recipient is not whitelisted
        require(transferredInWindow <= maxDailyLimit || isWhiteListedUser, "Daily Transaction Limit Exceed");

        // Update the amount for the 24-hour window
        chainIdToLast24HourTransferred[dstChainId_] = transferredInWindow;
    }

    function _isEligibleToReceive(uint16 srcChainId_, uint256 receivedAmount_) internal {
        // Check if the sender's address is whitelisted
        bool isWhiteListedUser = whitelist[msg.sender];

        // Calculate the received amount in USD using the oracle price
        uint256 receivedAmountInUsd;
        Exp memory oraclePrice = Exp({ mantissa: oracle.getPrice(address(token())) });
        receivedAmountInUsd = mul_ScalarTruncate(oraclePrice, receivedAmount_);

        uint256 currentBlockTimestamp = block.timestamp;

        // Load values for the 24-hour window checks for receiving
        uint256 lastDayReceiveWindowStart = chainIdToLast24HourReceiveWindowStart[srcChainId_];
        uint256 receivedInWindow = chainIdToLast24HourReceived[srcChainId_];
        uint256 maxSingleReceiveTransactionLimit = chainIdToMaxSingleReceiveTransactionLimit[srcChainId_];
        uint256 maxDailyReceiveLimit = chainIdToMaxDailyReceiveLimit[srcChainId_];

        // Check if the received amount exceeds the single transaction limit and the recipient is not whitelisted
        require(
            receivedAmountInUsd <= maxSingleReceiveTransactionLimit || isWhiteListedUser,
            "Single Transaction Limit Exceed"
        );

        // Check if the time window has changed (more than 24 hours have passed)
        if (currentBlockTimestamp - lastDayReceiveWindowStart > 1 days) {
            receivedInWindow = receivedAmountInUsd;
            chainIdToLast24HourReceiveWindowStart[srcChainId_] = currentBlockTimestamp;
        } else {
            receivedInWindow += receivedAmountInUsd;
        }

        // Revert if the received amount exceeds the daily limit and the recipient is not whitelisted
        require(receivedInWindow <= maxDailyReceiveLimit || isWhiteListedUser, "Daily Transaction Limit Exceed");

        // Update the received amount for the 24-hour window
        chainIdToLast24HourReceived[srcChainId_] = receivedInWindow;
    }

    function _transferFrom(address from_, address to_, uint256 amount_) internal override returns (uint256) {
        uint256 before = innerToken.balanceOf(to_);
        if (from_ == address(this)) {
            innerToken.safeTransfer(to_, amount_);
        } else {
            innerToken.safeTransferFrom(from_, to_, amount_);
        }
        return innerToken.balanceOf(to_) - before;
    }

    function _ld2sdRate() internal view override returns (uint256) {
        return ld2sdRate;
    }
}

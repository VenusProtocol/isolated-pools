pragma solidity 0.8.13;

import { BaseOFTV2 } from "@layerzerolabs/solidity-examples/contracts/token/oft/v2/BaseOFTV2.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract XVSProxyOFTSrc is Pausable, BaseOFTV2 {
    using SafeERC20 for IERC20;

    /**
     * @dev Address of underlying token of this bridge.
     */
    IERC20 internal immutable innerToken;
    /**
     * @notice Conversion of innerToken decimals to shared decimals.
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
     * @notice  Mapping of chain ID to delay in blocks between two consecutive transaction.
     */
    mapping(uint16 => uint256) public chainIdtoDelayBlocks;
    /**
     * @notice  Mapping of chain ID to last sent block.
     */
    mapping(uint16 => uint256) public chainIdToLastSentBlock;
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
     * @notice Emmited when delay is modified.
     */
    event DelayBlocksChanged(uint256 oldDelay, uint256 newDelay);
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
    error DelayBlocksNotPassed();

    constructor(
        address to_,
        uint8 sharedDecimals_,
        address lzEndpoint_
    ) BaseOFTV2(sharedDecimals_, lzEndpoint_) {
        innerToken = IERC20(to_);

        (bool success, bytes memory data) = to_.staticcall(abi.encodeWithSignature("decimals()"));
        require(success, "ProxyOFT: failed to get token decimals");
        uint8 decimals = abi.decode(data, (uint8));

        require(sharedDecimals_ <= decimals, "ProxyOFT: sharedDecimals must be <= decimals");
        ld2sdRate = 10**(decimals - sharedDecimals_);
    }

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Admin function to set the access control address
     * @param newAccessControlAddress_ New address for the access control
     */
    function setAccessControlManager(address newAccessControlAddress_) external onlyOwner {
        require(newAccessControlAddress_ != address(0), "can't be zero address");
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
        require(oracleAddress_ != address(0), "can't be zero address");
        emit OracleChanged(address(oracle), oracleAddress_);
        oracle = ResilientOracleInterface(oracleAddress_);
    }

    /**
     * @notice Sets the limit of single transaction amount
     * @param chainId_ Destination chain id
     * @param limit_ Amount in USD
     */
    function setMaxSingleTransactionLimit(uint16 chainId_, uint256 limit_) external {
        _ensureAllowed("setMaxSingleTransactionLimit(uint16,uint256)");
        emit SetMaxSingleTransactionLimit(chainIdToMaxSingleTransactionLimit[chainId_], limit_);
        chainIdToMaxSingleTransactionLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the limit of daily (24 Hour) transaction amount
     * @param chainId_ Destination chain id
     * @param limit_ Amount in USD
     */
    function setMaxDailyLimit(uint16 chainId_, uint256 limit_) external {
        _ensureAllowed("setMaxSingleTransactionLimit(uint16,uint256)");
        emit SetMaxDailyLimit(chainIdToMaxDailyLimit[chainId_], limit_);
        chainIdToMaxDailyLimit[chainId_] = limit_;
    }

    /**
     * @notice Sets the delay in consecutive transactions.
     * @param chainId_ Destination chain id
     * @param delay_ Delta block
     */
    function setDelayBlock(uint16 chainId_, uint256 delay_) external {
        _ensureAllowed("setDelayBlock(uint16,uiChangednt256)");
        emit DelayBlocksChanged(chainIdtoDelayBlocks[chainId_], delay_);
        chainIdtoDelayBlocks[chainId_] = delay_;
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
        uint16 dstChainId_,
        bytes32,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        require(from_ == _msgSender(), "ProxyOFT: owner is not send caller");
        _isEligibleToSend(from_, dstChainId_, amount_);
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
        amountInUsd = (oraclePrice * amount_) / ld2sdRate;

        uint256 currentBlock = block.timestamp;
        uint256 lastDayWindowStart = chainIdToLast24HourWindowStart[dstChainId_];
        uint256 transferredInWindow = chainIdToLast24HourTransferred[dstChainId_];
        uint256 maxSingleTransactionLimit = chainIdToMaxSingleTransactionLimit[dstChainId_];
        uint256 maxDailyLimit = chainIdToMaxDailyLimit[dstChainId_];
        uint256 delayInBlocks = chainIdtoDelayBlocks[dstChainId_];
        uint256 lastSentBlockNumber = chainIdToLastSentBlock[dstChainId_];

        if (currentBlock - lastSentBlockNumber < delayInBlocks) {
            revert DelayBlocksNotPassed();
        }

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
        chainIdToLastSentBlock[dstChainId_] = currentBlock;
        return;
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

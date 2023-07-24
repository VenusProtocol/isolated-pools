// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
 * @title TokenDebtTracker
 * @author Venus
 * @notice TokenDebtTracker is an abstract contract that handles transfers _out_ of the inheriting contract.
 * If there is an error transferring out (due to any reason, e.g. the token contract restricted the user from
 * receiving incoming transfers), the amount is recorded as a debt that can be claimed later.
 * @dev Note that the inheriting contract keeps some amount of users' tokens on its balance, so be careful when
 * using balanceOf(address(this))!
 */
abstract contract TokenDebtTracker is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Mapping (IERC20Upgradeable token => (address user => uint256 amount)).
     * Tracks failed transfers: when a token transfer fails, we record the
     * amount of the transfer, so that the user can redeem this debt later.
     */
    mapping(IERC20Upgradeable => mapping(address => uint256)) public tokenDebt;

    /**
     * @notice Mapping (IERC20Upgradeable token => uint256 amount) shows how many
     * tokens the contract owes to all users. This is useful for accounting to
     * understand how much of balanceOf(address(this)) is already owed to users.
     */
    mapping(IERC20Upgradeable => uint256) public totalTokenDebt;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[48] private __gap;

    /**
     * @notice Emitted when the contract's debt to the user is increased due to a failed transfer
     * @param token Token address
     * @param user User address
     * @param amount The amount of debt added
     */
    event TokenDebtAdded(address indexed token, address indexed user, uint256 amount);

    /**
     * @notice Emitted when a user claims tokens that the contract owes them
     * @param token Token address
     * @param user User address
     * @param amount The amount transferred
     */
    event TokenDebtClaimed(address indexed token, address indexed user, uint256 amount);

    /**
     * @notice Thrown if the user tries to claim more tokens than they are owed
     * @param token The token the user is trying to claim
     * @param owedAmount The amount of tokens the contract owes to the user
     * @param amount The amount of tokens the user is trying to claim
     */
    error InsufficientDebt(address token, address user, uint256 owedAmount, uint256 amount);

    /**
     * @notice Transfers the tokens we owe to msg.sender, if any
     * @param token The token to claim
     * @param amount_ The amount of tokens to claim (or max uint256 to claim all)
     */
    function claimTokenDebt(IERC20Upgradeable token, uint256 amount_) external {
        uint256 owedAmount = tokenDebt[token][msg.sender];
        uint256 amount = (amount_ == type(uint256).max ? owedAmount : amount_);
        if (amount > owedAmount) {
            revert InsufficientDebt(address(token), msg.sender, owedAmount, amount);
        }
        unchecked {
            // Safe because we revert if amount > owedAmount above
            tokenDebt[token][msg.sender] = owedAmount - amount;
        }
        totalTokenDebt[token] -= amount;
        emit TokenDebtClaimed(address(token), msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    // solhint-disable-next-line func-name-mixedcase
    function __TokenDebtTracker_init() internal onlyInitializing {
        __TokenDebtTracker_init_unchained();
    }

    // solhint-disable-next-line func-name-mixedcase, no-empty-blocks
    function __TokenDebtTracker_init_unchained() internal onlyInitializing {}

    /**
     * @dev Transfers tokens to the recipient, or records the debt if the transfer fails.
     * @param token The token to transfer
     * @param to The recipient of the transfer
     * @param amount The amount to transfer
     */
    function _transferOutOrTrackDebt(
        IERC20Upgradeable token,
        address to,
        uint256 amount
    ) internal {
        // We can't use safeTransfer here because we can't try-catch internal calls
        bool success = _tryTransferOut(token, to, amount);
        if (!success) {
            tokenDebt[token][to] += amount;
            totalTokenDebt[token] += amount;
            emit TokenDebtAdded(address(token), to, amount);
        }
    }

    /**
     * @dev Either transfers tokens to the recepient or returns false. Supports tokens
     *      thet revert or return false to indicate failure, and the non-compliant ones
     *      that do not return any value.
     * @param token The token to transfer
     * @param to The recipient of the transfer
     * @param amount The amount to transfer
     * @return true if the transfer succeeded, false otherwise
     */
    function _tryTransferOut(
        IERC20Upgradeable token,
        address to,
        uint256 amount
    ) private returns (bool) {
        bytes memory callData = abi.encodeCall(token.transfer, (to, amount));

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = address(token).call(callData);
        return success && (returndata.length == 0 || abi.decode(returndata, (bool))) && address(token).code.length > 0;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { VToken } from "../VToken.sol";
import { IComptroller, Action } from "./Interfaces/IComptroller.sol"; // Venus Comptroller interface.
import { RewardDistributorInterface } from "./Interfaces/IRewardDistributor.sol"; // Interface for claiming rewards.
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VenusERC4626
/// @notice ERC4626 wrapper for Venus vTokens, enabling standard ERC4626 vault interactions with Venus Protocol.
contract VenusERC4626 is ERC4626, Ownable {
    using SafeERC20 for ERC20;

    /// @notice Enum representing different actions that can be performed in the vault.
    enum VaultAction {
        DEPOSIT,
        MINT,
        WITHDRAW,
        REDEEM
    }

    /// @notice Error code representing no errors in Venus operations.
    uint256 internal constant NO_ERROR = 0;

    /// @notice The Venus vToken associated with this ERC4626 vault.
    VToken public immutable VTOKEN;

    /// @notice The XVS token contract (Venus governance token).
    ERC20 public immutable XVS;

    /// @notice The Venus Comptroller contract, responsible for market operations.
    IComptroller public immutable COMPTROLLER;

    /// @notice The reward distributor contract for claiming XVS rewards.
    RewardDistributorInterface public immutable REWARD_DISTRIBUTOR;

    /// @notice The recipient of XVS rewards distributed by the Venus Protocol.
    address public immutable REWARD_RECIPIENT;

    /// @notice Tracks the pause state of specific vault actions.
    mapping(VaultAction => bool) private _vaultPaused;

    /// @notice Emitted when rewards are claimed.
    /// @param amount The amount of XVS tokens claimed.
    event ClaimRewards(uint256 amount);

    /// @notice Emitted when a vault action is paused or unpaused.
    /// @param action The vault action that was modified.
    event VaultActionPausedUpdated(VaultAction action, bool state);

    /// @notice Thrown when a Venus protocol call returns an error.
    /// @dev This error is triggered if a Venus operation (such as minting or redeeming vTokens) fails.
    /// @param errorCode The error code returned by the Venus protocol.
    error VenusERC4626__VenusError(uint256 errorCode);

    /// @notice Thrown when a deposit exceeds the maximum allowed limit.
    /// @dev This error is triggered if the deposit amount is greater than `maxDeposit(receiver)`.
    error ERC4626__DepositMoreThanMax();

    /// @notice Thrown when a mint operation exceeds the maximum allowed limit.
    /// @dev This error is triggered if the mint amount is greater than `maxMint(receiver)`.
    error ERC4626__MintMoreThanMax();

    /// @notice Thrown when a withdrawal exceeds the maximum available assets.
    /// @dev This error is triggered if the withdrawal amount is greater than `maxWithdraw(owner)`.
    error ERC4626__WithdrawMoreThanMax();

    /// @notice Thrown when a redemption exceeds the maximum redeemable shares.
    /// @dev This error is triggered if the redemption amount is greater than `maxRedeem(owner)`.
    error ERC4626__RedeemMoreThanMax();

    /// @notice Thrown when a vault action is paused.
    /// @param action The paused vault action that triggered the error.
    error VaultActionPaused(VaultAction action);

    /// @notice Constructor to initialize the Venus ERC4626 vault.
    /// @param asset_ The underlying ERC20 asset.
    /// @param xvs_ The XVS token contract.
    /// @param vToken_ The Venus vToken contract.
    /// @param rewardRecipient_ The address receiving the XVS rewards.
    /// @param comptroller_ The Venus Comptroller contract.
    /// @param rewardDistributor_ The reward distributor contract.
    constructor(
        ERC20 asset_,
        ERC20 xvs_,
        VToken vToken_,
        address rewardRecipient_,
        IComptroller comptroller_,
        RewardDistributorInterface rewardDistributor_
    ) ERC4626(asset_) ERC20(_generateVaultName(asset_), _generateVaultSymbol(asset_)) {
        VTOKEN = vToken_;
        XVS = xvs_;
        COMPTROLLER = comptroller_;
        REWARD_DISTRIBUTOR = rewardDistributor_;
        REWARD_RECIPIENT = rewardRecipient_;
    }

    /// @notice Claims XVS rewards from the reward distributor and transfers them to the reward recipient.
    /// @dev Calls the `claimRewardToken` function on the reward distributor contract to claim rewards.
    ///      If there is any XVS balance after claiming, it is transferred to the predefined reward recipient.
    ///      Emits a `ClaimRewards` event with the amount of XVS claimed.
    function claimRewards() external {
        REWARD_DISTRIBUTOR.claimRewardToken(address(this));
        uint256 xvsBalance = XVS.balanceOf(address(this));

        if (xvsBalance > 0) {
            XVS.safeTransfer(REWARD_RECIPIENT, xvsBalance);
        }
        emit ClaimRewards(xvsBalance);
    }

    /// @notice Sets the paused state of a specific vault action.
    /// @dev This function can only be called by the contract owner.
    /// @param action The vault action to pause or unpause.
    /// @param state The new paused state (true to pause, false to unpause).
    /// Emits a {VaultActionPauseUpdated} event.
    function setVaultActionPaused(VaultAction action, bool state) external onlyOwner {
        _vaultPaused[action] = state;
        emit VaultActionPausedUpdated(action, state);
    }

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        _checkVaultActionPaused(VaultAction.DEPOSIT);
        if (assets > maxDeposit(receiver)) {
            revert ERC4626__DepositMoreThanMax();
        }

        uint256 shares = previewDeposit(assets);
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets, shares);
        return shares;
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override returns (uint256) {
        _checkVaultActionPaused(VaultAction.MINT);
        if (shares > maxMint(receiver)) {
            revert ERC4626__MintMoreThanMax();
        }

        uint256 assets = previewMint(shares);
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets, shares);
        return assets;
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address withdrawer) public override returns (uint256) {
        _checkVaultActionPaused(VaultAction.WITHDRAW);
        if (assets > maxWithdraw(withdrawer)) {
            revert ERC4626__WithdrawMoreThanMax();
        }

        uint256 shares = previewWithdraw(assets);
        beforeWithdraw(assets, shares);
        _withdraw(_msgSender(), receiver, withdrawer, assets, shares);
        return shares;
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address redeemer) public override returns (uint256) {
        _checkVaultActionPaused(VaultAction.REDEEM);
        if (shares > maxRedeem(redeemer)) {
            revert ERC4626__RedeemMoreThanMax();
        }

        uint256 assets = previewRedeem(shares);
        beforeWithdraw(assets, shares);
        _withdraw(_msgSender(), receiver, redeemer, assets, shares);
        return assets;
    }

    /// @notice Returns the maximum deposit allowed based on Venus supply caps.
    /// @dev If minting is paused or the supply cap is reached, returns 0.
    /// @param /*account*/ The address of the account.
    /// @return The maximum amount of assets that can be deposited.
    function maxDeposit(address /*account*/) public view virtual override returns (uint256) {
        if (COMPTROLLER.actionPaused(address(VTOKEN), Action.MINT)) {
            return 0;
        }

        uint256 supplyCap = COMPTROLLER.supplyCaps(address(VTOKEN));
        uint256 totalSupply_ = VTOKEN.totalSupply();
        return supplyCap > totalSupply_ ? supplyCap - totalSupply_ : 0;
    }

    /// @notice Returns the maximum amount of shares that can be minted.
    /// @dev This is derived from the maximum deposit amount converted to shares.
    /// @param /*account*/ The address of the account.
    /// @return The maximum number of shares that can be minted.
    function maxMint(address /*account*/) public view override returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    /// @notice Returns the maximum amount that can be withdrawn.
    /// @dev The withdrawable amount is limited by the available cash in the vault.
    /// @param receiver The address of the account withdrawing.
    /// @return The maximum amount of assets that can be withdrawn.
    function maxWithdraw(address receiver) public view virtual override returns (uint256) {
        uint256 cash = VTOKEN.getCash();
        uint256 assetsBalance = convertToAssets(balanceOf(receiver));
        return cash < assetsBalance ? cash : assetsBalance;
    }

    /// @notice Returns the maximum amount of shares that can be redeemed.
    /// @dev Redemption is limited by the available cash in the vault.
    /// @param receiver The address of the account redeeming.
    /// @return The maximum number of shares that can be redeemed.
    function maxRedeem(address receiver) public view override returns (uint256) {
        uint256 cash = VTOKEN.getCash();
        uint256 cashInShares = convertToShares(cash);
        uint256 shareBalance = balanceOf(receiver);
        return cashInShares < shareBalance ? cashInShares : shareBalance;
    }

    /// @notice Redeems underlying assets before withdrawing from the vault.
    /// @dev Calls `redeemUnderlying` on the VTOKEN contract. Reverts on error.
    /// @param assets The amount of underlying assets to redeem.
    /// @param /*shares*/ The number of shares being withdrawn.
    function beforeWithdraw(uint256 assets, uint256 /*shares*/) internal {
        uint256 errorCode = VTOKEN.redeemUnderlying(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// @notice Mints vTokens after depositing assets.
    /// @dev Calls `mint` on the VTOKEN contract. Reverts on error.
    /// @param assets The amount of underlying assets to deposit.
    /// @param /*shares*/ The number of shares being minted (unused).
    function afterDeposit(uint256 assets, uint256 /*shares*/) internal {
        ERC20(asset()).safeApprove(address(VTOKEN), assets);
        uint256 errorCode = VTOKEN.mint(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// ERC20 metadata generation
    function _generateVaultName(ERC20 asset_) internal view returns (string memory) {
        return string(abi.encodePacked("ERC4626-Wrapped Venus ", asset_.name()));
    }

    function _generateVaultSymbol(ERC20 asset_) internal view returns (string memory) {
        return string(abi.encodePacked("v4626", asset_.symbol()));
    }

    /// @notice Checks if a specific vault action is paused.
    /// @dev Reverts if the given vault action is paused.
    /// @param action The vault action to check (e.g., deposit, mint, withdraw, redeem).
    function _checkVaultActionPaused(VaultAction action) private view {
        if (_vaultPaused[action]) {
            revert VaultActionPaused(action);
        }
    }
}

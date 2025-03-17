// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ensureNonzeroAddress } from ".././lib/validators.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { VToken } from "../VToken.sol";
import { IComptroller, Action } from "./Interfaces/IComptroller.sol";
import { RewardsDistributor } from ".././Rewards/RewardsDistributor.sol";
import { IProtocolShareReserve } from "./Interfaces/IProtocolShareReserve.sol";

/// @title VenusERC4626
/// @notice ERC4626 wrapper for Venus vTokens, enabling standard ERC4626 vault interactions with Venus Protocol.
contract VenusERC4626 is ERC4626 {
    using SafeERC20 for ERC20;

    /// @notice Error code representing no errors in Venus operations.
    uint256 internal constant NO_ERROR = 0;

    /// @notice The Venus vToken associated with this ERC4626 vault.
    VToken public immutable VTOKEN;

    /// @notice The Venus Comptroller contract, responsible for market operations.
    IComptroller public immutable COMPTROLLER;

    /// @notice The recipient of rewards distributed by the Venus Protocol.
    address public immutable REWARD_RECIPIENT;

    /// @notice Emitted when rewards are claimed.
    /// @param amount The amount of reward tokens claimed.
    event ClaimRewards(uint256 amount);

    // Event to log updateAssetsState failures
    event UpdateAssetsStateFailed(address indexed token, uint256 amount, string reason);

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

    /// @notice Constructor to initialize the Venus ERC4626 vault.
    /// @param vToken_ The Venus vToken contract.
    /// @param rewardRecipient_ The address receiving the rewards.
    constructor(
        VToken vToken_,
        address rewardRecipient_
    )
        ERC4626(ERC20(vToken_.underlying()))
        ERC20(_generateVaultName(ERC20(vToken_.underlying())), _generateVaultSymbol(ERC20(vToken_.underlying())))
    {
        ensureNonzeroAddress(address(vToken_));
        ensureNonzeroAddress(rewardRecipient_);

        VTOKEN = vToken_;
        COMPTROLLER = IComptroller(address(vToken_.comptroller()));
        REWARD_RECIPIENT = rewardRecipient_;
    }

    /// @notice Claims rewards from all reward distributors associated with the VToken and transfers them to the reward recipient.
    /// @dev Iterates through all reward distributors fetched from the comptroller, claims rewards, and transfers them if available.
    function claimRewards() external {
        RewardsDistributor[] memory rewardDistributors = COMPTROLLER.getRewardDistributors();

        for (uint256 i = 0; i < rewardDistributors.length; i++) {
            RewardsDistributor rewardDistributor = rewardDistributors[i];
            IERC20 rewardToken = IERC20(address(rewardDistributor.rewardToken()));

            VToken[] memory vTokens = new VToken[](1);
            vTokens[0] = VTOKEN;
            RewardsDistributor(rewardDistributor).claimRewardToken(address(this), vTokens);
            uint256 rewardBalance = rewardToken.balanceOf(address(this));

            if (rewardBalance > 0) {
                SafeERC20.safeTransfer(rewardToken, REWARD_RECIPIENT, rewardBalance);

                // Try to update the asset state on the recipient if reward recipient is a protocol share reserve
                if (REWARD_RECIPIENT.code.length != 0) {
                    IProtocolShareReserve(REWARD_RECIPIENT).updateAssetsState(
                        address(COMPTROLLER),
                        address(rewardToken),
                        IProtocolShareReserve.IncomeType.ERC4626_WRAPPER_REWARDS
                    );
                }
            }
            emit ClaimRewards(rewardBalance);
        }
    }

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (assets > maxDeposit(receiver)) {
            revert ERC4626__DepositMoreThanMax();
        }

        uint256 shares = previewDeposit(assets);
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets);
        return shares;
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override returns (uint256) {
        if (shares > maxMint(receiver)) {
            revert ERC4626__MintMoreThanMax();
        }

        uint256 assets = previewMint(shares);
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets);
        return assets;
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256) {
        if (assets > maxWithdraw(owner)) {
            revert ERC4626__WithdrawMoreThanMax();
        }

        uint256 shares = previewWithdraw(assets);
        beforeWithdraw(assets);
        _withdraw(_msgSender(), receiver, owner, assets, shares);
        return shares;
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address redeemer) public override returns (uint256) {
        if (shares > maxRedeem(redeemer)) {
            revert ERC4626__RedeemMoreThanMax();
        }

        uint256 assets = previewRedeem(shares);
        beforeWithdraw(assets);
        _withdraw(_msgSender(), receiver, redeemer, assets, shares);
        return assets;
    }

    function totalAssets() public view virtual override returns (uint256) {
        return (VTOKEN.balanceOf(address(this)) * VTOKEN.exchangeRateStored()) / 1e18;
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
        uint256 totalSupply_ = (VTOKEN.totalSupply() * VTOKEN.exchangeRateStored()) / 1e18;
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
        if (COMPTROLLER.actionPaused(address(VTOKEN), Action.REDEEM)) {
            return 0;
        }

        uint256 cash = VTOKEN.getCash();
        uint256 assetsBalance = convertToAssets(balanceOf(receiver));
        return cash < assetsBalance ? cash : assetsBalance;
    }

    /// @notice Returns the maximum amount of shares that can be redeemed.
    /// @dev Redemption is limited by the available cash in the vault.
    /// @param receiver The address of the account redeeming.
    /// @return The maximum number of shares that can be redeemed.
    function maxRedeem(address receiver) public view override returns (uint256) {
        if (COMPTROLLER.actionPaused(address(VTOKEN), Action.REDEEM)) {
            return 0;
        }

        uint256 cash = VTOKEN.getCash();
        uint256 cashInShares = convertToShares(cash);
        uint256 shareBalance = balanceOf(receiver);
        return cashInShares < shareBalance ? cashInShares : shareBalance;
    }

    /// @notice Redeems underlying assets before withdrawing from the vault.
    /// @dev Calls `redeemUnderlying` on the VTOKEN contract. Reverts on error.
    /// @param assets The amount of underlying assets to redeem.
    function beforeWithdraw(uint256 assets) internal {
        uint256 errorCode = VTOKEN.redeemUnderlying(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// @notice Mints vTokens after depositing assets.
    /// @dev Calls `mint` on the VTOKEN contract. Reverts on error.
    /// @param assets The amount of underlying assets to deposit.
    function afterDeposit(uint256 assets) internal {
        ERC20(asset()).safeApprove(address(VTOKEN), assets);
        uint256 errorCode = VTOKEN.mint(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// @dev Override `_decimalsOffset` to normalize decimals to 18 for all VenusERC4626 vaults.
    function _decimalsOffset() internal view virtual override returns (uint8) {
        return 18 - ERC20(asset()).decimals();
    }

    /// ERC20 metadata generation
    function _generateVaultName(ERC20 asset_) internal view returns (string memory) {
        return string(abi.encodePacked("ERC4626-Wrapped Venus ", asset_.name()));
    }

    function _generateVaultSymbol(ERC20 asset_) internal view returns (string memory) {
        return string(abi.encodePacked("v4626", asset_.symbol()));
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { VToken } from "../VToken.sol";
import { IComptroller, Action } from "./Interfaces/IComptroller.sol"; // Venus Comptroller interface.
import { RewardDistributorInterface } from "./Interfaces/IRewardDistributor.sol"; // Interface for claiming rewards.

/// @title VenusERC4626
/// @notice ERC4626 wrapper for Venus vTokens, enabling standard ERC4626 vault interactions with Venus Protocol.
contract VenusERC4626 is ERC4626 {
    using SafeERC20 for ERC20;

    /// @notice Error code representing no errors in Venus operations.
    uint256 internal constant NO_ERROR = 0;

    /// @notice The Venus vToken associated with this ERC4626 vault.
    VToken public immutable vToken;

    /// @notice The XVS token contract (Venus governance token).
    ERC20 public immutable xvs;

    /// @notice The Venus Comptroller contract, responsible for market operations.
    IComptroller public immutable comptroller;

    /// @notice The reward distributor contract for claiming XVS rewards.
    RewardDistributorInterface public immutable rewardDistributor;

    /// @notice The recipient of XVS rewards distributed by the Venus Protocol.
    address public immutable rewardRecipient;

    /// @notice Emitted when rewards are claimed.
    /// @param amount The amount of XVS tokens claimed.
    event ClaimRewards(uint256 amount);

    /// @notice Thrown when a call to the Venus Protocol returns an error.
    /// @param errorCode The error code returned by Venus.
    error VenusERC4626__VenusError(uint256 errorCode);

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
        vToken = vToken_;
        xvs = xvs_;
        comptroller = comptroller_;
        rewardDistributor = rewardDistributor_;
        rewardRecipient = rewardRecipient_;
    }

    /// @notice Claims XVS rewards via the RewardDistributor and transfers them to the reward recipient.
    function claimRewards() external {
        rewardDistributor.claimRewardToken(address(this));
        uint256 xvsBalance = xvs.balanceOf(address(this));

        if (xvsBalance > 0) {
            xvs.safeTransfer(rewardRecipient, xvsBalance);
        }
        emit ClaimRewards(xvsBalance);
    }

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        require(assets <= maxDeposit(receiver), "ERC4626: deposit more than max");
        uint256 shares = previewDeposit(assets);
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets, shares);
        return shares;
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override returns (uint256) {
        require(shares <= maxMint(receiver), "ERC4626: mint more than max");
        uint256 assets = previewMint(shares);
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets, shares);
        return assets;
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner) public virtual override returns (uint256) {
        require(assets <= maxWithdraw(owner), "ERC4626: withdraw more than max");
        uint256 shares = previewWithdraw(assets);
        beforeWithdraw(assets, shares);
        _withdraw(_msgSender(), receiver, owner, assets, shares);
        return shares;
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address owner) public virtual override returns (uint256) {
        require(shares <= maxRedeem(owner), "ERC4626: redeem more than max");
        uint256 assets = previewRedeem(shares);
        beforeWithdraw(assets, shares);
        _withdraw(_msgSender(), receiver, owner, assets, shares);
        return assets;
    }

    /// @notice Returns the total assets held by the vault in terms of the underlying asset.
    function totalAssets() public view virtual override returns (uint256) {
        return (vToken.balanceOf(address(this)) * vToken.exchangeRateStored()) / 1e18;
    }

    /// @notice Returns the maximum deposit allowed based on Venus supply caps.
    function maxDeposit(address) public view virtual override returns (uint256) {
        if (comptroller.actionPaused(address(vToken), Action.MINT)) {
            return 0;
        }
        uint256 supplyCap = comptroller.supplyCaps(address(vToken));
        uint256 totalSupply_ = vToken.totalSupply();
        return supplyCap > totalSupply_ ? supplyCap - totalSupply_ : 0;
    }

    /// @notice Returns the maximum amount of shares that can be minted.
    function maxMint(address) public view override returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    /// @notice Returns the maximum amount that can be withdrawn.
    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        uint256 cash = vToken.getCash();
        uint256 assetsBalance = convertToAssets(balanceOf(owner));
        return cash < assetsBalance ? cash : assetsBalance;
    }

    /// @notice Returns the maximum amount of shares that can be redeemed.
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 cash = vToken.getCash();
        uint256 cashInShares = convertToShares(cash);
        uint256 shareBalance = balanceOf(owner);
        return cashInShares < shareBalance ? cashInShares : shareBalance;
    }

    /// @notice Redeems underlying assets before withdrawing from the vault.
    function beforeWithdraw(uint256 assets, uint256 /*shares*/) internal {
        uint256 errorCode = vToken.redeemUnderlying(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// @notice Mints vTokens after depositing assets.
    function afterDeposit(uint256 assets, uint256 /*shares*/) internal {
        ERC20(asset()).safeApprove(address(vToken), assets);
        uint256 errorCode = vToken.mint(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// ERC20 metadata generation
    function _generateVaultName(ERC20 asset_) internal view virtual returns (string memory) {
        return string(abi.encodePacked("ERC4626-Wrapped Venus ", asset_.symbol()));
    }

    function _generateVaultSymbol(ERC20 asset_) internal view virtual returns (string memory) {
        return string(abi.encodePacked("v4626", asset_.symbol()));
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "solmate/src/tokens/ERC20.sol";
import { ERC4626 } from "solmate/src/tokens/ERC4626.sol";
import { SafeTransferLib } from "solmate/src/utils/SafeTransferLib.sol";
import { VToken } from "../VToken.sol";
import { IComptroller, Action } from "./Interfaces/IComptroller.sol"; // Venus Comptroller interface.
import { RewardDistributorInterface } from "./Interfaces/IRewardDistributor.sol"; // Interface for claiming rewards.

/// @title VenusERC4626
/// @notice ERC4626 wrapper for Venus vTokens
contract VenusERC4626 is ERC4626 {
    using SafeTransferLib for ERC20;

    uint256 internal constant NO_ERROR = 0;

    /// @notice The Venus vToken
    VToken public immutable vToken;

    /// @notice The XVS token contract
    ERC20 public immutable xvs;

    /// @notice The Venus Comptroller contract
    IComptroller public immutable comptroller;

    /// @notice The reward distributor contract
    RewardDistributorInterface public immutable rewardDistributor;

    /// @notice The recipient of XVS rewards
    address public immutable rewardRecipient;

    // Events
    event ClaimRewards(uint256 amount);

    /// @notice Thrown when a call to Venus returned an error.
    /// @param errorCode The error code returned by Venus
    error VenusERC4626__VenusError(uint256 errorCode);

    /// Constructor
    constructor(
        ERC20 asset_,
        ERC20 xvs_,
        VToken vToken_,
        address rewardRecipient_,
        IComptroller comptroller_,
        RewardDistributorInterface rewardDistributor_
    ) ERC4626(asset_, _generateVaultName(asset_), _generateVaultSymbol(asset_)) {
        vToken = vToken_;
        xvs = xvs_;
        comptroller = comptroller_;
        rewardDistributor = rewardDistributor_;
        rewardRecipient = rewardRecipient_;
    }

    /// @notice Claims XVS rewards via the RewardDistributor
    function claimRewards() external {
        rewardDistributor.claimRewardToken(address(this));
        uint256 xvsBalance = xvs.balanceOf(address(this));

        if (xvsBalance > 0) {
            xvs.safeTransfer(rewardRecipient, xvsBalance);
        }
        emit ClaimRewards(xvsBalance);
    }

    /// ERC4626 Overrides
    function totalAssets() public view virtual override returns (uint256) {
        return (vToken.balanceOf(address(this)) * vToken.exchangeRateStored()) / 1e18;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (comptroller.actionPaused(address(vToken), Action.MINT)) {
            return 0;
        }

        uint256 supplyCap = comptroller.supplyCaps(address(vToken)); // Fetch the supply cap
        uint256 totalSupply_ = vToken.totalSupply(); // Total vTokens issued
        uint256 supplyLeft = supplyCap > totalSupply_ ? supplyCap - totalSupply : 0; // Remaining supply space

        return supplyLeft;
    }

    function maxMint(address) public view override returns (uint256) {
        return convertToShares(maxDeposit(address(0))); // Convert asset amount to shares
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 cash = vToken.getCash();
        uint256 assetsBalance = convertToAssets(balanceOf[owner]);
        return cash < assetsBalance ? cash : assetsBalance;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 cash = vToken.getCash();
        uint256 cashInShares = convertToShares(cash);
        uint256 shareBalance = balanceOf[owner];
        return cashInShares < shareBalance ? cashInShares : shareBalance;
    }

    function beforeWithdraw(uint256 assets, uint256 /*shares*/) internal virtual override {
        /// Withdraw assets from Venus

        uint256 errorCode = vToken.redeemUnderlying(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    function afterDeposit(uint256 assets, uint256 /*shares*/) internal virtual override {
        /// Deposit assets into Compound

        // approve to vToken
        asset.safeApprove(address(vToken), assets);

        // deposit into vToken
        uint256 errorCode = vToken.mint(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// ERC20 metadata generation
    function _generateVaultName(ERC20 asset_) internal view virtual returns (string memory vaultName) {
        vaultName = string(abi.encodePacked("ERC4626-Wrapped Venus ", asset_.symbol()));
    }

    function _generateVaultSymbol(ERC20 asset_) internal view virtual returns (string memory vaultSymbol) {
        return string(abi.encodePacked("v4626", asset_.symbol()));
    }
}

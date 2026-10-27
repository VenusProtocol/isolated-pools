// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev An ERC-4626 Hub stand-in that can be paused, capped on deposits, limited in what it pays per call, made to
///   revert deposits without data, made to mint fee shares once per block before paying, as the Hub accrues its fees,
///   and given an exit fee rounded like the Hub's: down in `previewRedeem`, up in `maxWithdraw` and `previewWithdraw`
contract MockLiquidityHub is ERC4626 {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    bool public hubPaused;
    bool public revertWithoutData;
    uint256 public redeemFeeBps;
    uint256 public feeSharesPerBlock;
    uint256 public lastFeeBlock;
    uint256 public depositCap = type(uint256).max;
    uint256 public liquidity = type(uint256).max;

    constructor(IERC20 asset_) ERC20("Mock Hub", "mHUB") ERC4626(asset_) {}

    function setPaused(bool paused_) external {
        hubPaused = paused_;
    }

    function setDepositCap(uint256 depositCap_) external {
        depositCap = depositCap_;
    }

    function setLiquidity(uint256 liquidity_) external {
        liquidity = liquidity_;
    }

    function setFeeSharesPerBlock(uint256 feeSharesPerBlock_) external {
        feeSharesPerBlock = feeSharesPerBlock_;
    }

    function lose(uint256 amount) external {
        IERC20(asset()).safeTransfer(address(0xdead), amount);
    }

    function setRevertWithoutData(bool revertWithoutData_) external {
        revertWithoutData = revertWithoutData_;
    }

    function setRedeemFeeBps(uint256 redeemFeeBps_) external {
        redeemFeeBps = redeemFeeBps_;
    }

    function accrueFees() public {
        require(!hubPaused, "paused");
        if (block.number != lastFeeBlock) {
            lastFeeBlock = block.number;
            _mint(address(0xfee), feeSharesPerBlock);
        }
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (revertWithoutData) revert();
        return super.deposit(assets, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256) {
        accrueFees();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override returns (uint256) {
        accrueFees();
        return super.redeem(shares, receiver, owner);
    }

    function maxDeposit(address) public view override returns (uint256) {
        return hubPaused ? 0 : depositCap;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        if (hubPaused) return 0;
        uint256 gross = super.maxWithdraw(owner);
        uint256 assets = gross - (gross * redeemFeeBps + BPS - 1) / BPS;
        return assets < liquidity ? assets : liquidity;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        if (hubPaused) return 0;
        uint256 shares = super.maxRedeem(owner);
        if (liquidity == type(uint256).max) return shares;
        uint256 liquidShares = convertToShares(liquidity);
        return shares < liquidShares ? shares : liquidShares;
    }

    function previewRedeem(uint256 shares) public view override returns (uint256) {
        uint256 assets = super.previewRedeem(shares);
        return assets - (assets * redeemFeeBps) / BPS;
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        uint256 net = BPS - redeemFeeBps;
        return super.previewWithdraw(assets + (assets * redeemFeeBps + net - 1) / net);
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import { ApproveOrRevert } from "./lib/ApproveOrRevert.sol";
import { Comptroller } from "./Comptroller.sol";
import { Action } from "./ComptrollerInterface.sol";
import { VToken } from "./VToken.sol";

contract WUSDMLiquidator is Ownable2StepUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ApproveOrRevert for IERC20Upgradeable;

    struct OriginalConfig {
        uint256 minLiquidatableCollateral;
        uint256 closeFactor;
        uint256 wUSDMCollateralFactor;
        uint256 wUSDMLiquidationThreshold;
        uint256 vWUSDMProtocolSeizeShare;
        uint256 vWETHProtocolSeizeShare;
        uint256 vUSDCEProtocolSeizeShare;
        uint256 vUSDTProtocolSeizeShare;
    }

    OriginalConfig private _originalConfig;

    ResilientOracleInterface public constant ORACLE =
        ResilientOracleInterface(0xDe564a4C887d5ad315a19a96DC81991c98b12182);
    Comptroller public constant COMPTROLLER = Comptroller(0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1);
    VToken public constant VWUSDM = VToken(0x183dE3C349fCf546aAe925E1c7F364EA6FB4033c);
    VToken public constant VWETH = VToken(0x1Fa916C27c7C2c4602124A14C77Dbb40a5FF1BE8);
    VToken public constant VUSDCE = VToken(0x1aF23bD57c62A99C59aD48236553D0Dd11e49D2D);
    VToken public constant VUSDT = VToken(0x69cDA960E3b20DFD480866fFfd377Ebe40bd0A46);

    uint256 public constant LIQUIDATION_INCENTIVE = 1.1e18;

    address public constant A2 = 0x4C0e4B3e6c5756fb31886a0A01079701ffEC0561;
    address public constant A3 = 0x924EDEd3D010b3F20009b872183eec48D0111265;
    address public constant A4 = 0x2B379d8c90e02016658aD00ba2566F55E814C369;
    address public constant A5 = 0xfffAB9120d9Df39EEa07063F6465a0aA45a80C52;

    IERC20Upgradeable public immutable WUSDM;
    IERC20Upgradeable public immutable WETH;
    IERC20Upgradeable public immutable USDCE;
    IERC20Upgradeable public immutable USDT;

    /// @notice Emitted when token is swept from the contract
    event SweepToken(address indexed token, address indexed receiver, uint256 amount);

    constructor() {
        WUSDM = IERC20Upgradeable(VWUSDM.underlying());
        WETH = IERC20Upgradeable(VWETH.underlying());
        USDCE = IERC20Upgradeable(VUSDCE.underlying());
        USDT = IERC20Upgradeable(VUSDT.underlying());
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable2Step_init();
    }

    function run() external {
        uint256 wusdmPrice = ORACLE.getPrice(address(WUSDM));
        uint256 vwUSDMExchangeRate = VWUSDM.exchangeRateCurrent();

        _configureMarkets();
        _supplyCollateral();
        _borrowWETHAndLiquidateBorrowers(wusdmPrice, vwUSDMExchangeRate);
        _borrowUSDCeAndLiquidateBorrowers(wusdmPrice, vwUSDMExchangeRate);
        _borrowUSDTAndLiquidateBorrowers(wusdmPrice, vwUSDMExchangeRate);
        _restoreOriginalConfiguration();
    }

    /**
     * @notice Sweeps the input token address tokens from the contract and sends them to the owner
     * @param token Address of the token
     * @custom:event SweepToken emits on success
     * @custom:access Controlled by Governance
     */
    function sweepToken(IERC20Upgradeable token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));

        if (balance > 0) {
            address owner_ = owner();
            token.safeTransfer(owner_, balance);
            emit SweepToken(address(token), owner_, balance);
        }
    }

    function _configureMarkets() internal {
        (, uint256 wUSDMCollateralFactor, uint256 wUSDMLiquidationThreshold) = COMPTROLLER.markets(address(VWUSDM));
        _originalConfig = OriginalConfig({
            minLiquidatableCollateral: COMPTROLLER.minLiquidatableCollateral(),
            closeFactor: COMPTROLLER.closeFactorMantissa(),
            wUSDMCollateralFactor: wUSDMCollateralFactor,
            wUSDMLiquidationThreshold: wUSDMLiquidationThreshold,
            vWUSDMProtocolSeizeShare: VWUSDM.protocolSeizeShareMantissa(),
            vWETHProtocolSeizeShare: VWETH.protocolSeizeShareMantissa(),
            vUSDCEProtocolSeizeShare: VUSDCE.protocolSeizeShareMantissa(),
            vUSDTProtocolSeizeShare: VUSDT.protocolSeizeShareMantissa()
        });
        COMPTROLLER.setMinLiquidatableCollateral(0);
        COMPTROLLER.setCloseFactor(1e18);
        COMPTROLLER.setCollateralFactor(VWUSDM, 0.78e18, 0.78e18);
        VToken[] memory markets = new VToken[](1);
        Action[] memory actions = new Action[](2);
        markets[0] = VWUSDM;
        actions[0] = Action.MINT;
        actions[1] = Action.ENTER_MARKET;
        COMPTROLLER.setActionsPaused(markets, actions, false);
        VWUSDM.setProtocolSeizeShare(0);
        VWETH.setProtocolSeizeShare(0);
        VUSDCE.setProtocolSeizeShare(0);
        VUSDT.setProtocolSeizeShare(0);
    }

    function _restoreOriginalConfiguration() internal {
        COMPTROLLER.setMinLiquidatableCollateral(_originalConfig.minLiquidatableCollateral);
        COMPTROLLER.setCloseFactor(_originalConfig.closeFactor);
        COMPTROLLER.setCollateralFactor(
            VWUSDM,
            _originalConfig.wUSDMCollateralFactor,
            _originalConfig.wUSDMLiquidationThreshold
        );
        VToken[] memory markets = new VToken[](1);
        Action[] memory actions = new Action[](2);
        markets[0] = VWUSDM;
        actions[0] = Action.MINT;
        actions[1] = Action.ENTER_MARKET;
        COMPTROLLER.setActionsPaused(markets, actions, true);
        VWUSDM.setProtocolSeizeShare(_originalConfig.vWUSDMProtocolSeizeShare);
        VWETH.setProtocolSeizeShare(_originalConfig.vWETHProtocolSeizeShare);
        VUSDCE.setProtocolSeizeShare(_originalConfig.vUSDCEProtocolSeizeShare);
        VUSDT.setProtocolSeizeShare(_originalConfig.vUSDTProtocolSeizeShare);
        // Get some gas refunds for zeroing out storage
        _originalConfig = OriginalConfig(0, 0, 0, 0, 0, 0, 0, 0);
    }

    function _supplyCollateral() internal {
        uint256 amount = WUSDM.balanceOf(address(this));
        WUSDM.approveOrRevert(address(VWUSDM), amount);
        VWUSDM.mint(amount);
        WUSDM.approveOrRevert(address(VWUSDM), 0);
        address[] memory markets = new address[](1);
        markets[0] = address(VWUSDM);
        COMPTROLLER.enterMarkets(markets);
    }

    function _borrowWETHAndLiquidateBorrowers(uint256 wusdmPrice, uint256 vwUSDMExchangeRate) internal {
        uint256 a2Debt = _getDebt(VWETH, A2);
        _borrow(VWETH, a2Debt);
        WETH.approveOrRevert(address(VWETH), a2Debt);
        uint256 ratio = _getBorrowedTokensToCollateralVTokensRatio(VWETH, wusdmPrice, vwUSDMExchangeRate);
        a2Debt = _liquidateAsMuchAsPossible(A2, a2Debt, VWETH, VWUSDM, ratio);
        _repay(A2, VWETH, a2Debt > 1 ? a2Debt - 1 : 0);
        WETH.approveOrRevert(address(VWETH), 0);
    }

    function _borrowUSDCeAndLiquidateBorrowers(uint256 wusdmPrice, uint256 vwUSDMExchangeRate) internal {
        uint256 a3Debt = _getDebt(VUSDCE, A3);
        uint256 a4Debt = _getDebt(VUSDCE, A4);
        uint256 a5Debt = _getDebt(VUSDCE, A5);
        uint256 totalRepayment = a3Debt + a4Debt + a5Debt;

        _borrow(VUSDCE, totalRepayment);
        USDCE.approveOrRevert(address(VUSDCE), totalRepayment);
        uint256 ratio = _getBorrowedTokensToCollateralVTokensRatio(VUSDCE, wusdmPrice, vwUSDMExchangeRate);
        a3Debt = _liquidateAsMuchAsPossible(A3, a3Debt, VUSDCE, VWUSDM, ratio);
        a4Debt = _liquidateAsMuchAsPossible(A4, a4Debt, VUSDCE, VWUSDM, ratio);
        a5Debt = _liquidateAsMuchAsPossible(A5, a5Debt, VUSDCE, VWUSDM, ratio);
        _repay(A3, VUSDCE, a3Debt > 1 ? a3Debt - 1 : 0);
        _repay(A4, VUSDCE, a4Debt > 1 ? a4Debt - 1 : 0);
        _repay(A5, VUSDCE, a5Debt > 1 ? a5Debt - 1 : 0);
        USDCE.approveOrRevert(address(VUSDCE), 0);
    }

    function _borrowUSDTAndLiquidateBorrowers(uint256 wusdmPrice, uint256 vwUSDMExchangeRate) internal {
        uint256 a3Debt = _getDebt(VUSDT, A3);
        uint256 a4Debt = _getDebt(VUSDT, A4);
        uint256 a5Debt = _getDebt(VUSDT, A5);
        uint256 totalRepayment = a3Debt + a4Debt + a5Debt;

        _borrow(VUSDT, totalRepayment);
        USDT.approveOrRevert(address(VUSDT), totalRepayment);
        uint256 ratio = _getBorrowedTokensToCollateralVTokensRatio(VUSDT, wusdmPrice, vwUSDMExchangeRate);
        a3Debt = _liquidateAsMuchAsPossible(A3, a3Debt, VUSDT, VWUSDM, ratio);
        a4Debt = _liquidateAsMuchAsPossible(A4, a4Debt, VUSDT, VWUSDM, ratio);
        a5Debt = _liquidateAsMuchAsPossible(A5, a5Debt, VUSDT, VWUSDM, ratio);
        _repay(A3, VUSDT, a3Debt > 1 ? a3Debt - 1 : 0);
        _repay(A4, VUSDT, a4Debt > 1 ? a4Debt - 1 : 0);
        _repay(A5, VUSDT, a5Debt > 1 ? a5Debt - 1 : 0);
        USDT.approveOrRevert(address(VUSDT), 0);
    }

    function _getDebt(VToken market, address account) internal returns (uint256) {
        if (!_isUnderwater(account)) {
            return 0; // no debt if not underwater
        }
        return market.borrowBalanceCurrent(account);
    }

    function _borrow(VToken market, uint256 amount) internal {
        market.borrow(amount);
    }

    function _repay(address account, VToken market, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        market.repayBorrowBehalf(account, amount);
    }

    function _liquidateAsMuchAsPossible(
        address account,
        uint256 debt,
        VToken market,
        VToken collateral,
        uint256 ratio
    ) internal returns (uint256) {
        if (debt == 0) {
            return 0;
        }
        uint256 seizeableVTokens = collateral.balanceOf(account);
        if (seizeableVTokens <= 1) {
            return debt;
        }
        // Ideally, we should round up here so that we repay as much as possible during the liquidation,
        // leaving no vTokens supplied, but due to anvil-zksync issues, we want to keep at least 1 wei
        // of vTokens supplied so that we're able to test it later
        uint256 amountToRepayForEntireCollateral = ((seizeableVTokens - 1) * 1e18) / ratio;
        // Keeping 1 wei of debt, for the same purpose
        uint256 amountToRepay = debt > amountToRepayForEntireCollateral ? amountToRepayForEntireCollateral : (debt - 1);
        if (amountToRepay > 1) {
            market.liquidateBorrow(account, amountToRepay, collateral);
        }
        return debt - amountToRepay;
    }

    function _getBorrowedTokensToCollateralVTokensRatio(
        VToken borrowed,
        uint256 collateralPrice,
        uint256 collateralExchangeRate
    ) internal view returns (uint256) {
        uint256 borrowedPrice = ORACLE.getUnderlyingPrice(address(borrowed));
        return (borrowedPrice * LIQUIDATION_INCENTIVE * 1e18) / (collateralPrice * collateralExchangeRate);
    }

    function _isUnderwater(address account) internal view returns (bool) {
        (, uint256 liquidity, uint256 shortfall) = COMPTROLLER.getAccountLiquidity(account);
        return liquidity == 0 && shortfall > 0;
    }
}

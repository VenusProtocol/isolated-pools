// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "./VToken.sol";

contract ComptrollerV1Storage {
    /**
     * @notice Oracle which gives the price of any given asset
     */
    PriceOracle public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint256 public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint256 public liquidationIncentiveMantissa;

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    uint256 public maxAssets;

    /**
     * @notice Per-account mapping of "assets you are in", capped by maxAssets
     */
    mapping(address => VToken[]) public accountAssets;

    struct Market {
        // Whether or not this market is listed
        bool isListed;
        //  Multiplier representing the most one can borrow against their collateral in this market.
        //  For instance, 0.9 to allow borrowing 90% of collateral value.
        //  Must be between 0 and 1, and stored as a mantissa.
        uint256 collateralFactorMantissa;
        //  Multiplier representing the collateralization after which the borrow is eligible
        //  for liquidation. For instance, 0.8 liquidate when the borrow is 80% of collateral
        //  value. Must be between 0 and collateral factor, stored as a mantissa.
        uint256 liquidationThresholdMantissa;
        // Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;
    }

    /**
     * @notice Official mapping of vTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) public markets;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     *  Actions which allow users to remove their own assets cannot be paused.
     *  Liquidation / seizing / transfer can only be paused globally, not by market.
     * NOTE: THIS VALUE IS NOT USED IN COMPTROLLER. HOWEVER IT IS ALREADY USED IN COMTROLLERG7
     * 		 AND IS CAUSING COMPILATION ERROR IF REMOVED.
     */
    address public pauseGuardian;
    bool public transferGuardianPaused;
    bool public seizeGuardianPaused;
    mapping(address => bool) public mintGuardianPaused;
    mapping(address => bool) public borrowGuardianPaused;

    /// @notice A list of all markets
    VToken[] public allMarkets;

    // @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    // NOTE: please remove this as it is not used anymore
    address public borrowCapGuardian;

    // @notice Borrow caps enforced by borrowAllowed for each vToken address. Defaults to zero which restricts borrowing.
    mapping(address => uint256) public borrowCaps;

    /// @notice Minimal collateral required for regular (non-batch) liquidations
    uint256 public minLiquidatableCollateral;

    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint256) public supplyCaps;

    enum Action {
        MINT,
        REDEEM,
        BORROW,
        REPAY,
        SEIZE,
        LIQUIDATE,
        TRANSFER,
        ENTER_MARKET,
        EXIT_MARKET
    }

    /// @notice True if a certain action is paused on a certain market
    mapping(address => mapping(Action => bool)) internal _actionPaused;
}

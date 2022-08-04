// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "./CToken.sol";
import "./PriceOracle.sol";

contract UnitrollerAdminStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active brains of Unitroller
     */
    address public comptrollerImplementation;

    /**
     * @notice Pending brains of Unitroller
     */
    address public pendingComptrollerImplementation;
}

contract ComptrollerV1Storage is UnitrollerAdminStorage {
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
    mapping(address => CToken[]) public accountAssets;
}

contract ComptrollerV2Storage is ComptrollerV1Storage {
    struct Market {
        // Whether or not this market is listed
        bool isListed;
        //  Multiplier representing the most one can borrow against their collateral in this market.
        //  For instance, 0.9 to allow borrowing 90% of collateral value.
        //  Must be between 0 and 1, and stored as a mantissa.
        uint256 collateralFactorMantissa;
        // Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;
        // Whether or not this market receives COMP
        bool isComped;
    }

    /**
     * @notice Official mapping of cTokens -> Market metadata
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
    bool public _mintGuardianPaused;
    bool public _borrowGuardianPaused;
    bool public transferGuardianPaused;
    bool public seizeGuardianPaused;
    mapping(address => bool) public mintGuardianPaused;
    mapping(address => bool) public borrowGuardianPaused;
}

contract ComptrollerV3Storage is ComptrollerV2Storage {
    /// @notice A list of all markets
    CToken[] public allMarkets;

    /// @notice The rate at which the flywheel distributes COMP, per block
    uint256 public compRate;

    /// @notice The portion of compRate that each market currently receives
    mapping(address => uint256) public compSpeeds;
}

contract ComptrollerV4Storage is ComptrollerV3Storage {
    // @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    // NOTE: please remove this as it is not used anymore
    address public borrowCapGuardian;

    // @notice Borrow caps enforced by borrowAllowed for each cToken address. Defaults to zero which corresponds to unlimited borrowing.
    mapping(address => uint256) public borrowCaps;
}

contract ComptrollerV5Storage is ComptrollerV4Storage {}

contract ComptrollerV6Storage is ComptrollerV5Storage {}

contract ComptrollerV7Storage is ComptrollerV6Storage {
    /// @notice Flag indicating whether the function to fix COMP accruals has been executed (RE: proposal 62 bug)
    bool public proposal65FixExecuted;

    /// @notice Accounting storage mapping account addresses to how much COMP they owe the protocol.
    mapping(address => uint256) public compReceivable;
}

contract ComptrollerV8Storage is ComptrollerV7Storage {
    /// @notice Storage for minimum liquidatable amount in USD for each asset
    mapping(address => uint256) public minimalLiquidatableAmount;

    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint256) public supplyCaps;
}

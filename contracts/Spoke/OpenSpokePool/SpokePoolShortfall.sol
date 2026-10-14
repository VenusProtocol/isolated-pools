// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";

/**
 * @title SpokePoolShortfall
 * @author Venus
 * @notice The `shortfall` of every open spoke pool market, so a market's bad debt is only recovered through it.
 * Whitelisted recoverers repay bad debt with their own funds and are paid XVS from the pool's locked stake, worth the
 * repaid amount times `badDebtRecoveryIncentiveMantissa` at ResilientOracle prices; a recovery whose payout exceeds the
 * stake left reverts, so recoverers recover a smaller amount. Venus repays what the stake cannot cover with its own
 * funds, such as USDT swept from the RiskFund. As a market's bad debt falls, the Hub's position in it recovers.
 * @dev Needs the manager's `seizeStake` role
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolShortfall is AccessControlledV8, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Highest bad debt recovery incentive, scaled by 1e18: XVS worth 150% of the debt
    uint256 public constant MAX_BAD_DEBT_RECOVERY_INCENTIVE_MANTISSA = 1.5e18;

    /// @notice The manager whose pools' locked stake pays recoverers
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @notice The XVS token, which pays recoverers
    address public immutable XVS;

    /// @notice XVS paid per unit of bad debt recovered, relative to its USD value, scaled by 1e18
    uint256 public badDebtRecoveryIncentiveMantissa;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /**
     * @notice Emitted when bad debt is recovered and the recoverer is paid from the pool's locked stake
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param recoverer The account that repaid the bad debt
     * @param amount The bad debt repaid, in the underlying
     * @param xvsAmount The XVS paid to the recoverer
     */
    event BadDebtRecovered(
        address indexed comptroller,
        address indexed vToken,
        address indexed recoverer,
        uint256 amount,
        uint256 xvsAmount
    );

    /**
     * @notice Emitted when the bad debt recovery incentive is changed
     * @param oldBadDebtRecoveryIncentiveMantissa The previous incentive, scaled by 1e18
     * @param newBadDebtRecoveryIncentiveMantissa The new incentive, scaled by 1e18
     */
    event BadDebtRecoveryIncentiveUpdated(
        uint256 oldBadDebtRecoveryIncentiveMantissa,
        uint256 newBadDebtRecoveryIncentiveMantissa
    );

    /**
     * @notice Emitted when Venus repays a market's bad debt with its own funds
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param payer The account that repaid the bad debt
     * @param amount The bad debt repaid, in the underlying
     */
    event BadDebtRepaid(address indexed comptroller, address indexed vToken, address indexed payer, uint256 amount);

    /// @notice Thrown when the recovery incentive is below 1e18 or above `MAX_BAD_DEBT_RECOVERY_INCENTIVE_MANTISSA`
    error InvalidBadDebtRecoveryIncentive();

    /**
     * @param spokePoolManager The manager whose pools' locked stake pays recoverers
     * @param xvs The XVS token
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(SpokePoolManager spokePoolManager, address xvs) {
        ensureNonzeroAddress(address(spokePoolManager));
        ensureNonzeroAddress(xvs);

        SPOKE_POOL_MANAGER = spokePoolManager;
        XVS = xvs;

        _disableInitializers();
    }

    /**
     * @notice Initializes the shortfall
     * @param accessControlManager_ The AccessControlManager the shortfall checks roles in
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
    }

    /*** Bad debt recoverer functions ***/

    /**
     * @notice Repays bad debt of a market with the caller's funds and pays the caller XVS from the pool's locked stake,
     *   worth the repaid amount times `badDebtRecoveryIncentiveMantissa` at ResilientOracle prices. A payout that
     *   rounds to zero takes nothing from the stake
     * @param vToken The market with bad debt
     * @param amount The bad debt to repay, in the market's underlying, which the caller must have approved
     * @return xvsAmountToSeize The XVS taken from the pool's stake and paid to the caller
     * @custom:event Emits BadDebtRecovered; the market emits BadDebtRecovered, and for a nonzero payout the manager
     *   emits StakeSeized and the vault Claim and LockedStakeSeized
     * @custom:error MarketNotListed is thrown when the market is not listed in its pool
     * @custom:error InsufficientLockedStake is thrown by the manager when the payout exceeds the pool's locked stake
     * @custom:error TransferAmountMismatch is thrown when the market receives a different amount
     * @custom:error The market reverts when the amount exceeds its bad debt
     * @custom:access Controlled by AccessControlManager, granted to the whitelisted bad debt recoverers
     */
    function recoverBadDebt(VToken vToken, uint256 amount) external nonReentrant returns (uint256 xvsAmountToSeize) {
        _checkAccessAllowed("recoverBadDebt(address,uint256)");

        address comptroller = address(vToken.comptroller());
        if (!SpokeComptroller(comptroller).isMarketListed(vToken)) {
            revert ISpokePoolManager.MarketNotListed(address(vToken));
        }
        ResilientOracleInterface oracle = SPOKE_POOL_MANAGER.RESILIENT_ORACLE();
        xvsAmountToSeize =
            (amount * oracle.getUnderlyingPrice(address(vToken)) * badDebtRecoveryIncentiveMantissa) /
            (oracle.getPrice(XVS) * EXP_SCALE);
        if (xvsAmountToSeize != 0) {
            SPOKE_POOL_MANAGER.seizeStake(comptroller, xvsAmountToSeize, msg.sender);
        }
        _repayBadDebt(vToken, amount);

        emit BadDebtRecovered(comptroller, address(vToken), msg.sender, amount, xvsAmountToSeize);
    }

    /*** Governance functions ***/

    /**
     * @notice Sets the XVS paid per unit of bad debt recovered, relative to its USD value
     * @param newBadDebtRecoveryIncentiveMantissa The new incentive, scaled by 1e18; 1.1e18 pays XVS worth 110% of the
     *   debt
     * @custom:event Emits BadDebtRecoveryIncentiveUpdated
     * @custom:error InvalidBadDebtRecoveryIncentive is thrown when the incentive is below 1e18 or above
     *   `MAX_BAD_DEBT_RECOVERY_INCENTIVE_MANTISSA`
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setBadDebtRecoveryIncentive(uint256 newBadDebtRecoveryIncentiveMantissa) external {
        _checkAccessAllowed("setBadDebtRecoveryIncentive(uint256)");
        if (
            newBadDebtRecoveryIncentiveMantissa < MANTISSA_ONE ||
            newBadDebtRecoveryIncentiveMantissa > MAX_BAD_DEBT_RECOVERY_INCENTIVE_MANTISSA
        ) {
            revert InvalidBadDebtRecoveryIncentive();
        }
        emit BadDebtRecoveryIncentiveUpdated(badDebtRecoveryIncentiveMantissa, newBadDebtRecoveryIncentiveMantissa);
        badDebtRecoveryIncentiveMantissa = newBadDebtRecoveryIncentiveMantissa;
    }

    /**
     * @notice Repays bad debt of a market with Venus's own funds, such as USDT swept from the RiskFund; nothing is paid
     *   from the pool's stake
     * @param vToken The market with bad debt
     * @param amount The bad debt to repay, in the market's underlying, which the caller must have approved
     * @custom:event Emits BadDebtRepaid; the market emits BadDebtRecovered
     * @custom:error MarketNotListed is thrown when the market is not listed in its pool
     * @custom:error TransferAmountMismatch is thrown when the market receives a different amount
     * @custom:error The market reverts when the amount exceeds its bad debt
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function repayBadDebt(VToken vToken, uint256 amount) external nonReentrant {
        _checkAccessAllowed("repayBadDebt(address,uint256)");

        address comptroller = address(vToken.comptroller());
        if (!SpokeComptroller(comptroller).isMarketListed(vToken)) {
            revert ISpokePoolManager.MarketNotListed(address(vToken));
        }
        _repayBadDebt(vToken, amount);

        emit BadDebtRepaid(comptroller, address(vToken), msg.sender, amount);
    }

    /*** Internal functions ***/

    /**
     * @dev Repays a market's bad debt with the caller's funds
     * @param vToken The market
     * @param amount The bad debt to repay, in the underlying
     * @custom:error TransferAmountMismatch is thrown when the market receives a different amount
     */
    function _repayBadDebt(VToken vToken, uint256 amount) internal {
        IERC20Upgradeable underlying = IERC20Upgradeable(vToken.underlying());
        uint256 balanceBefore = underlying.balanceOf(address(vToken));
        underlying.safeTransferFrom(msg.sender, address(vToken), amount);
        if (underlying.balanceOf(address(vToken)) - balanceBefore != amount) {
            revert ISpokePoolManager.TransferAmountMismatch(address(underlying));
        }
        vToken.badDebtRecovered(amount);
    }
}

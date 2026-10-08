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
import { SpokePoolManager } from "./SpokePoolManager.sol";

/**
 * @title SpokePoolShortfallReceiver
 * @author Venus
 * @notice The `shortfall` of every open spoke pool market. Whitelisted coverers repay a market's bad debt with their own
 * funds and are paid XVS from the pool's locked stake, worth the repaid amount times `coverIncentiveMantissa` at
 * ResilientOracle prices, or whatever is left of the stake. Once the stake is gone, a cover pays nothing, which is how
 * Venus repays the rest with its own funds, such as USDT swept from the RiskFund. As the market's bad debt falls, the
 * Hub's position in it recovers.
 * @dev Must hold the manager's `seizeStake` role
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolShortfallReceiver is AccessControlledV8, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The manager whose pools' locked stake pays coverers
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @notice The XVS token
    address public immutable XVS;

    /// @notice XVS paid per unit of bad debt covered, relative to its USD value, scaled by 1e18
    uint256 public coverIncentiveMantissa;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /**
     * @notice Emitted when the bad debt cover incentive is changed
     * @param oldIncentiveMantissa The previous incentive, scaled by 1e18
     * @param newIncentiveMantissa The new incentive, scaled by 1e18
     */
    event CoverIncentiveUpdated(uint256 oldIncentiveMantissa, uint256 newIncentiveMantissa);

    /**
     * @notice Emitted when bad debt is covered and the coverer is paid from the pool's locked stake
     * @param vToken The market
     * @param coverer The account that repaid the bad debt
     * @param amount The bad debt repaid, in the underlying
     * @param xvsAmount The XVS paid to the coverer
     */
    event BadDebtCovered(address indexed vToken, address indexed coverer, uint256 amount, uint256 xvsAmount);

    /// @notice Thrown when the cover incentive is below 1e18
    error InvalidCoverIncentive();

    /**
     * @notice Thrown when a market is not listed in its pool
     * @param vToken The market
     */
    error MarketNotInPool(address vToken);

    /**
     * @notice Thrown when a transfer delivers a different amount than requested
     * @param token The token
     */
    error TransferAmountMismatch(address token);

    /**
     * @param spokePoolManager The manager whose pools' locked stake pays coverers
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
     * @notice Initializes the receiver
     * @param accessControlManager_ The AccessControlManager the receiver checks roles in
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
    }

    /**
     * @notice Repays bad debt of a market with the caller's funds and pays the caller XVS from the pool's locked stake:
     *   the incentive's worth, or what is left of the stake when that is less, so nothing once the stake is gone
     * @param vToken The market with bad debt
     * @param amount The bad debt to repay, in the market's underlying, which the caller must have approved
     * @return xvsAmountToSeize The XVS seized from the pool's stake and paid to the caller
     * @custom:event Emits BadDebtCovered; the market emits BadDebtRecovered, the manager StakeSeized when XVS is paid
     * @custom:error MarketNotInPool is thrown when the market is not listed in its pool
     * @custom:error TransferAmountMismatch is thrown when the market receives a different amount
     * @custom:error InvalidPoolStatus is thrown by the manager when XVS is owed and the pool was not created through it
     * @custom:access Controlled by AccessControlManager, granted to the whitelisted bad debt coverers
     */
    function coverBadDebt(VToken vToken, uint256 amount) external nonReentrant returns (uint256 xvsAmountToSeize) {
        _checkAccessAllowed("coverBadDebt(address,uint256)");

        address comptroller = address(vToken.comptroller());
        if (!SpokeComptroller(comptroller).isMarketListed(vToken)) {
            revert MarketNotInPool(address(vToken));
        }
        ResilientOracleInterface oracle = SPOKE_POOL_MANAGER.RESILIENT_ORACLE();
        xvsAmountToSeize =
            (amount * oracle.getUnderlyingPrice(address(vToken)) * coverIncentiveMantissa) /
            (oracle.getPrice(XVS) * EXP_SCALE);
        (, , , , uint256 lockedStake, ) = SPOKE_POOL_MANAGER.pools(comptroller);
        if (xvsAmountToSeize > lockedStake) {
            xvsAmountToSeize = lockedStake;
        }

        if (xvsAmountToSeize != 0) {
            SPOKE_POOL_MANAGER.seizeStake(comptroller, xvsAmountToSeize, msg.sender);
        }
        _transferIn(IERC20Upgradeable(vToken.underlying()), msg.sender, address(vToken), amount);
        vToken.badDebtRecovered(amount);

        emit BadDebtCovered(address(vToken), msg.sender, amount, xvsAmountToSeize);
    }

    /**
     * @notice Sets the XVS paid per unit of bad debt covered, relative to its USD value
     * @param newIncentiveMantissa The new incentive, scaled by 1e18; 1.1e18 pays XVS worth 110% of the debt
     * @custom:event Emits CoverIncentiveUpdated
     * @custom:error InvalidCoverIncentive is thrown when the incentive is below 1e18
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setCoverIncentive(uint256 newIncentiveMantissa) external {
        _checkAccessAllowed("setCoverIncentive(uint256)");
        if (newIncentiveMantissa < MANTISSA_ONE) {
            revert InvalidCoverIncentive();
        }
        emit CoverIncentiveUpdated(coverIncentiveMantissa, newIncentiveMantissa);
        coverIncentiveMantissa = newIncentiveMantissa;
    }

    /**
     * @dev Pulls an exact amount of an asset, rejecting assets that deliver less
     * @param asset The asset to pull
     * @param from The account the token is pulled from
     * @param to The receiver
     * @param amount The amount to pull
     * @custom:error TransferAmountMismatch is thrown when the receiver gets a different amount
     */
    function _transferIn(IERC20Upgradeable asset, address from, address to, uint256 amount) internal {
        uint256 balanceBefore = asset.balanceOf(to);
        asset.safeTransferFrom(from, to, amount);
        if (asset.balanceOf(to) - balanceBefore != amount) {
            revert TransferAmountMismatch(address(asset));
        }
    }
}

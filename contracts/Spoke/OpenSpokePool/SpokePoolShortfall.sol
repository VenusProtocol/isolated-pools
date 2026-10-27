// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "../../VToken.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IBondAccount } from "../interfaces/IBondAccount.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolShortfall } from "../interfaces/ISpokePoolShortfall.sol";

/**
 * @title SpokePoolShortfall
 * @author Venus
 * @notice The `shortfall` of every open spoke market. As in Venus's `Shortfall`, bad debt is repaid before anything is
 * paid out: a recoverer repays it with its own funds, then is paid from the pool's bond; Venus repays what the bond
 * cannot cover with `repayBadDebt`. Repaid bad debt becomes cash in the market, which the Hub can then redeem
 * @dev Needs the manager's `seizeBond` role
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolShortfall is AccessControlledV8, ReentrancyGuardUpgradeable, ISpokePoolShortfall {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @inheritdoc ISpokePoolShortfall
    ISpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;

    /**
     * @param spokePoolManager The manager whose pools' bonds pay recoverers
     * @custom:error ZeroAddressNotAllowed is thrown when the manager is zero
     */
    constructor(ISpokePoolManager spokePoolManager) {
        ensureNonzeroAddress(address(spokePoolManager));

        SPOKE_POOL_MANAGER = spokePoolManager;

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

    // ──────────────────────────────────────────────────────────────────────
    // Recoverer functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolShortfall
    function recoverBadDebt(VToken vToken, uint256 amount) external nonReentrant returns (uint256 paidNow) {
        _checkAccessAllowed("recoverBadDebt(address,uint256)");
        address comptroller = _ensureMarketListed(vToken);

        IBondAccount bondAccount = IBondAccount(SPOKE_POOL_MANAGER.bondManager().bondAccounts(comptroller));
        ResilientOracleInterface resilientOracle = SPOKE_POOL_MANAGER.RESILIENT_ORACLE();
        uint256 debtPrice = resilientOracle.getUnderlyingPrice(address(vToken));
        uint256 bondPrice = resilientOracle.getPrice(address(bondAccount.asset()));

        uint256 repaid = _repayBadDebt(vToken, amount);
        uint256 seizedAmount = (repaid * debtPrice) / bondPrice;

        if (seizedAmount != 0) {
            paidNow = SPOKE_POOL_MANAGER.seizeBond(comptroller, seizedAmount, msg.sender);
        }

        emit BadDebtRecovered(comptroller, address(vToken), msg.sender, repaid, seizedAmount, paidNow);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Admin functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolShortfall
    function repayBadDebt(VToken vToken, uint256 amount) external nonReentrant {
        _checkAccessAllowed("repayBadDebt(address,uint256)");
        address comptroller = _ensureMarketListed(vToken);

        uint256 repaid = _repayBadDebt(vToken, amount);

        emit BadDebtRepaid(comptroller, address(vToken), msg.sender, repaid);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Repays up to `amount` of a market's bad debt with the caller's funds and returns the amount repaid
    function _repayBadDebt(VToken vToken, uint256 amount) private returns (uint256 repaid) {
        uint256 badDebt = vToken.badDebt();
        repaid = amount < badDebt ? amount : badDebt;
        IERC20Upgradeable underlying = IERC20Upgradeable(vToken.underlying());
        uint256 balanceBefore = underlying.balanceOf(address(vToken));
        underlying.safeTransferFrom(msg.sender, address(vToken), repaid);
        if (underlying.balanceOf(address(vToken)) - balanceBefore != repaid) {
            revert TransferAmountMismatch(address(underlying));
        }
        vToken.badDebtRecovered(repaid);
    }

    /// @dev Returns a market's comptroller, reverting unless the market is listed in it
    function _ensureMarketListed(VToken vToken) private view returns (address comptroller) {
        comptroller = address(vToken.comptroller());
        // Only a pool's own markets reach its bond
        if (!SpokeComptroller(comptroller).isMarketListed(vToken)) {
            revert MarketNotListed(address(vToken));
        }
    }
}

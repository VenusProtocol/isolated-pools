// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { IRiskFund } from "./IRiskFund.sol";
import { ReserveHelpers } from "./ReserveHelpers.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { Comptroller } from "../Comptroller.sol";
import { IShortfall } from "../Shortfall/IShortfall.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";

/**
 * @title ReserveHelpers
 * @author Venus
 * @notice Contract with basic features to track/hold different assets for different Comptrollers.
 * @dev This contract does not support BNB.
 */
contract RiskFund is Ownable2StepUpgradeable, AccessControlledV8, ExponentialNoError, IRiskFund {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public convertibleBaseAsset;
    address public shortfall;
    address public riskFundSwapper;

    // Store base asset's reserve for specific pool
    mapping(address => uint256) public poolReserves;

    /// @notice Emitted when pool registry address is updated
    event RiskFundSwapperUpdated(address indexed oldRiskFundSwapper, address indexed newRiskFundSwapper);

    /// @notice Emitted when shortfall contract address is updated
    event ShortfallContractUpdated(address indexed oldShortfallContract, address indexed newShortfallContract);

    /// @notice Emitted when reserves are transferred for auction
    event TransferredReserveForAuction(address indexed comptroller, uint256 amount);

    /// @notice Emitted when pool states is updated with amount transferred to this contract
    event PoolStateUpdated(address comptroller, uint256 amount);

    /// @notice Error is thrown when updatePoolState is not called by riskFundSwapper
    error InvalidRiskFundSwapper();

    /// @dev Note that the contract is upgradeable. Use initialize() or reinitializers
    /// to set the state variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param convertibleBaseAsset_ Address of the base asset
     * @param accessControlManager_ Address of the access control contract
     * @param loopsLimit_ Limit for the loops in the contract to avoid DOS
     * @custom:error ZeroAddressNotAllowed is thrown when PCS router address is zero
     * @custom:error ZeroAddressNotAllowed is thrown when convertible base asset address is zero
     */
    function initialize(
        address convertibleBaseAsset_,
        address accessControlManager_,
        uint256 loopsLimit_
    ) external initializer {
        ensureNonzeroAddress(convertibleBaseAsset_);
        require(loopsLimit_ > 0, "Risk Fund: Loops limit can not be zero");

        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);

        convertibleBaseAsset = convertibleBaseAsset_;
    }

    /**
     * @dev Risk fund swapper setter
     * @param riskFundSwapper_ Address of the risk fund swapper
     * @custom:event RiskFundSwapperUpdated emit on success
     * @custom:error ZeroAddressNotAllowed is thrown when risk fund swapper address is zero
     */
    function setRiskFundSwapper(address riskFundSwapper_) external onlyOwner {
        ensureNonzeroAddress(riskFundSwapper_);
        address oldRiskFundSwapper = riskFundSwapper;
        riskFundSwapper = riskFundSwapper_;
        emit RiskFundSwapperUpdated(oldRiskFundSwapper, riskFundSwapper_);
    }

    /**
     * @dev Shortfall contract address setter
     * @param shortfallContractAddress_ Address of the auction contract
     * @custom:error ZeroAddressNotAllowed is thrown when shortfall contract address is zero
     */
    function setShortfallContractAddress(address shortfallContractAddress_) external onlyOwner {
        ensureNonzeroAddress(shortfallContractAddress_);
        require(
            IShortfall(shortfallContractAddress_).convertibleBaseAsset() == convertibleBaseAsset,
            "Risk Fund: Base asset doesn't match"
        );

        address oldShortfallContractAddress = shortfall;
        shortfall = shortfallContractAddress_;
        emit ShortfallContractUpdated(oldShortfallContractAddress, shortfallContractAddress_);
    }

    /**
     * @dev Transfer tokens for auction.
     * @param comptroller Comptroller of the pool.
     * @param amount Amount to be transferred to auction contract.
     * @return Number reserved tokens.
     */
    function transferReserveForAuction(address comptroller, uint256 amount) external override returns (uint256) {
        address shortfall_ = shortfall;
        require(msg.sender == shortfall_, "Risk fund: Only callable by Shortfall contract");
        require(amount <= poolReserves[comptroller], "Risk Fund: Insufficient pool reserve.");
        unchecked {
            poolReserves[comptroller] = poolReserves[comptroller] - amount;
        }
        IERC20Upgradeable(convertibleBaseAsset).safeTransfer(shortfall_, amount);

        emit TransferredReserveForAuction(comptroller, amount);

        return amount;
    }

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to risk fund
     * @param comptroller  Comptroller address(pool)
     * @param amount Amount transferred for the pool
     */
    function updatePoolState(address comptroller, uint256 amount) public {
        if (msg.sender != riskFundSwapper) {
            revert InvalidRiskFundSwapper();
        }

        poolReserves[comptroller] += amount;

        emit PoolStateUpdated(comptroller, amount);
    }
}

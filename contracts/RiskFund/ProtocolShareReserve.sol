// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IProtocolShareReserve } from "./IProtocolShareReserve.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { ReserveHelpers } from "./ReserveHelpers.sol";
import { IRiskFund } from "./IRiskFund.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";

contract ProtocolShareReserve is Ownable2StepUpgradeable, ExponentialNoError, ReserveHelpers, IProtocolShareReserve {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private protocolIncome;
    address private riskFund;
    // Percentage of funds not sent to the RiskFund contract when the funds are released, following the project Tokenomics
    uint256 private constant PROTOCOL_SHARE_PERCENTAGE = 70;
    uint256 private constant BASE_UNIT = 100;

    /// @notice Emitted when funds are released
    event FundsReleased(address comptroller, address asset, uint256 amount);

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param protocolIncome_ The address protocol income will be sent to
     * @param riskFund_ Risk fund address
     * @custom:error ZeroAddressNotAllowed is thrown when protocol income address is zero
     * @custom:error ZeroAddressNotAllowed is thrown when risk fund address is zero
     */
    function initialize(address protocolIncome_, address riskFund_) external initializer {
        ensureNonzeroAddress(protocolIncome_);
        ensureNonzeroAddress(riskFund_);

        __Ownable2Step_init();

        protocolIncome = protocolIncome_;
        riskFund = riskFund_;
    }

    /**
     * @dev Pool registry setter.
     * @param poolRegistry_ Address of the pool registry
     * @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
     */
    function setPoolRegistry(address poolRegistry_) external onlyOwner {
        ensureNonzeroAddress(poolRegistry_);
        address oldPoolRegistry = poolRegistry;
        poolRegistry = poolRegistry_;
        emit PoolRegistryUpdated(oldPoolRegistry, poolRegistry_);
    }

    /**
     * @dev Release funds
     * @param asset  Asset to be released
     * @param amount Amount to release
     * @return Number of total released tokens
     * @custom:error ZeroAddressNotAllowed is thrown when asset address is zero
     */
    function releaseFunds(
        address comptroller,
        address asset,
        uint256 amount
    ) external returns (uint256) {
        ensureNonzeroAddress(asset);
        require(amount <= poolsAssetsReserves[comptroller][asset], "ProtocolShareReserve: Insufficient pool balance");

        assetsReserves[asset] -= amount;
        poolsAssetsReserves[comptroller][asset] -= amount;
        uint256 protocolIncomeAmount = mul_(
            Exp({ mantissa: amount }),
            div_(Exp({ mantissa: PROTOCOL_SHARE_PERCENTAGE * EXP_SCALE }), BASE_UNIT)
        ).mantissa;

        IERC20Upgradeable(asset).safeTransfer(protocolIncome, protocolIncomeAmount);
        IERC20Upgradeable(asset).safeTransfer(riskFund, amount - protocolIncomeAmount);

        // Update the pool asset's state in the risk fund for the above transfer.
        IRiskFund(riskFund).updateAssetsState(comptroller, asset);

        emit FundsReleased(comptroller, asset, amount);

        return amount;
    }

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to the protocol share reserve.
     * @param comptroller  Comptroller address(pool)
     * @param asset Asset address.
     */
    function updateAssetsState(address comptroller, address asset)
        public
        override(IProtocolShareReserve, ReserveHelpers)
    {
        super.updateAssetsState(comptroller, asset);
    }
}

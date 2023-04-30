// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../ExponentialNoError.sol";
import "./IRiskFund.sol";
import "./ReserveHelpers.sol";
import "./IProtocolShareReserve.sol";

contract ProtocolShareReserve is Ownable2StepUpgradeable, ExponentialNoError, ReserveHelpers, IProtocolShareReserve {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private protocolIncome;
    address private riskFund;
    // Percentage of funds not sent to the RiskFund contract when the funds are released, following the project Tokenomics
    uint256 private constant protocolSharePercentage = 70;
    uint256 private constant baseUnit = 100;

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
     * @param _protocolIncome The address protocol income will be sent to
     * @param _riskFund Risk fund address
     */
    function initialize(address _protocolIncome, address _riskFund) external initializer {
        require(_protocolIncome != address(0), "ProtocolShareReserve: Protocol Income address invalid");
        require(_riskFund != address(0), "ProtocolShareReserve: Risk Fund address invalid");

        __Ownable2Step_init();

        protocolIncome = _protocolIncome;
        riskFund = _riskFund;
    }

    /**
     * @dev Pool registry setter.
     * @param _poolRegistry Address of the pool registry
     */
    function setPoolRegistry(address _poolRegistry) external onlyOwner {
        require(_poolRegistry != address(0), "ProtocolShareReserve: Pool registry address invalid");
        address oldPoolRegistry = poolRegistry;
        poolRegistry = _poolRegistry;
        emit PoolRegistryUpdated(oldPoolRegistry, _poolRegistry);
    }

    /**
     * @dev Release funds
     * @param asset  Asset to be released
     * @param amount Amount to release
     * @return Number of total released tokens
     */
    function releaseFunds(
        address comptroller,
        address asset,
        uint256 amount
    ) external returns (uint256) {
        require(asset != address(0), "ProtocolShareReserve: Asset address invalid");
        require(amount <= poolsAssetsReserves[comptroller][asset], "ProtocolShareReserve: Insufficient pool balance");

        assetsReserves[asset] -= amount;
        poolsAssetsReserves[comptroller][asset] -= amount;
        uint256 protocolIncomeAmount = mul_(
            Exp({ mantissa: amount }),
            div_(Exp({ mantissa: protocolSharePercentage * expScale }), baseUnit)
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

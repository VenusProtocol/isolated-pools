// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../ExponentialNoError.sol";
import "./IRiskFund.sol";
import "./ReserveHelpers.sol";

contract ProtocolShareReserve is Ownable2StepUpgradeable, ExponentialNoError, ReserveHelpers {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private protocolIncome;
    address private riskFund;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param _protocolIncome The address, protocol income will be sent to.
     * @param _riskFund Risk fund address.
     */
    function initialize(address _protocolIncome, address _riskFund) public initializer {
        require(_protocolIncome != address(0), "ProtocolShareReserve: Protocol Income address invalid");
        require(_riskFund != address(0), "ProtocolShareReserve: Risk Fund address invalid");

        __Ownable_init();

        protocolIncome = _protocolIncome;
        riskFund = _riskFund;
    }

    /**
     * @dev Release funds
     * @param asset  Asset to be released.
     * @param amount Amount to release.
     * @return Number of total released tokens.
     */
    function releaseFunds(
        address comptroller,
        address asset,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        require(asset != address(0), "ProtocolShareReserve: Asset address invalid");
        require(amount <= poolsAssetsReserves[comptroller][asset], "ProtocolShareReserve: Insufficient pool balance");

        assetsReserves[asset] -= amount;
        poolsAssetsReserves[comptroller][asset] -= amount;
        uint256 protocolIncomeAmount = mul_(Exp({ mantissa: amount }), div_(Exp({ mantissa: 70 * expScale }), 100))
        .mantissa;

        IERC20Upgradeable(asset).safeTransfer(protocolIncome, protocolIncomeAmount);
        IERC20Upgradeable(asset).safeTransfer(riskFund, amount - protocolIncomeAmount);

        // Update the pool asset's state in the risk fund for the above transfer.
        IRiskFund(riskFund).updateAssetsState(comptroller, asset);

        return amount;
    }
}

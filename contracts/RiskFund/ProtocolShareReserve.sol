// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../ExponentialNoError.sol";
import "./IRiskFund.sol";
import "./ReserveHelpers.sol";

contract ProtocolShareReserve is OwnableUpgradeable, ExponentialNoError, ReserveHelpers {
    using SafeERC20 for IERC20;

    address private protocolIncome;
    address private riskFund;

    /**
     * @dev Initializes the deployer to owner.
     * @param _protocolIncome  remaining protocol income.
     * @param _riskFund Risk fund address.
     */
    function initialize(address _protocolIncome, address _riskFund) public initializer {
        require(_protocolIncome != address(0), "ProtocolShareReserve: Liquidated shares address invalid");
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

        IERC20(asset).safeTransfer(
            protocolIncome,
            mul_(Exp({ mantissa: amount }), div_(Exp({ mantissa: 70 * expScale }), 100)).mantissa
        );
        IERC20(asset).safeTransfer(
            riskFund,
            mul_(Exp({ mantissa: amount }), div_(Exp({ mantissa: 30 * expScale }), 100)).mantissa
        );

        // Update the pool asset's state in the risk fund for the above transfer.
        IRiskFund(riskFund).updateAssetsState(comptroller, asset);

        return amount;
    }
}

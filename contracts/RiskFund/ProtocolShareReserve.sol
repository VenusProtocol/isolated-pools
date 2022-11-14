// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../ExponentialNoError.sol";
import "./IRiskFund.sol";
import "./ReserveHelpers.sol";

contract ProtocolShareReserve is
    OwnableUpgradeable,
    ExponentialNoError,
    ReserveHelpers
{
    using SafeERC20 for IERC20;

    address private liquidatedShares;
    address private riskFund;

    /**
     * @dev Initializes the deployer to owner.
     * @param _liquidatedShares  Liquidated shares address.
     * @param _riskFund Risk fund address.
     */
    function initialize(address _liquidatedShares, address _riskFund)
        public
        initializer
    {
        require(
            _liquidatedShares != address(0),
            "Liquidated shares Reserves: Liquidated shares address invalid"
        );
        require(
            _riskFund != address(0),
            "Liquidated shares Reserves: Risk Fund address invalid"
        );

        __Ownable_init();

        liquidatedShares = _liquidatedShares;
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
        require(
            asset != address(0),
            "Liquidated shares Reserves: Asset address invalid"
        );
        require(
            amount <= poolsAssetsReserves[comptroller][asset],
            "Liquidated shares Reserves: Insufficient pool balance"
        );

        assetsReserves[asset] -= amount;
        poolsAssetsReserves[comptroller][asset] -= amount;

        IERC20(asset).safeTransfer(
            liquidatedShares,
            mul_(
                Exp({mantissa: amount}),
                div_(Exp({mantissa: 70 * expScale}), 100)
            ).mantissa
        );
        IERC20(asset).safeTransfer(
            riskFund,
            mul_(
                Exp({mantissa: amount}),
                div_(Exp({mantissa: 30 * expScale}), 100)
            ).mantissa
        );

        // Update the pool asset's state in the risk fund for the above transfer.
        IRiskFund(riskFund).updateAssetsState(comptroller, asset);

        return amount;
    }
}

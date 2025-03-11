// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { VToken } from "../../VToken.sol";
import { IComptroller } from "../../ERC4626/Interfaces/IComptroller.sol"; // Venus Comptroller interface.;
import { RewardDistributorInterface } from "../../ERC4626/Interfaces/IRewardDistributor.sol"; // Interface for claiming rewards.
import { VenusERC4626 } from "../../ERC4626/VenusERC4626.sol";

contract MockVenusERC4626 is VenusERC4626 {
    uint256 private mockTotalAssets;
    uint256 private mockMaxDeposit;
    uint256 private mockMaxWithdraw;

    constructor(
        ERC20 asset_,
        ERC20 xvs_,
        VToken vToken_,
        address rewardRecipient_,
        IComptroller comptroller_,
        RewardDistributorInterface rewardDistributor_
    ) VenusERC4626(asset_, xvs_, vToken_, rewardRecipient_, comptroller_, rewardDistributor_) {}

    function setTotalAssets(uint256 _totalAssets) external {
        mockTotalAssets = _totalAssets;
    }

    function setMaxWithdraw(uint256 _maxWithdraw) external {
        mockMaxWithdraw = _maxWithdraw;
    }

    function setMaxDeposit(uint256 _maxDeposit) external {
        mockMaxDeposit = _maxDeposit;
    }

    function totalAssets() public view override returns (uint256) {
        return mockTotalAssets;
    }

    function maxDeposit(address) public view override returns (uint256) {
        return mockMaxDeposit;
    }

    function maxWithdraw(address) public view override returns (uint256) {
        return mockMaxWithdraw;
    }
}

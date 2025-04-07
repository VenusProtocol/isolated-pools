// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { InterestRateModel } from "./InterestRateModel.sol";

/**
 * @title Venus CheckpointRateModel Contract
 * @notice A contract that applies a rate model based on whether a certain checkpoint
 *   in time has passed. Useful to adjust interest rates for block time changes in
 *   the underlying networks, if the block time update is scheduled in advance.
 * @author Venus
 */
contract CheckpointRateModel is InterestRateModel {
    InterestRateModel public immutable OLD_RATE_MODEL;
    InterestRateModel public immutable NEW_RATE_MODEL;
    uint256 public immutable CHECKPOINT_TIMESTAMP;

    /**
     * @notice Constructor
     * @param oldRateModel Rate model to use before the checkpoint
     * @param newRateModel Rate model to use after the checkpoint
     * @param checkpointTimestamp Checkpoint timestamp
     */
    constructor(InterestRateModel oldRateModel, InterestRateModel newRateModel, uint256 checkpointTimestamp) {
        ensureNonzeroAddress(address(oldRateModel));
        ensureNonzeroAddress(address(newRateModel));
        OLD_RATE_MODEL = oldRateModel;
        NEW_RATE_MODEL = newRateModel;
        CHECKPOINT_TIMESTAMP = checkpointTimestamp;
    }

    /**
     * @notice Returns the current rate model contract (either the old one or the new one)
     * @return Rate model in use
     */
    function currentRateModel() external view returns (InterestRateModel) {
        return _getCurrentRateModel();
    }

    /**
     * @inheritdoc InterestRateModel
     */
    function getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) external view override returns (uint256) {
        return _getCurrentRateModel().getBorrowRate(cash, borrows, reserves, badDebt);
    }

    /**
     * @inheritdoc InterestRateModel
     */
    function getSupplyRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 reserveFactorMantissa,
        uint256 badDebt
    ) external view override returns (uint256) {
        return _getCurrentRateModel().getSupplyRate(cash, borrows, reserves, reserveFactorMantissa, badDebt);
    }

    /**
     * @dev Returns the current rate model contract (either the old one or the new one)
     * @return Rate model in use
     */
    function _getCurrentRateModel() internal view returns (InterestRateModel) {
        return (block.timestamp >= CHECKPOINT_TIMESTAMP) ? NEW_RATE_MODEL : OLD_RATE_MODEL;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

abstract contract MaxLoopsLimitHelper {
    // Limit for the loops to avoid the DOS
    uint256 public maxLoopsLimit;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @notice Emitted when max loops limit is set
    event MaxLoopsLimitUpdated(uint256 oldMaxLoopsLimit, uint256 newmaxLoopsLimit);

    /// @notice Thrown an error on maxLoopsLimit exceeds for any loop
    error MaxLoopsLimitExceeded(uint256 loopsLimit, uint256 requiredLoops);

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param limit Limit for the max loops can execute at a time
     */
    function _setMaxLoopsLimit(uint256 limit) internal {
        require(limit > maxLoopsLimit, "Comptroller: Invalid maxLoopsLimit");

        uint256 oldMaxLoopsLimit = maxLoopsLimit;
        maxLoopsLimit = limit;

        emit MaxLoopsLimitUpdated(oldMaxLoopsLimit, maxLoopsLimit);
    }

    /**
     * @notice Comapre the maxLoopsLimit with number of the times loop iterate
     * @param len Length of the loops iterate
     * @custom:error MaxLoopsLimitExceeded error is thrown when loops length exceeds maxLoopsLimit
     */
    function _ensureMaxLoops(uint256 len) internal view {
        if (len > maxLoopsLimit) {
            revert MaxLoopsLimitExceeded(maxLoopsLimit, len);
        }
    }
}

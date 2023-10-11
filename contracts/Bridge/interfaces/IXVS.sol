// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/**
 * @title IXVS
 * @author Venus
 * @notice Interface implemented by `XVS` token.
 */
interface IXVS {
    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;
}

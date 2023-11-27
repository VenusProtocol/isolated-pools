// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { VToken } from "../VToken.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VenusLens {
    struct VTokenBalances {
        address vToken;
        uint256 balanceOf;
        uint256 borrowBalanceCurrent;
        uint256 balanceOfUnderlying;
        uint256 tokenBalance;
        uint256 tokenAllowance;
    }

    /**
     * @notice Get the current vToken balances (outstanding borrows) for all vTokens on an account
     * @param vTokens Addresses of the tokens to check the balance of
     * @param account Account address to fetch the balance of
     * @return VTokenBalances Array with token balance information
     */
    function vTokenBalancesAll(
        VToken[] calldata vTokens,
        address payable account
    ) external returns (VTokenBalances[] memory) {
        uint256 vTokenCount = vTokens.length;
        VTokenBalances[] memory res = new VTokenBalances[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenBalances(vTokens[i], account);
        }
        return res;
    }

    /**
     * @notice Get the current vToken balance (outstanding borrows) for an account
     * @param vToken Address of the token to check the balance of
     * @param account Account address to fetch the balance of
     * @return VTokenBalances with token balance information
     */
    function vTokenBalances(VToken vToken, address payable account) public returns (VTokenBalances memory) {
        uint256 balanceOf = vToken.balanceOf(account);
        uint256 borrowBalanceCurrent = vToken.borrowBalanceCurrent(account);
        uint256 balanceOfUnderlying = vToken.balanceOfUnderlying(account);

        IERC20 underlying = IERC20(vToken.underlying());
        uint256 tokenBalance = underlying.balanceOf(account);
        uint256 tokenAllowance = underlying.allowance(account, address(vToken));
        return
            VTokenBalances({
                vToken: address(vToken),
                balanceOf: balanceOf,
                borrowBalanceCurrent: borrowBalanceCurrent,
                balanceOfUnderlying: balanceOfUnderlying,
                tokenBalance: tokenBalance,
                tokenAllowance: tokenAllowance
            });
    }
}

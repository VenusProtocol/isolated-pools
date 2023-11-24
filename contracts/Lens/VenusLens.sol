// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { VToken } from "../VToken.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VenusLens {
    struct VTokenBalances {
        address vToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
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
        uint vTokenCount = vTokens.length;
        VTokenBalances[] memory res = new VTokenBalances[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
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
        uint balanceOf = vToken.balanceOf(account);
        uint borrowBalanceCurrent = vToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = vToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        IERC20 underlying = IERC20(vToken.underlying());
        tokenBalance = underlying.balanceOf(account);
        tokenAllowance = underlying.allowance(account, address(vToken));
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

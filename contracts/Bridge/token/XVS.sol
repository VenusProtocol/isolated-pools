// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { TokenController } from "./TokenController.sol";

/**
 * @title XVS
 * @author Venus
 * @notice XVS contract serves as a customized ERC-20 token with additional minting and burning functionality.
 *  It also incorporates access control features provided by the "TokenController" contract to ensure proper governance and restrictions on minting and burning operations.
 */

contract XVS is ERC20, TokenController {
    constructor(address accessControlManager_) ERC20("Venus XVS", "XVS") TokenController(accessControlManager_) {}

    /**
     * @notice Creates `amount_` tokens and assigns them to `account_`, increasing
     * the total supply. Checks access and eligibility.
     * @param account_ Address to which tokens be assigned.
     * @param amount_ Amount of tokens to be assigned.
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits MintLimitDecreased with new available limit.
     * @custom:error MintNotAllowed is thrown when minting is not allowed to from_ address.
     * @custom:error MintLimitExceed is thrown when minting amount exceed the maximum cap.
     */
    function mint(address account_, uint256 amount_) external whenNotPaused {
        _ensureAllowed("mint(address,uint256)");
        _isEligibleToMint(msg.sender, account_, amount_);
        _mint(account_, amount_);
    }

    /**
     * @notice Destroys `amount_` tokens from `account_`, reducing the
     * total supply. Checks access and eligibility.
     * @param account_ Address from which tokens be destroyed.
     * @param amount_ Amount of tokens to be destroyed.
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits MintLimitIncreased with new available limit.
     */
    function burn(address account_, uint256 amount_) external whenNotPaused {
        _ensureAllowed("burn(address,uint256)");
        _burn(account_, amount_);
        _increaseMintLimit(msg.sender, amount_);
    }
}

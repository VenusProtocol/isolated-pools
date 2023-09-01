// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { TokenController } from "./TokenController.sol";

contract XVS is ERC20, TokenController {
    constructor(address accessControlManager_) ERC20("XVS", "Venus XVS") TokenController(accessControlManager_) {}

    function mint(address account_, uint256 amount_) external whenNotPaused {
        _ensureAllowed("mint(address,uint256)");
        _isEligibleToMint(msg.sender, account_, amount_);
        _mint(account_, amount_);
    }

    function burn(address account_, uint256 amount_) external whenNotPaused {
        _ensureAllowed("burn(address,uint256)");
        _burn(account_, amount_);
        _increaseMintLimit(msg.sender, amount_);
    }
}

pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import { XVSVault } from "@venusprotocol/venus-protocol/contracts/XVSVault/XVSVault.sol";

contract XVSVaultScenario is XVSVault {
    constructor(bool timeBased_, uint256 blocksPerYear_) public XVSVault() {
        _initializeTimeManager(timeBased_, blocksPerYear_);
    }
}

pragma solidity 0.5.16;

import { XVSStore } from "@venusprotocol/venus-protocol/contracts/XVSVault/XVSStore.sol";

contract XVSStoreScenario is XVSStore {
    constructor() public XVSStore() {}
}

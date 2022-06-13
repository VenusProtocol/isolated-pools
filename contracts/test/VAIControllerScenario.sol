pragma solidity ^0.8.4;

import "../VAIController.sol";
import "./ComptrollerScenario.sol";

contract VAIControllerScenario is VAIController {
    uint blockNumber;
    address public xvsAddress;
    address public vaiAddress;

    constructor() VAIController() public {}

    function setVAIAddress(address vaiAddress_) public {
        vaiAddress = vaiAddress_;
    }

    function getVAIAddress() public view returns (address) {
        return vaiAddress;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }
}

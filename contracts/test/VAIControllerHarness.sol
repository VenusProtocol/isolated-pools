pragma solidity 0.8.13;

import { VAIController, VToken, IComptroller } from "../Tokens/VAI/VAIController.sol";

contract VAIControllerHarness is VAIController {
    uint256 public blockNumber;
    uint256 public blocksPerYear;

    function setVAIAddress(address VAIAddress_) public {
        VAI = VAIAddress_;
    }

    function harnessRepayVAIFresh(address payer, address account, uint256 repayAmount) public {
        _repayVAIFresh(payer, account, repayAmount);
    }

    function harnessLiquidateVAIFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VToken vTokenCollateral
    ) public {
        _liquidateVAIFresh(liquidator, borrower, repayAmount, vTokenCollateral);
    }

    function harnessFastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;
        return blockNumber;
    }

    function harnessSetBlockNumber(uint256 newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }

    function setBlocksPerYear(uint256 number) public {
        blocksPerYear = number;
    }

    function getBlocksPerYear() public view override returns (uint256) {
        return blocksPerYear;
    }

    function _getBlockNumber() internal view override returns (uint256) {
        return blockNumber;
    }
}

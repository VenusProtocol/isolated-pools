// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC20/ERC20.sol)

pragma solidity ^0.8.0;

// Mainnet: https://etherscan.io/address/0x197e90f9fad81970ba7976f33cbd77088e5d7cf7
contract MockPotLike {
    constructor(){}

    // exchangeRate
    function chi() external view returns (uint) { return 1018143882555548333419823165; }

    // totalSupply
    function pie(address) external view returns (uint) { return 1191137226223751565835533; }

    // accrueInterest -> new exchangeRate
    function drip() external returns (uint) { return 0; }

    // mint
    function join(uint) external {}

    // redeem
    function exit(uint) external {}

    // dsr
    function dsr() external returns (uint) { return 1000000000003170820659990704; }
}
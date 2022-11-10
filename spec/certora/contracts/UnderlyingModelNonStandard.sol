pragma solidity ^0.8.10;

import "../../../contracts/EIP20NonStandardInterface.sol";

import "./SimulationInterface.sol";

contract UnderlyingModelNonStandard is EIP20NonStandardInterface, SimulationInterface {
    uint256 _totalSupply;
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) allowances;

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address owner) external view override returns (uint256 balance) {
        balance = balances[owner];
    }

    function transfer(address dst, uint256 amount) external override {
        address src = msg.sender;
        require(balances[src] >= amount);
        require(balances[dst] + amount >= balances[dst]);

        balances[src] -= amount;
        balances[dst] += amount;
    }

    function transferFrom(
        address src,
        address dst,
        uint256 amount
    ) external override {
        require(allowances[src][msg.sender] >= amount);
        require(balances[src] >= amount);
        require(balances[dst] + amount >= balances[dst]);

        allowances[src][msg.sender] -= amount;
        balances[src] -= amount;
        balances[dst] += amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool success) {
        allowances[msg.sender][spender] = amount;
    }

    function allowance(address owner, address spender) external view override returns (uint256 remaining) {
        remaining = allowances[owner][spender];
    }

    function dummy() external override {
        return;
    }
}

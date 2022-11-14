pragma solidity ^0.8.10;

import "../../../contracts/Maximillion.sol";

contract MaximillionCertora is Maximillion {
    constructor(CEther cEther_) public Maximillion(cEther_) {}

    function borrowBalance(address account) external returns (uint256) {
        return cEther.borrowBalanceCurrent(account);
    }

    function etherBalance(address account) external returns (uint256) {
        return account.balance;
    }

    function repayBehalf(address borrower) public payable override {
        return super.repayBehalf(borrower);
    }
}

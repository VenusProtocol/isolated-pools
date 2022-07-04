
pragma solidity ^0.8.0;

//Mainnet: https://etherscan.io/address/0x19c0976f590d67707e62397c87829d896dc0f1f1
contract MockJugLike {
    // --- Data ---
    struct Ilk {
        uint256 duty;
        uint256  rho;
    }

    mapping (bytes32 => Ilk) public ilks;
    uint256 public base = 0;

    constructor() {
        // ETH-A hex is 0x4554482d41
        ilks["ETH-A"].duty = 1000000000705562181084137268;
        ilks["ETH-A"].rho = 1656354891;
    }
}

pragma solidity 0.8.13;

import { IComptroller } from "../../ComptrollerInterface.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

contract VAIControllerStorage {
    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;

    /// @notice The base rate for stability fee
    uint256 public baseRateMantissa;

    /// @notice The float rate for stability fee
    uint256 public floatRateMantissa;

    /// @notice VAI Mint Rate as a percentage
    uint256 public vaiMintRate;

    /// @notice Accumulator of the total earned interest rate since the opening of the market. For example: 0.6 (60%)
    uint256 public vaiMintIndex;

    /// @notice Block number that interest was last accrued at
    uint256 internal accrualBlockNumber;

    /// @notice VAI mint cap
    uint256 public mintCap;

    /// @notice Comptroller address
    IComptroller public comptroller;

    /// @notice The address of the VAI token
    address internal vai;

    /// @notice Treasury address
    address public treasuryAddress;

    // @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice The address for VAI interest receiver
    address public receiver;

    /// @notice The address of the prime contract. It can be a ZERO address
    address public prime;

    /// @notice Tracks if minting is enabled only for prime token holders. Only used if prime is set
    bool public mintEnabledOnlyForPrimeHolder;

    /// @notice Global vaiMintIndex as of the most recent balance-changing action for user
    mapping(address => uint256) internal vaiMinterInterestIndex;

    /// @notice Tracks the amount of mintedVAI of a user that represents the accrued interest
    mapping(address => uint256) public pastVAIInterest;

    /// @notice The minted VAI amount to each user
    mapping(address => uint256) public mintedVAIs;
}

import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig, task, types } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import { convertToUnit } from "./helpers/utils";

// Generate using https://iancoleman.io/bip39/
const mnemonic = process.env.MNEMONIC || "";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("add market", "Add a market to an existing pool")
  .addParam("poolid", "ID of pool to add a market", 1, types.int)
  .addParam(
    "asset",
    "asset (ERC20) address",
    "0x0000000000000000000000000000000000000000",
    types.string
  )
  .addParam("decimals", "asset decimal places", 8, types.int)
  .addParam("name", "name of the market", undefined, types.string)
  .addParam("symbol", "symbol of market", undefined, types.string)
  .addParam("rateModel", "0 - WhitePaper ; 1- JumpRate", 0, types.int)
  .addParam("baseRate", "base rate per year", 0, types.int)
  .addParam(
    "multiplier",
    "multiplier per year",
    "40000000000000000",
    types.string
  )
  .addParam("jumpMul", "jump multiplier per yer", 0, types.int)
  .addParam("kink", "kink rate", 0, types.int)
  .addParam(
    "collFactor",
    "collateral factor is exonented to 18 decimals (e.g input = input*10**18)",
    0.7,
    types.float
  )
  .setAction(async (taskArgs, hre) => {
    const poolRegistry = await hre.ethers.getContract("PoolRegistry");
    await poolRegistry.addMarket({
      poolId: taskArgs.poolid,
      asset: taskArgs.asset,
      decimals: taskArgs.decimals,
      name: taskArgs.name,
      symbol: taskArgs.symbol,
      rateModel: taskArgs.rateModel,
      baseRatePerYear: taskArgs.baseRate,
      multiplierPerYear: taskArgs.multiplier,
      jumpMultiplierPerYear: taskArgs.jumpMul,
      kink_: taskArgs.kink,
      collateralFactor: convertToUnit(taskArgs.collFactor, 18),
    });
  });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.13",
        settings: {
          optimizer: {
            enabled: true,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
    ],
  },
  namedAccounts: {
    deployer: 0
  },
  networks: {
    hardhat: isFork(),
    development: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337,
    },
    ropsten: {
      url: process.env.ROPSTEN_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      testnet: process.env.BSC_API_KEY || "",
    },
    customChains: [
      {
        network: "testnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },
  paths: {
    tests: "./tests/hardhat",
  },
};

function isFork() {
  return process.env.FORK_MAINNET === "true"
    ? {
        allowUnlimitedContractSize: false,
        loggingEnabled: false,
        forking: {
          url: `https://white-ultra-silence.bsc.discover.quiknode.pro/${process.env.QUICK_NODE_KEY}/`,
          blockNumber: 21068448,
        },
        accounts: {
          accountsBalance: "1000000000000000000",
        },
      }
    : {
        allowUnlimitedContractSize: true,
        loggingEnabled: false,
      };
}

export default config;

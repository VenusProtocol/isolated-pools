import "module-alias/register";

import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import { DeployResult } from "hardhat-deploy/types";
import "hardhat-gas-reporter";
import { HardhatUserConfig, extendConfig, task, types } from "hardhat/config";
import { HardhatConfig } from "hardhat/types";
import "solidity-coverage";
import "solidity-docgen";

import { convertToUnit } from "./helpers/utils";

dotenv.config();
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

extendConfig((config: HardhatConfig) => {
  if (process.env.EXPORT !== "true") {
    config.external = {
      ...config.external,
      deployments: {
        bsctestnet: [
          "node_modules/@venusprotocol/oracle/deployments/bsctestnet",
          "node_modules/@venusprotocol/venus-protocol/deployments/bsctestnet",
          "node_modules/@venusprotocol/protocol-reserve/deployments/bsctestnet",
        ],
        sepolia: [
          "node_modules/@venusprotocol/oracle/deployments/sepolia",
          "node_modules/@venusprotocol/venus-protocol/deployments/sepolia",
          "node_modules/@venusprotocol/protocol-reserve/deployments/sepolia",
        ],
        ethereum: [
          "node_modules/@venusprotocol/oracle/deployments/ethereum",
          "node_modules/@venusprotocol/venus-protocol/deployments/ethereum",
          "node_modules/@venusprotocol/protocol-reserve/deployments/ethereum",
        ],
        bscmainnet: ["node_modules/@venusprotocol/protocol-reserve/deployments/bscmainnet"],
      },
    };
  }
});

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("addMarket", "Add a market to an existing pool")
  .addParam("proxyAdmin", "Admin of vToken proxy")
  .addParam("poolid", "ID of pool to add a market", 1, types.int)
  .addParam("asset", "asset (ERC20) address", "0x0000000000000000000000000000000000000000", types.string)
  .addParam("decimals", "asset decimal places", 8, types.int)
  .addParam("name", "name of the market", undefined, types.string)
  .addParam("symbol", "symbol of market", undefined, types.string)
  .addParam("rateModel", "0 - WhitePaper ; 1- JumpRate", 0, types.int)
  .addParam("baseRate", "base rate per year", 0, types.int)
  .addParam("multiplier", "multiplier per year", "40000000000000000", types.string)
  .addParam("jumpMul", "jump multiplier per yer", 0, types.int)
  .addParam("kink", "kink rate", 0, types.int)
  .addParam("collFactor", "collateral factor is exonented to 18 decimals (e.g input = input*10**18)", 0.7, types.float)
  .setAction(async (taskArgs, hre) => {
    const VBep20Immutable = await hre.ethers.getContractFactory("VBep20Immutable");
    const tokenImplementation = await VBep20Immutable.deploy();
    await tokenImplementation.deployed();

    const poolRegistry = await hre.ethers.getContract("PoolRegistry");
    const accessControl = await hre.ethers.getContract("AccessControlManager");

    await poolRegistry.addMarket({
      comptroller: taskArgs.comptroller,
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
      accessControlManager: accessControl.address,
      vTokenProxyAdmin: taskArgs.proxyAdmin,
      tokenImplementation_: tokenImplementation.address,
    });

    console.log("Market " + taskArgs.name + " added successfully to pool " + taskArgs.comptroller);
  });

task("deployComptroller", "Deploys a Comptroller Implementation")
  .addParam("contractName", "Contract name, later we can load contracts by name")
  .addParam("poolRegistry", "Address of PoolRegistry Contract")
  .setAction(async (taskArgs, hre) => {
    const { deployer } = await hre.getNamedAccounts();
    const Comptroller: DeployResult = await hre.deployments.deploy(taskArgs.contractName, {
      contract: "Comptroller",
      from: deployer,
      args: [taskArgs.poolRegistry],
      log: true,
    });

    console.log("Comptroller implementation deployed with address: " + Comptroller.address);
  });

task("createPool", "Creates a pool via PoolRegistry")
  .addParam("poolName", "Name of the pool")
  .addParam("comptroller", "Address of comptroller implementation")
  .addParam("oracle", "Contract name, later we can load contracts by name")
  .addParam("closeFactor", "Close factor for pool")
  .addParam("liquidationIncentive", "Liquidation incentive for pool")
  .setAction(async (taskArgs, hre) => {
    const poolRegistry = await hre.ethers.getContract("PoolRegistry");
    await poolRegistry.createRegistryPool(
      taskArgs.poolName,
      taskArgs.comptroller,
      taskArgs.closeFactor,
      taskArgs.liquidationIncentive,
      taskArgs.minLiquidatableCollateral,
      taskArgs.oracle,
    );

    const pools = await poolRegistry.callStatic.getAllPools();
    await hre.ethers.getContractAt("Comptroller", pools[0].comptroller);

    const unitroller = await hre.ethers.getContractAt("Unitroller", pools[0].comptroller);
    await unitroller._acceptAdmin();

    console.log("Pool " + taskArgs.poolName + " has been sucessfully created");
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
            details: {
              yul: !process.env.CI,
            },
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
            details: {
              yul: !process.env.CI,
            },
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            details: {
              yul: !process.env.CI,
            },
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
  networks: {
    hardhat: isFork(),
    development: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337,
      live: false,
    },
    bsctestnet: {
      url: process.env.ARCHIVE_NODE_bsctestnet || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      live: true,
      gasPrice: 20000000000,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`] : [],
    },
    // Mainnet deployments are done through Frame wallet RPC
    bscmainnet: {
      url: process.env.ARCHIVE_NODE_bscmainnet || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      live: true,
      timeout: 1200000, // 20 minutes
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`] : [],
    },
    ethereum: {
      url: process.env.ARCHIVE_NODE_ethereum || "https://ethereum.blockpi.network/v1/rpc/public",
      chainId: 1,
      live: true,
      timeout: 1200000, // 20 minutes
    },
    sepolia: {
      url: process.env.ARCHIVE_NODE_sepolia || "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      chainId: 11155111,
      live: true,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`] : [],
    },
    opbnbtestnet: {
      url: process.env.ARCHIVE_NODE_opbnbtestnet || "https://opbnb-testnet-rpc.bnbchain.org",
      chainId: 5611,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    opbnbmainnet: {
      url: process.env.ARCHIVE_NODE_opbnbmainnet || "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    customChains: [
      {
        network: "bsctestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "bscmainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "opbnbtestnet",
        chainId: 5611,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.ETHERSCAN_API_KEY}/op-bnb-testnet/contract/`,
          browserURL: "https://testnet.opbnbscan.com/",
        },
      },
      {
        network: "opbnbmainnet",
        chainId: 204,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.ETHERSCAN_API_KEY}/op-bnb-mainnet/contract/`,
          browserURL: "https://opbnbscan.com/",
        },
      },
    ],
    apiKey: {
      bscmainnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      bsctestnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      opbnbtestnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      opbnbmainnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
    },
  },
  paths: {
    tests: "./tests",
  },
  // Hardhat deploy
  namedAccounts: {
    deployer: 0,
    acc1: 1,
    acc2: 2,
    proxyAdmin: 3,
    acc3: 4,
  },
  docgen: {
    outputDir: "./docs",
    pages: "files",
    templates: "./docgen-templates",
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/@venusprotocol/oracle/artifacts",
      },
      {
        artifacts: "node_modules/@venusprotocol/venus-protocol/artifacts",
      },
    ],
  },
};

function isFork() {
  return process.env.FORK === "true"
    ? {
        allowUnlimitedContractSize: false,
        loggingEnabled: false,
        forking: {
          url:
            process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK}`] ||
            "https://data-seed-prebsc-1-s1.binance.org:8545",
          blockNumber: 26349263,
        },
        accounts: {
          accountsBalance: "1000000000000000000",
        },
        live: false,
      }
    : {
        allowUnlimitedContractSize: true,
        loggingEnabled: false,
        live: false,
      };
}
export default config;

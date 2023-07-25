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
import { HardhatUserConfig, task, types } from "hardhat/config";
import "solidity-coverage";
import "solidity-docgen";

import { convertToUnit } from "./helpers/utils";

dotenv.config();

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
  .addParam("accessControl", "Address of AccessControlManager contract")
  .setAction(async (taskArgs, hre) => {
    const { deployer } = await hre.getNamedAccounts();
    const Comptroller: DeployResult = await hre.deployments.deploy(taskArgs.contractName, {
      contract: "Comptroller",
      from: deployer,
      args: [taskArgs.poolRegistry, taskArgs.accessControl],
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
      url: "https://bsc-testnet.public.blastapi.io",
      chainId: 97,
      live: true,
      gasPrice: 20000000000,
      accounts: {
        mnemonic: process.env.MNEMONIC || "",
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
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
    deployments: {
      bsctestnet: ["node_modules/@venusprotocol/oracle/deployments/bsctestnet"],
    },
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
        live: false,
      }
    : {
        allowUnlimitedContractSize: true,
        loggingEnabled: false,
        live: false,
      };
}

export default config;

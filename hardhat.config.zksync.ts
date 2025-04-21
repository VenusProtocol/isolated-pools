import "module-alias/register";

import "@matterlabs/hardhat-zksync";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import * as dotenv from "dotenv";
import "hardhat-dependency-compiler";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import { HardhatUserConfig, extendConfig, extendEnvironment, subtask, task } from "hardhat/config";
import { HardhatConfig } from "hardhat/types";
import "solidity-docgen";

import "./type-extensions";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

extendConfig((config: HardhatConfig) => {
  if (process.env.EXPORT !== "true") {
    config.external = {
      ...config.external,
      deployments: {
        zksyncsepolia: [
          "node_modules/@venusprotocol/protocol-reserve/deployments/zksyncsepolia",
          "node_modules/@venusprotocol/governance-contracts/deployments/zksyncsepolia",
        ],
        zksyncmainnet: [
          "node_modules/@venusprotocol/protocol-reserve/deployments/zksyncmainnet",
          "node_modules/@venusprotocol/governance-contracts/deployments/zksyncmainnet",
        ],
      },
    };
  }
});

extendEnvironment(hre => {
  hre.getNetworkName = () => process.env.HARDHAT_FORK_NETWORK || hre.network.name;
});

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  zksolc: {
    version: "1.5.3",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.25",
        settings: {
          optimizer: {
            enabled: true,
            details: {
              yul: !process.env.CI,
            },
          },
          evmVersion: "paris",
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
    hardhat: {
      allowUnlimitedContractSize: true,
      loggingEnabled: false,
      live: false,
      zksync: true,
    },
    zksyncsepolia: {
      url: process.env.ARCHIVE_NODE_zksyncsepolia || "https://sepolia.era.zksync.dev",
      ethNetwork: "sepolia",
      verifyURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
      zksync: true,
      live: true,
      tags: ["testnet"],
    },
    zksyncmainnet: {
      url: process.env.ARCHIVE_NODE_zksyncmainnet || "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      verifyURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
      zksync: true,
      live: true,
    },
    zksynctestnode: {
      url: process.env.ZKSYNC_ERA_LOCAL_TEST_NODE || "http://localhost:8011",
      chainId: 324,
      ethNetwork: "mainnet",
      blockGasLimit: 30000000,
      timeout: 2000000000,
      zksync: true,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    tests: "./tests",
    cache: "./cache-zk",
    artifacts: "./artifacts-zk",
  },
  docgen: {
    outputDir: "./docs",
    pages: "files",
    templates: "./docgen-templates",
  },
  // Hardhat deploy
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
      acc1: 1,
      acc2: 2,
      proxyAdmin: 3,
      acc3: 4,
    },
  },
  dependencyCompiler: {
    paths: [
      "hardhat-deploy/solc_0.8/proxy/OptimizedTransparentUpgradeableProxy.sol",
      "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol",
    ],
  },
  mocha: {
    timeout: 100000000,
  },
};

// Added a subtask to exclude some solidity files from compilation due to limitation in zksync compiler, https://docs.zksync.io/zk-stack/components/compiler/toolchain/solidity#limitations
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
  const paths = await runSuper();
  // List the files to exclude that are not being deployed on zkSync
  const filesToExclude = ["WrappedNative"];

  return paths.filter(p => {
    return !filesToExclude.some(file => p.includes(file));
  });
});

export default config;

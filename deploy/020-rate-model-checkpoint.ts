import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { getRateModelName, getRateModelParams } from "../helpers/rateModelHelpers";
import { writeGeneratedContract } from "../helpers/writeFile";

const checkpoints = {
  bsctestnet: {
    at: 1748243100, // 2025-05-26 07:05:00 AM UTC,
    fromBlocksPerYear: 21_024_000,
    toBlocksPerYear: 42_048_000,
  },
  bscmainnet: {
    at: 1745903100, // 2025-04-29 05:05:00 AM UTC
    fromBlocksPerYear: 10_512_000,
    toBlocksPerYear: 21_024_000,
  },
  opbnbtestnet: {
    at: 1743562800, // 2025-04-02 03:00:00 AM UTC,
    fromBlocksPerYear: 31_536_000,
    toBlocksPerYear: 63_072_000,
  },
  opbnbmainnet: {
    at: 1745204400, // 2025-04-21 03:00:00 AM UTC
    fromBlocksPerYear: 31_536_000,
    toBlocksPerYear: 63_072_000,
  },
};

const capitalize = (s: string) => `${s.charAt(0).toUpperCase()}${s.substring(1)}`;

const getSetterContractName = (networkName: string) => `SetCheckpoint${capitalize(networkName)}`;

const generateSetterContract = (networkName: string, admin: string, setterCode: string[]) => {
  const body = setterCode.map(line => `        ${line}`).join("\n");
  return `
// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

interface VTokenInterface {
    function setInterestRateModel(address) external;
}

contract ${getSetterContractName(networkName)} {
    error Unauthorized();

    function run() external {
        if (msg.sender != ${admin}) {
            revert Unauthorized();
        }
${body}
    }
}`;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chain = hre.getNetworkName() as keyof typeof checkpoints; // ok since we skip the others
  const { poolConfig } = await getConfig(chain);
  const timelock = await deployments.get("NormalTimelock");

  const { at, fromBlocksPerYear, toBlocksPerYear } = checkpoints[chain];
  const setterCode: string[] = [];
  for (const pool of poolConfig) {
    // Deploy IR Models
    for (const vTokenConfig of pool.vtokens) {
      const { symbol } = vTokenConfig;
      const rateModelParams = getRateModelParams(vTokenConfig);
      console.log(`Deploying checkpoint view for ${symbol}`);
      const oldRateModelName = getRateModelName(rateModelParams, {
        isTimeBased: false,
        blocksPerYear: fromBlocksPerYear,
      });
      const newRateModelName = getRateModelName(rateModelParams, {
        isTimeBased: false,
        blocksPerYear: toBlocksPerYear,
      });
      console.log("  from", oldRateModelName);
      console.log("    to", newRateModelName);
      const oldRateModel = await deployments.get(oldRateModelName);
      const newRateModel = await deployments.get(newRateModelName);
      const checkpointViewName = `CheckpointView_From_${oldRateModelName}_To_bpy${toBlocksPerYear}_At_${at}`;
      const checkpointView = await deploy(checkpointViewName, {
        contract: "CheckpointView",
        from: deployer,
        args: [oldRateModel.address, newRateModel.address, at],
        log: true,
        skipIfAlreadyDeployed: true,
      });
      const vToken = await deployments.get(`VToken_${symbol}`);
      setterCode.push("");
      setterCode.push(`// ${symbol} -> ${checkpointViewName}`);
      setterCode.push(`VTokenInterface(${vToken.address}).setInterestRateModel(${checkpointView.address});`);
      console.log(`-----------------------------------------`);
    }
  }
  const setterContractCode = generateSetterContract(chain, timelock.address, setterCode);
  writeGeneratedContract(`${getSetterContractName(chain)}.sol`, setterContractCode);
};

func.tags = ["RateModelCheckpoint"];
func.skip = async hre => !Object.keys(checkpoints).includes(hre.network.name);

export default func;

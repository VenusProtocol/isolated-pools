import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { InterestRateModels } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo, toAddress } from "../helpers/deploymentUtils";
import { getRateModelName, getRateModelParams } from "../helpers/rateModelHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { poolConfig, preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );

  for (const pool of poolConfig) {
    // Deploy IR Models
    for (const vTokenConfig of pool.vtokens) {
      const { symbol } = vTokenConfig;
      const rateModelParams = getRateModelParams(vTokenConfig);
      const rateModelName = getRateModelName(rateModelParams, { isTimeBased, blocksPerYear });
      if (rateModelParams.model === InterestRateModels.JumpRate) {
        console.log(`Deploying interest rate model ${rateModelName} for ${symbol}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "JumpRateModelV2",
          args: [
            rateModelParams.baseRatePerYear,
            rateModelParams.multiplierPerYear,
            rateModelParams.jumpMultiplierPerYear,
            rateModelParams.kink,
            accessControlManagerAddress,
            isTimeBased,
            blocksPerYear,
          ],
          log: true,
          autoMine: true,
          skipIfAlreadyDeployed: true,
        });
      } else if (rateModelParams.model === InterestRateModels.WhitePaper) {
        console.log(`Deploying interest rate model ${rateModelName} for ${symbol}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "WhitePaperInterestRateModel",
          args: [rateModelParams.baseRatePerYear, rateModelParams.multiplierPerYear, isTimeBased, blocksPerYear],
          log: true,
          autoMine: true,
          skipIfAlreadyDeployed: true,
        });
      } else if (rateModelParams.model === InterestRateModels.TwoKinks) {
        console.log(`Deploying interest rate model ${rateModelName} for ${symbol}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "TwoKinksInterestRateModel",
          args: [
            rateModelParams.baseRatePerYear,
            rateModelParams.multiplierPerYear,
            rateModelParams.kink,
            rateModelParams.multiplierPerYear2,
            rateModelParams.baseRatePerYear2,
            rateModelParams.kink2,
            rateModelParams.jumpMultiplierPerYear,
            isTimeBased,
            blocksPerYear,
          ],
          log: true,
          autoMine: true,
          skipIfAlreadyDeployed: true,
        });
      }
      console.log(`-----------------------------------------`);
    }
  }
};

func.tags = ["IR"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

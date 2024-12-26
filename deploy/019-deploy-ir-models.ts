import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { InterestRateModels } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo, toAddress } from "../helpers/deploymentUtils";

const mantissaToBps = (num?: BigNumberish) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { poolConfig, preconfiguredAddresses } = await getConfig(hre.network.name);

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.network.name);

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );

  for (const pool of poolConfig) {
    // Deploy IR Models
    for (const vtoken of pool.vtokens) {
      const { rateModel, baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_, kink2_, multiplierPerYear2, baseRatePerYear2 } = vtoken;

      if (rateModel === InterestRateModels.JumpRate.toString()) {
        const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_].map(mantissaToBps);
        const rateModelName = `JumpRateModelV2_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "JumpRateModelV2",
          args: [
            baseRatePerYear,
            multiplierPerYear,
            jumpMultiplierPerYear,
            kink_,
            accessControlManagerAddress,
            isTimeBased,
            blocksPerYear,
          ],
          log: true,
          autoMine: true,
          skipIfAlreadyDeployed: true,
        });
      } else if (rateModel === InterestRateModels.WhitePaper.toString()) {
        const [b, m] = [baseRatePerYear, multiplierPerYear].map(mantissaToBps);
        const rateModelName = `WhitePaperInterestRateModel_base${b}bps_slope${m}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "WhitePaperInterestRateModel",
          args: [baseRatePerYear, multiplierPerYear, isTimeBased, blocksPerYear],
          log: true,
          autoMine: true,
          skipIfAlreadyDeployed: true,
        });
      } else {
        const [b, m, k, m2, b2, k2, j] = [baseRatePerYear, multiplierPerYear, kink_, multiplierPerYear2, baseRatePerYear2, kink2_, jumpMultiplierPerYear].map(mantissaToBps);
        const rateModelName = `TwoKinks_base${b}bps_slope${m}bps_kink${k}bps_slope2${m2}bps_base2${b2}bps_kink2${k2}bps_jump${j}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "TwoKinksInterestRateModel",
          args: [
            baseRatePerYear,
            multiplierPerYear,
            kink_,
            multiplierPerYear2,
            baseRatePerYear2,
            kink2_,
            jumpMultiplierPerYear,
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

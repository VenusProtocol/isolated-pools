import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { blocksPerYear, getConfig } from "../helpers/deploymentConfig";
import { InterestRateModels } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const mantissaToBps = (num: BigNumberish) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { poolConfig, preconfiguredAddresses } = await getConfig(hre.network.name);

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );

  for (const pool of poolConfig) {
    // Deploy IR Models
    for (const vtoken of pool.vtokens) {
      const { rateModel, baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_ } = vtoken;

      const BLOCKS_PER_YEAR: number = blocksPerYear[hre.network.name];
      if (rateModel === InterestRateModels.JumpRate.toString()) {
        const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_].map(mantissaToBps);
        const rateModelName = `JumpRateModelV2_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "JumpRateModelV2",
          args: [
            BLOCKS_PER_YEAR,
            baseRatePerYear,
            multiplierPerYear,
            jumpMultiplierPerYear,
            kink_,
            accessControlManagerAddress,
          ],
          log: true,
          autoMine: true,
        });
      } else {
        const [b, m] = [baseRatePerYear, multiplierPerYear].map(mantissaToBps);
        const rateModelName = `WhitePaperInterestRateModel_base${b}bps_slope${m}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        await deploy(rateModelName, {
          from: deployer,
          contract: "WhitePaperInterestRateModel",
          args: [BLOCKS_PER_YEAR, baseRatePerYear, multiplierPerYear],
          log: true,
          autoMine: true,
        });
      }
      console.log(`-----------------------------------------`);
    }
  }
};

func.tags = ["IR"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

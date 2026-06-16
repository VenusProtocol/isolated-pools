import { BigNumber } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { InterestRateModels, getConfig } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo, toAddress } from "../helpers/deploymentUtils";
import { JumpRateModelParams, getRateModelName } from "../helpers/rateModelHelpers";
import { convertToUnit } from "../helpers/utils";

// Market-deprecation "push-out" interest rate model (isolated pools).
// Flat high pre-kink borrow rate (300%) with a steep post-kink curve (up to 500% at 100% util)
// to make borrowing non-competitive and migrate positions off the deprecated markets.
// Same annualized params on every chain; the time-base (block-based vs time-based) and
// blocksPerYear are auto-resolved per network via getBlockOrTimestampBasedDeploymentInfo,
// so a single uniquely-named JumpRateModelV2 is deployed per chain (idempotent by name).
// Encodes to JumpRateModelV2_base30000bps_slope0bps_jump36364bps_kink4500bps_<bpyN | timeBased>.
const pushOutRateModelParams: JumpRateModelParams = {
  model: InterestRateModels.JumpRate,
  baseRatePerYear: BigNumber.from(convertToUnit(3, 18)), // 300%
  multiplierPerYear: BigNumber.from(0), // flat slope1
  jumpMultiplierPerYear: BigNumber.from(convertToUnit(3.6364, 18)), // 363.64%
  kink: BigNumber.from(convertToUnit(0.45, 18)), // 0.45
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );
  console.log("Deploying with deployer:", deployer);

  const constructorArgs = [
    pushOutRateModelParams.baseRatePerYear,
    pushOutRateModelParams.multiplierPerYear,
    pushOutRateModelParams.jumpMultiplierPerYear,
    pushOutRateModelParams.kink,
    accessControlManagerAddress,
    isTimeBased,
    blocksPerYear,
  ];

  const rateModelName = getRateModelName(pushOutRateModelParams, { isTimeBased, blocksPerYear });
  console.log(`Deploying push-out interest rate model ${rateModelName}`);
  const rateModel = await deploy(rateModelName, {
    from: deployer,
    contract: "JumpRateModelV2",
    args: constructorArgs,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  if (rateModel.newlyDeployed && hre.network.live) {
    console.log(`Verifying ${rateModelName} at ${rateModel.address}...`);
    try {
      await hre.run("verify:verify", {
        address: rateModel.address,
        constructorArguments: constructorArgs,
      });
      console.log(`${rateModelName} verified successfully`);
    } catch (error: any) {
      if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
        console.log(`${rateModelName} already verified`);
      } else {
        console.error("Verification failed:", error.message);
      }
    }
  }
  console.log(`-----------------------------------------`);
};

func.tags = ["PushOutIR"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SECONDS_PER_YEAR, getConfig } from "../../helpers/deploymentConfig";
import { InterestRateModels } from "../../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo } from "../../helpers/deploymentUtils";
import {
  JumpRateModelParams,
  RateModelParams,
  TimeManagerParams,
  TwoKinksRateModelParams,
  WpRateModelParams,
  getRateModelName,
  getRateModelParams,
} from "../../helpers/rateModelHelpers";

const expectEqual = (msg: string, a: BigNumber, b: BigNumber) => {
  if (!a.eq(b)) {
    throw new Error(`Expected ${a.toString()} == ${b.toString()}\n${msg}`);
  }
};

const checkBlocksOrSecondsPerYear = async (rateModel: Contract, name: string, expected: number) => {
  try {
    expectEqual(
      `Checking blocksOrSecondsPerYear for ${name} at ${rateModel.address}`,
      await rateModel.blocksOrSecondsPerYear(),
      BigNumber.from(expected),
    );
  } catch (err) {
    console.warn(`Could not get blocks per year for rate model at ${rateModel.address}, assuming ${expected}`);
  }
};

// Only for block-based
const checkWpRateModel = async (
  rateModelAddress: string,
  params: WpRateModelParams,
  timeManagerParams: TimeManagerParams,
) => {
  const blocksOrSecondsPerYear = timeManagerParams.isTimeBased ? SECONDS_PER_YEAR : timeManagerParams.blocksPerYear;
  const name = getRateModelName(params, timeManagerParams);
  const rateModel = await ethers.getContractAt("WhitePaperInterestRateModel", rateModelAddress);
  await checkBlocksOrSecondsPerYear(rateModel, name, blocksOrSecondsPerYear);
  expectEqual(
    `Checking baseRatePerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.baseRatePerBlock(),
    params.baseRatePerYear.div(blocksOrSecondsPerYear),
  );
  expectEqual(
    `Checking multiplierPerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.multiplierPerBlock(),
    params.multiplierPerYear.div(blocksOrSecondsPerYear),
  );
};

const checkJumpRateModel = async (
  rateModelAddress: string,
  params: JumpRateModelParams,
  timeManagerParams: TimeManagerParams,
) => {
  const blocksOrSecondsPerYear = timeManagerParams.isTimeBased ? SECONDS_PER_YEAR : timeManagerParams.blocksPerYear;
  const name = getRateModelName(params, timeManagerParams);
  const rateModel = await ethers.getContractAt("JumpRateModelV2", rateModelAddress);
  await checkBlocksOrSecondsPerYear(rateModel, name, blocksOrSecondsPerYear);
  expectEqual(
    `Checking baseRatePerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.baseRatePerBlock(),
    params.baseRatePerYear.div(blocksOrSecondsPerYear),
  );
  expectEqual(
    `Checking multiplierPerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.multiplierPerBlock(),
    params.multiplierPerYear.div(blocksOrSecondsPerYear),
  );
  expectEqual(
    `Checking jumpMultiplierPerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.jumpMultiplierPerBlock(),
    params.jumpMultiplierPerYear.div(blocksOrSecondsPerYear),
  );
  expectEqual(`Checking kink for ${name} at ${rateModelAddress}`, await rateModel.kink(), params.kink);
};

const checkTwoKinksRateModel = async (
  rateModelAddress: string,
  params: TwoKinksRateModelParams,
  timeManagerParams: TimeManagerParams,
) => {
  const blocksOrSecondsPerYear = timeManagerParams.isTimeBased ? SECONDS_PER_YEAR : timeManagerParams.blocksPerYear;
  const name = getRateModelName(params, timeManagerParams);
  const rateModel = await ethers.getContractAt("TwoKinksInterestRateModel", rateModelAddress);
  await checkBlocksOrSecondsPerYear(rateModel, name, blocksOrSecondsPerYear);
  expectEqual(
    `Checking BASE_RATE_PER_BLOCK_OR_SECOND for ${name} at ${rateModelAddress}`,
    await rateModel.BASE_RATE_PER_BLOCK_OR_SECOND(),
    params.baseRatePerYear.div(blocksOrSecondsPerYear),
  );
  expectEqual(
    `Checking MULTIPLIER_PER_BLOCK_OR_SECOND for ${name} at ${rateModelAddress}`,
    await rateModel.MULTIPLIER_PER_BLOCK_OR_SECOND(),
    params.multiplierPerYear.div(blocksOrSecondsPerYear),
  );
  expectEqual(`${name}.KINK_1`, await rateModel.KINK_1(), params.kink);
  expectEqual(
    `Checking BASE_RATE_2_PER_BLOCK_OR_SECOND for ${name} at ${rateModelAddress}`,
    await rateModel.BASE_RATE_2_PER_BLOCK_OR_SECOND(),
    params.baseRatePerYear2.div(blocksOrSecondsPerYear),
  );
  expectEqual(
    `Checking MULTIPLIER_2_PER_BLOCK_OR_SECOND for ${name} at ${rateModelAddress}`,
    await rateModel.MULTIPLIER_2_PER_BLOCK_OR_SECOND(),
    params.multiplierPerYear2.div(blocksOrSecondsPerYear),
  );
  expectEqual(`${name}.KINK_2`, await rateModel.KINK_2(), params.kink2);
  expectEqual(
    `Checking JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND for ${name} at ${rateModelAddress}`,
    await rateModel.JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND(),
    params.jumpMultiplierPerYear.div(blocksOrSecondsPerYear),
  );
};

const checkRateModel = (
  rateModelAddress: string,
  params: RateModelParams,
  timeManagerParams: TimeManagerParams,
): Promise<void> => {
  switch (params.model) {
    case InterestRateModels.WhitePaper:
      return checkWpRateModel(rateModelAddress, params, timeManagerParams);
    case InterestRateModels.JumpRate:
      return checkJumpRateModel(rateModelAddress, params, timeManagerParams);
    case InterestRateModels.TwoKinks:
      return checkTwoKinksRateModel(rateModelAddress, params, timeManagerParams);
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const { poolConfig } = await getConfig(hre.getNetworkName());

  const deploymentInfo = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  for (const pool of poolConfig) {
    for (const vTokenConfig of pool.vtokens) {
      const { symbol } = vTokenConfig;
      const params = getRateModelParams(vTokenConfig);
      console.log(`Checking interest rate model of ${symbol}`);
      const vTokenAddress = (await deployments.get(`VToken_${symbol}`)).address;
      const vToken = await ethers.getContractAt("VToken", vTokenAddress);
      const rateModelAddress = await vToken.interestRateModel();
      const name = getRateModelName(params, deploymentInfo);
      console.log(`Rate model at ${rateModelAddress} should be ${name}`);
      await checkRateModel(rateModelAddress, params, deploymentInfo);
      console.log("✅ Success");
      console.log(`-----------------------------------------`);
    }
  }
};

func.tags = ["CheckIRMs"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

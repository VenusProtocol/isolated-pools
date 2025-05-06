// These helpers convert the existing configs to stronger typed ones
// and provide a naming scheme for rate model contracts
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { DeploymentInfo, InterestRateModels, VTokenConfig } from "./deploymentConfig";

export const mantissaToBps = (num: BigNumber) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

export type TimeManagerParams = Pick<DeploymentInfo, "isTimeBased" | "blocksPerYear">;

export type WpRateModelParams = {
  model: InterestRateModels.WhitePaper;
  baseRatePerYear: BigNumber;
  multiplierPerYear: BigNumber;
};

export type JumpRateModelParams = {
  model: InterestRateModels.JumpRate;
  baseRatePerYear: BigNumber;
  multiplierPerYear: BigNumber;
  jumpMultiplierPerYear: BigNumber;
  kink: BigNumber;
};

export type TwoKinksRateModelParams = {
  model: InterestRateModels.TwoKinks;
  baseRatePerYear: BigNumber;
  multiplierPerYear: BigNumber;
  kink: BigNumber;
  baseRatePerYear2: BigNumber;
  multiplierPerYear2: BigNumber;
  kink2: BigNumber;
  jumpMultiplierPerYear: BigNumber;
};

export type RateModelParams = WpRateModelParams | JumpRateModelParams | TwoKinksRateModelParams;

export const getRateModelParams = (config: VTokenConfig): RateModelParams => {
  if (config.rateModel === InterestRateModels.WhitePaper.toString()) {
    const { baseRatePerYear, multiplierPerYear } = config;
    return {
      model: InterestRateModels.WhitePaper,
      baseRatePerYear: BigNumber.from(baseRatePerYear),
      multiplierPerYear: BigNumber.from(multiplierPerYear),
    };
  } else if (config.rateModel === InterestRateModels.JumpRate.toString()) {
    const { baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_ } = config;
    return {
      model: InterestRateModels.JumpRate,
      baseRatePerYear: BigNumber.from(baseRatePerYear),
      multiplierPerYear: BigNumber.from(multiplierPerYear),
      jumpMultiplierPerYear: BigNumber.from(jumpMultiplierPerYear),
      kink: BigNumber.from(kink_),
    };
  } else if (config.rateModel === InterestRateModels.TwoKinks.toString()) {
    const {
      baseRatePerYear,
      multiplierPerYear,
      jumpMultiplierPerYear,
      kink_,
      kink2_,
      multiplierPerYear2,
      baseRatePerYear2,
    } = config;
    return {
      model: InterestRateModels.TwoKinks,
      baseRatePerYear: BigNumber.from(baseRatePerYear),
      multiplierPerYear: BigNumber.from(multiplierPerYear),
      kink: BigNumber.from(kink_),
      baseRatePerYear2: BigNumber.from(baseRatePerYear2),
      multiplierPerYear2: BigNumber.from(multiplierPerYear2),
      kink2: BigNumber.from(kink2_),
      jumpMultiplierPerYear: BigNumber.from(jumpMultiplierPerYear),
    };
  }
  throw new Error(`Unsupported rate model ${config.rateModel}`);
};

export const getTimeManagerSuffix = (params: TimeManagerParams) => {
  if (params.isTimeBased) {
    return "timeBased";
  }
  return `bpy${params.blocksPerYear}`;
};

export const getRateModelName = (params: RateModelParams, timeManagerParams: TimeManagerParams): string => {
  const suffix = getTimeManagerSuffix(timeManagerParams);
  switch (params.model) {
    case InterestRateModels.WhitePaper: {
      const [b, m] = [params.baseRatePerYear, params.multiplierPerYear].map(mantissaToBps);
      return `WhitePaperInterestRateModel_base${b}bps_slope${m}bps_${suffix}`;
    }
    case InterestRateModels.JumpRate: {
      const { baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink } = params;
      const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink].map(mantissaToBps);
      return `JumpRateModelV2_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps_${suffix}`;
    }
    case InterestRateModels.TwoKinks: {
      const [b, m, k, m2, b2, k2, j] = [
        params.baseRatePerYear,
        params.multiplierPerYear,
        params.kink,
        params.multiplierPerYear2,
        params.baseRatePerYear2,
        params.kink2,
        params.jumpMultiplierPerYear,
      ].map(mantissaToBps);
      return `TwoKinks_base${b}bps_slope${m}bps_kink${k}bps_slope2${m2}bps_base2${b2}bps_kink2${k2}bps_jump${j}bps_${suffix}`;
    }
  }
};

import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import { InterestRateModels } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo, getUnregisteredVTokens, toAddress } from "../helpers/deploymentUtils";
import { AddressOne } from "../helpers/utils";

const mantissaToBps = (num: BigNumberish) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokensConfig, poolConfig, preconfiguredAddresses } = await getConfig(hre.network.name);

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.network.name);
  const maxBorrowRateMantissa = BigNumber.from(0.0005e16);

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );

  // VToken Beacon
  const vTokenImpl: DeployResult = await deploy("VTokenImpl", {
    contract: "VToken",
    from: deployer,
    args: [isTimeBased, blocksPerYear, maxBorrowRateMantissa],
    log: true,
    autoMine: true,
  });

  const vTokenBeacon: DeployResult = await deploy("VTokenBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [vTokenImpl.address],
    log: true,
    autoMine: true,
  });

  const poolsWithUnregisteredVTokens = await getUnregisteredVTokens(poolConfig, hre);
  for (const pool of poolsWithUnregisteredVTokens) {
    const comptrollerProxy = await ethers.getContract(`Comptroller_${pool.id}`);

    // Deploy Markets
    for (const vtoken of pool.vtokens) {
      const {
        name,
        asset,
        symbol,
        rateModel,
        baseRatePerYear,
        multiplierPerYear,
        jumpMultiplierPerYear,
        kink_,
        reserveFactor,
      } = vtoken;

      const token = getTokenConfig(asset, tokensConfig);
      let tokenContract;
      if (token.isMock) {
        tokenContract = await ethers.getContract(`Mock${token.symbol}`);
      } else {
        tokenContract = await ethers.getContractAt(
          "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
          token.tokenAddress,
        );
      }

      let rateModelAddress: string;
      if (rateModel === InterestRateModels.JumpRate.toString()) {
        const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_].map(mantissaToBps);
        const rateModelName = `JumpRateModelV2_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        const result: DeployResult = await deploy(rateModelName, {
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
        });
        rateModelAddress = result.address;
      } else {
        const [b, m] = [baseRatePerYear, multiplierPerYear].map(mantissaToBps);
        const rateModelName = `WhitePaperInterestRateModel_base${b}bps_slope${m}bps`;
        console.log(`Deploying interest rate model ${rateModelName}`);
        const result: DeployResult = await deploy(rateModelName, {
          from: deployer,
          contract: "WhitePaperInterestRateModel",
          args: [baseRatePerYear, multiplierPerYear, isTimeBased, blocksPerYear],
          log: true,
          autoMine: true,
        });
        rateModelAddress = result.address;
      }

      console.log(`Deploying VToken proxy for ${symbol}`);
      const VToken = await ethers.getContractFactory("VToken");
      const underlyingDecimals = Number(await tokenContract.decimals());
      const vTokenDecimals = 8;
      const treasuryAddress = await toAddress(preconfiguredAddresses.VTreasury || "VTreasury", hre);
      const args = [
        tokenContract.address,
        comptrollerProxy.address,
        rateModelAddress,
        parseUnits("1", underlyingDecimals + 18 - vTokenDecimals),
        name,
        symbol,
        vTokenDecimals,
        preconfiguredAddresses.NormalTimelock || deployer, // admin
        accessControlManagerAddress,
        [AddressOne, treasuryAddress],
        reserveFactor,
      ];
      await deploy(`VToken_${symbol}`, {
        from: deployer,
        contract: "BeaconProxy",
        args: [vTokenBeacon.address, VToken.interface.encodeFunctionData("initialize", args)],
        log: true,
        autoMine: true,
      });
      console.log(`-----------------------------------------`);
    }
  }
};

func.tags = ["VTokens", "il"];

export default func;

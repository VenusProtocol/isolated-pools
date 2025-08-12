import timelocksDeployment from "@venusprotocol/governance-contracts/dist/deploy/001-source-timelocks";
import deployProtocolShareReserve from "@venusprotocol/protocol-reserve/dist/deploy/000-psr";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getMaxBorrowRateMantissa, getTokenConfig } from "../helpers/deploymentConfig";
import { InterestRateModels } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo, getUnregisteredVTokens, toAddress } from "../helpers/deploymentUtils";
import { getRateModelName, getRateModelParams } from "../helpers/rateModelHelpers";
import { AddressOne } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = hre.getNetworkName();
  const { tokensConfig, poolConfig, preconfiguredAddresses } = await getConfig(networkName);

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());
  const maxBorrowRateMantissa = getMaxBorrowRateMantissa(hre.network.name);

  if (networkName === "bscmainnet" || networkName === "bsctestnet" || networkName === "hardhat") {
    await timelocksDeployment(hre);
  }
  const timelock = await toAddress(preconfiguredAddresses.NormalTimelock || "NormalTimelock");

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );

  let vTokenOwner = timelock;
  if (!vTokenOwner || !hre.network.live) {
    console.warn("Using deployer as vToken owner");
    vTokenOwner = deployer;
  } else {
    console.warn("Using timelock as vToken owner");
  }

  console.log("Is Time based", isTimeBased);

  // VToken Beacon
  const vTokenImpl: DeployResult = await deploy("VTokenImpl", {
    contract: "VToken",
    from: deployer,
    args: [isTimeBased, blocksPerYear, maxBorrowRateMantissa],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const vTokenBeacon: DeployResult = await deploy("VTokenBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [vTokenImpl.address],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const poolsWithUnregisteredVTokens = await getUnregisteredVTokens(poolConfig);
  for (const pool of poolsWithUnregisteredVTokens) {
    const comptrollerProxy = await ethers.getContract(`Comptroller_${pool.id}`);

    // Deploy Markets
    for (const vTokenConfig of pool.vtokens) {
      const {
        name,
        asset,
        symbol,
        reserveFactor,
        isFlashLoanAllowed,
        flashLoanProtocolFeeMantissa,
        flashLoanSupplierFeeMantissa,
      } = vTokenConfig;

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
      const rateModelParams = getRateModelParams(vTokenConfig);
      const rateModelName = getRateModelName(rateModelParams, { isTimeBased, blocksPerYear });
      if (rateModelParams.model === InterestRateModels.JumpRate) {
        const result: DeployResult = await deploy(rateModelName, {
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
        rateModelAddress = result.address;
      } else if (rateModelParams.model === InterestRateModels.WhitePaper) {
        const result: DeployResult = await deploy(rateModelName, {
          from: deployer,
          contract: "WhitePaperInterestRateModel",
          args: [rateModelParams.baseRatePerYear, rateModelParams.multiplierPerYear, isTimeBased, blocksPerYear],
          log: true,
          autoMine: true,
          skipIfAlreadyDeployed: true,
        });
        rateModelAddress = result.address;
      } else if (rateModelParams.model === InterestRateModels.TwoKinks) {
        console.log(`Deploying interest rate model ${rateModelName}`);
        const result: DeployResult = await deploy(rateModelName, {
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
        rateModelAddress = result.address;
      } else {
        throw new Error(`Unreachable ${rateModelParams}`);
      }

      const VToken = await ethers.getContractFactory("VToken");
      const underlyingDecimals = Number(await tokenContract.decimals());
      const vTokenDecimals = 8;
      let protocolShareReserveAddress;
      try {
        protocolShareReserveAddress = (await ethers.getContract("ProtocolShareReserve")).address;
      } catch (e) {
        if (!hre.network.live) {
          console.warn("ProtocolShareReserve contract not found. Deploying address");
          await deployProtocolShareReserve(hre);
          protocolShareReserveAddress = (await ethers.getContract("ProtocolShareReserve")).address;
        } else {
          throw e;
        }
      }

      const args = [
        tokenContract.address,
        comptrollerProxy.address,
        rateModelAddress,
        parseUnits("1", underlyingDecimals + 18 - vTokenDecimals),
        name,
        symbol,
        vTokenDecimals,
        vTokenOwner,
        accessControlManagerAddress,
        [AddressOne, protocolShareReserveAddress],
        reserveFactor,
        isFlashLoanAllowed,
        flashLoanProtocolFeeMantissa,
        flashLoanSupplierFeeMantissa,
      ];
      await deploy(`VToken_${symbol}`, {
        from: deployer,
        contract: "BeaconProxy",
        args: [vTokenBeacon.address, VToken.interface.encodeFunctionData("initialize", args)],
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: true,
      });
      console.log(`-----------------------------------------`);
    }
  }
};

func.tags = ["VTokens", "il"];

export default func;

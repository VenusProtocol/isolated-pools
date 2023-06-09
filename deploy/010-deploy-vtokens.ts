import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import { InterestRateModels } from "../helpers/deploymentConfig";

const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";
const treasuryAddresses: { [network: string]: string } = {
  hardhat: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // signer[1] from hardhat mnemonic
  bsctestnet: "0xFEA1c651A47FE29dB9b1bf3cC1f224d8D9CFF68C", // one of testnet admin accounts
  bscmainnet: "0xF322942f644A996A617BD29c16bd7d231d9F35E9", // Venus Treasury
};

type AcmAddresses = {
  bsctestnet: string;
  bscmainnet: string;
};

const acmAddresses: AcmAddresses = {
  bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
};

const mantissaToBps = (num: BigNumberish) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  let accessControlManager;
  if (hre.network.live) {
    const networkName = hre.network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
    accessControlManager = await ethers.getContractAt("AccessControlManager", acmAddresses[networkName]);
  } else {
    accessControlManager = await ethers.getContract("AccessControlManager");
  }

  // VToken Beacon
  const vTokenImpl: DeployResult = await deploy("VTokenImpl", {
    contract: "VToken",
    from: deployer,
    args: [],
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

  const { tokensConfig, poolConfig } = await getConfig(hre.network.name);

  for (let i = 0; i < poolConfig.length; i++) {
    const pool = poolConfig[i];
    const comptrollerProxy = await ethers.getContract(`Comptroller_${pool.name}`);

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
          args: [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_, accessControlManager.address],
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
          args: [baseRatePerYear, multiplierPerYear],
          log: true,
          autoMine: true,
        });
        rateModelAddress = result.address;
      }

      console.log(`Deploying VToken proxy for ${symbol}`);
      const VToken = await ethers.getContractFactory("VToken");
      const underlyingDecimals = Number(await tokenContract.decimals());
      const vTokenDecimals = 8;
      const args = [
        tokenContract.address,
        comptrollerProxy.address,
        rateModelAddress,
        parseUnits("1", underlyingDecimals + 18 - vTokenDecimals),
        name,
        symbol,
        vTokenDecimals,
        deployer, // admin
        accessControlManager.address,
        [treasuryAddresses[hre.network.name], ADDRESS_ONE],
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

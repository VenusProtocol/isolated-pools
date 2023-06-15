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
  let tx;
  const priceOracle = await ethers.getContract("ResilientOracle");
  const poolRegistry = await ethers.getContract("PoolRegistry");
  let accessControlManager;
  if (hre.network.live) {
    const networkName = hre.network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
    accessControlManager = await ethers.getContractAt("AccessControlManager", acmAddresses[networkName]);
  } else {
    accessControlManager = await ethers.getContract("AccessControlManager");
  }
  const maxLoopsLimit = 150;

  // Comptroller Beacon
  const comptrollerImpl: DeployResult = await deploy("ComptrollerImpl", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address],
    log: true,
    autoMine: true,
  });

  const comptrollerBeacon: DeployResult = await deploy("ComptrollerBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [comptrollerImpl.address],
    log: true,
    autoMine: true,
  });

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
  const pools = await poolRegistry.callStatic.getAllPools();

  for (let i = 0; i < poolConfig.length; i++) {
    const pool = poolConfig[i];
    let comptrollerProxy;

    if (i >= pools.length) {
      // Deploying a proxy for Comptroller
      console.log("Deploying a proxy for Comptroller");
      const Comptroller = await ethers.getContractFactory("Comptroller");
      comptrollerProxy = await deploy(`Comptroller_${pool.name}`, {
        from: deployer,
        contract: "BeaconProxy",
        args: [
          comptrollerBeacon.address,
          Comptroller.interface.encodeFunctionData("initialize", [maxLoopsLimit, accessControlManager.address]),
        ],
        log: true,
        autoMine: true,
      });

      // Deploying a proxy for Comptroller
      console.log("Setting price oracle for Comptroller");
      const comptroller = await ethers.getContractAt("Comptroller", comptrollerProxy.address);
      tx = await comptroller.setPriceOracle(priceOracle.address);
      await tx.wait();

      // Create pool
      console.log("Registering new pool with name " + pool.name);
      tx = await poolRegistry.addPool(
        pool.name,
        comptroller.address,
        pool.closeFactor,
        pool.liquidationIncentive,
        pool.minLiquidatableCollateral,
      );
      await tx.wait();
      console.log("New Pool Registered");
    } else {
      comptrollerProxy = await ethers.getContractAt("Comptroller", pools[i].comptroller);
    }

    // Add Markets
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
        collateralFactor,
        liquidationThreshold,
        reserveFactor,
        initialSupply,
        supplyCap,
        borrowCap,
      } = vtoken;

      const token = getTokenConfig(asset, tokensConfig);
      let tokenContract;
      if (token.isMock) {
        tokenContract = await ethers.getContract(`Mock${token.symbol}`);
        console.log("Minting " + initialSupply + " mock tokens to owner");
        tx = await tokenContract.faucet(initialSupply);
        await tx.wait(1);
      } else {
        tokenContract = await ethers.getContractAt(
          "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
          token.tokenAddress,
        );
        // Make sure that deployer has at least `initialSupply` balance of the token
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
      const vToken = await deploy(`VToken_${name}`, {
        from: deployer,
        contract: "BeaconProxy",
        args: [vTokenBeacon.address, VToken.interface.encodeFunctionData("initialize", args)],
        log: true,
        autoMine: true,
      });

      console.log("Approving PoolRegistry for: " + initialSupply);
      tx = await tokenContract.approve(poolRegistry.address, initialSupply);
      await tx.wait(1);
      console.log("Adding market " + name + " to pool " + pool.name);
      tx = await poolRegistry.addMarket({
        vToken: vToken.address,
        collateralFactor: collateralFactor,
        liquidationThreshold: liquidationThreshold,
        initialSupply: initialSupply,
        vTokenReceiver: hre.network.name === "hardhat" ? deployer : treasuryAddresses[hre.network.name],
        supplyCap: supplyCap,
        borrowCap: borrowCap,
      });
      await tx.wait();
      console.log(`Market ${name} added to pool ${pool.name}`);
      console.log(`-----------------------------------------`);
    }
  }
};

func.tags = ["Pools", "il"];

export default func;

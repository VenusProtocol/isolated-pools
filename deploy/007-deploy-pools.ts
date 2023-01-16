import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenConfig } from "./config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, proxyAdmin } = await getNamedAccounts();

  let tx;
  const priceOracle = await ethers.getContract("ResilientOracle");
  const poolRegistry = await ethers.getContract("PoolRegistry");
  const accessControlManager = await ethers.getContract("AccessControlManager");

  //Comptroller Beacon
  const comptrollerImpl: DeployResult = await deploy("ComptrollerImpl", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address, accessControlManager.address],
    log: true,
    autoMine: true,
  });

  const ComptrollerBeacon: DeployResult = await deploy("ComptrollerBeacon", {
    contract: "Beacon",
    from: deployer,
    args: [comptrollerImpl.address],
    log: true,
    autoMine: true,
  });

  //VToken Beacon
  const vTokenImpl: DeployResult = await deploy("VtokenImpl", {
    contract: "VToken",
    from: deployer,
    args: [poolRegistry.address, accessControlManager.address],
    log: true,
    autoMine: true,
  });

  const vTokenBeacon: DeployResult = await deploy("VTokenBeacon", {
    contract: "Beacon",
    from: deployer,
    args: [vTokenImpl.address],
    log: true,
    autoMine: true,
  });

  const { tokenConfig, poolConfig } = await getConfig(hre.network.name);

  for (let i = 0; i < poolConfig.length; i++) {
    const pool = poolConfig[i];
    // Create pool
    tx = await poolRegistry.createRegistryPool(
      pool.name,
      ComptrollerBeacon.address,
      pool.closeFactor,
      pool.liquidationIncentive,
      pool.minLiquidatableCollateral,
      priceOracle.address,
    );
    await tx.wait();

    const pools = await poolRegistry.callStatic.getAllPools();
    const comptrollerProxy = await ethers.getContractAt("Comptroller", pools[i].comptroller);
    tx = await comptrollerProxy.acceptOwnership();
    await tx.wait();

    //Add Markets
    for (const vtoken of pool.vtokens) {
      const token = getTokenConfig(vtoken.asset, tokenConfig);
      let tokenContract;
      if (token.isMock) {
        tokenContract = await ethers.getContract(`Mock${token.symbol}`);
        await tokenContract.faucet(vtoken.initialSupply);
      } else {
        tokenContract = await ethers.getContractAt("ERC20", token.tokenAddress);
        // Make sure that deployer has at least `initialSupply` balance of the token
      }

      await tokenContract.approve(poolRegistry.address, vtoken.initialSupply);

      const {
        name,
        symbol,
        rateModel,
        baseRatePerYear,
        multiplierPerYear,
        jumpMultiplierPerYear,
        kink_,
        collateralFactor,
        liquidationThreshold,
        initialSupply,
        supplyCap,
        borrowCap,
      } = vtoken;

      tx = await poolRegistry.addMarket({
        comptroller: comptrollerProxy.address,
        asset: tokenContract.address,
        decimals: 8,
        name: name,
        symbol: symbol,
        rateModel: rateModel,
        baseRatePerYear: baseRatePerYear,
        multiplierPerYear: multiplierPerYear,
        jumpMultiplierPerYear: jumpMultiplierPerYear,
        kink_: kink_,
        collateralFactor: collateralFactor,
        liquidationThreshold: liquidationThreshold,
        accessControlManager: accessControlManager.address,
        vTokenProxyAdmin: proxyAdmin,
        beaconAddress: vTokenBeacon.address,
        initialSupply: initialSupply,
        supplyCap: supplyCap,
        borrowCap: borrowCap,
      });
      await tx.wait();
      console.log(`Market ${name} added to pool ${pool.name}`);
    }
  }
};

func.tags = ["Pools"];

export default func;

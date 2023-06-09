import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenConfig } from "../helpers/deploymentConfig";

const treasuryAddresses: { [network: string]: string } = {
  hardhat: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // signer[1] from hardhat mnemonic
  bsctestnet: "0xFEA1c651A47FE29dB9b1bf3cC1f224d8D9CFF68C", // one of testnet admin accounts
  bscmainnet: "0xF322942f644A996A617BD29c16bd7d231d9F35E9", // Venus Treasury
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  let tx;
  const priceOracle = await ethers.getContract("ResilientOracle");
  const poolRegistry = await ethers.getContract("PoolRegistry");

  const { tokensConfig, poolConfig } = await getConfig(hre.network.name);
  const pools = await poolRegistry.callStatic.getAllPools();

  for (let i = 0; i < poolConfig.length; i++) {
    const pool = poolConfig[i];
    const comptrollerProxy = await ethers.getContract(`Comptroller_${pool.name}`);
    const comptroller = await ethers.getContractAt("Comptroller", comptrollerProxy.address);

    if (i >= pools.length) {
      // Deploying a proxy for Comptroller
      console.log("Setting price oracle for Comptroller");
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
    }

    // Add Markets
    for (const vtoken of pool.vtokens) {
      const { name, asset, symbol, collateralFactor, liquidationThreshold, initialSupply, supplyCap, borrowCap } =
        vtoken;

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

      const vToken = await ethers.getContract(`VToken_${symbol}`);

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

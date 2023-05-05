import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";
const treasuryAddresses: { [network: string]: string } = {
  hardhat: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // signer[1] from hardhat mnemonic
  bsctestnet: "0xFEA1c651A47FE29dB9b1bf3cC1f224d8D9CFF68C", // one of testnet admin accounts
  bscmainnet: "0xF322942f644A996A617BD29c16bd7d231d9F35E9", // Venus Treasury
};

const acmAddresses: { [key: string]: string } = {
  bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = hre.network.name;
  let accessControlManager;
  if (networkName === "hardhat") {
    accessControlManager = await ethers.getContract("AccessControlManager");
  } else {
    accessControlManager = await ethers.getContractAt("AccessControlManager", acmAddresses[networkName]);
  }

  const vBep20Factory: DeployResult = await deploy("VTokenProxyFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  const jumpRateModelFactory: DeployResult = await deploy("JumpRateModelFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const whitePaperRateFactory: DeployResult = await deploy("WhitePaperInterestRateModelFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("PoolRegistry", {
    from: deployer,
    contract: "PoolRegistry",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          vBep20Factory.address,
          jumpRateModelFactory.address,
          whitePaperRateFactory.address,
          ADDRESS_ONE,
          treasuryAddresses[hre.network.name],
          accessControlManager.address,
        ],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });
};

func.tags = ["Factories", "il"];

export default func;

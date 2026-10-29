import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { readBackAddress, sameAddress, toAddress, verifyDeployment } from "../helpers/deploymentUtils";

// The CustodyReceiptTokens to deploy on bscmainnet, each recorded under its symbol. To deploy a new one, add an entry
// and re-run the script: tokens that already have a deployment record are reused, not redeployed.
const tokens = [
  // Collateral of the BPN Loan spoke pool, listed by VIP-678
  { name: "BPN Credit Token", symbol: "BPNC", decimals: 18 },
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager);
  const normalTimelock = await toAddress(preconfiguredAddresses.NormalTimelock);

  for (const { name, symbol, decimals } of tokens) {
    const args = [name, symbol, decimals, accessControlManager];
    const deployment = await deployments.deploy(symbol, {
      contract: "CustodyReceiptToken",
      from: deployer,
      args,
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });

    // `Ownable2Step`, so this only nominates. The deployer stays the owner until a VIP calls `acceptOwnership`.
    const token = await ethers.getContractAt("CustodyReceiptToken", deployment.address);
    if (sameAddress(await token.owner(), normalTimelock)) {
      console.log(`${symbol} is already owned by ${normalTimelock}`);
    } else if (sameAddress(await token.pendingOwner(), normalTimelock)) {
      console.log(`${symbol} already nominated ${normalTimelock}, awaiting acceptOwnership in the VIP`);
    } else {
      await (await token.transferOwnership(normalTimelock)).wait(1);
      const nominated = await readBackAddress(() => token.pendingOwner(), normalTimelock);
      if (!sameAddress(nominated, normalTimelock)) {
        throw new Error(
          `${symbol} ${deployment.address} still reports pendingOwner ${nominated} after ` +
            `transferOwnership(${normalTimelock}). Re-run this script once the nomination has landed.`,
        );
      }
      console.log(`${symbol} nominated ${nominated}; ${deployer} stays the owner until the VIP calls acceptOwnership`);
    }

    await verifyDeployment(hre, symbol, deployment, args);
  }
};

func.tags = ["CustodyReceiptTokens"];
func.skip = async hre => hre.getNetworkName() !== "bscmainnet";

export default func;

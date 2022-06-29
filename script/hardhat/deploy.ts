import { ethers, run } from "hardhat";

async function main() {
  const verify = async (
    contractAddress: string,
    args: any[],
  ) => {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
    });
  }

  const [owner] = await ethers.getSigners();

  console.log(owner.address)

  const PoolDirectory = await ethers.getContractFactory("PoolDirectory");
  const poolDirectory = await PoolDirectory.deploy();
  await poolDirectory.deployed();

  await verify(poolDirectory.address, []);

  console.log("PoolDirectory Deployed. Address:", poolDirectory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

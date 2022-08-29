const { ethers, run } = require('hardhat');

async function main() {
  const verify = async (
    contractAddress: string,
    args: any[],
    contract?: string
  ) => {
    try {
      const input: any = {
        address: contractAddress,
        constructorArguments: args
      }

      if (contract) {
        input.contract = contract;
      }
      await run("verify:verify", input);
    } catch (e: any) {
      if (!e.toString().includes("Already Verified")) {
        throw e;
      } else {
        console.log(`Address ${contractAddress} is already verified`)
      }
    }
  }

  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  console.log("Deployer Address:", ownerAddress);

  const PoolLens = await ethers.getContractFactory('PoolLens')
  const poolLens = await PoolLens.deploy()
  await poolLens.deployed()
  //await verify(poolLens.address, []);
  console.log("poolLens Address:", poolLens.address);
  return poolLens.address;
}

export default main;

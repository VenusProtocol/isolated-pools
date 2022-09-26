const { ethers, run, upgrades } = require('hardhat');

async function main() {
  const verify = async (
    contractAddress: string,
    args: any[],
    contract?: string
  ) => {
    try {
      const input:any =  {
        address: contractAddress,
        constructorArguments: args
      }

      if (contract) {
        input.contract = contract;
      }
      await run("verify:verify", input);
    } catch(e:any) {
      if (!e.toString().includes("Already Verified")) {
        throw e;
      } else {
        console.log(`Address ${contractAddress} is already verified`)
      }
    }
  } 

  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const mockPriceOracle = await upgrades.deployProxy(MockPriceOracle, []);
  await mockPriceOracle.deployed();

  await verify(mockPriceOracle.address, []);

  console.log("MockPriceOracle deployed to:", mockPriceOracle.address);
}
export default main;


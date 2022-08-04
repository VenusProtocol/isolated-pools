import { ethers, run } from "hardhat";
import { convertToUnit } from "../../helpers/utils";

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

  const [owner] = await ethers.getSigners();

  const MockDAI = await ethers.getContractFactory('MockToken')
  const mockDAI = await MockDAI.deploy('MakerDAO', 'DAI', 18)
  await mockDAI.deployed()
  await verify(mockDAI.address, ['MakerDAO', 'DAI', 18]);

  const MockWBTC = await ethers.getContractFactory('MockToken')
  const mockWBTC = await MockWBTC.deploy('Bitcoin', 'BTC', 8)
  await mockWBTC.deployed()
  await verify(mockWBTC.address, ['Bitcoin', 'BTC', 8]);

  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const priceOracle = await MockPriceOracle.deploy();
  await priceOracle.deployed()

  const btcPrice = "21000.34";
  const daiPrice = "1";

  let tx = await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
  tx.wait(1)
  tx = await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));
  tx.wait(1)

  const CErc20ImmutableFactory = await ethers.getContractFactory(
    "CErc20ImmutableFactory"
  );
  const cTokenFactory = await CErc20ImmutableFactory.deploy();
  await cTokenFactory.deployed();
  await verify(cTokenFactory.address, []);

  const JumpRateModelFactory = await ethers.getContractFactory(
    "JumpRateModelFactory"
  );
  const jumpRateFactory = await JumpRateModelFactory.deploy();
  await jumpRateFactory.deployed();
  await verify(jumpRateFactory.address, []);

  const WhitePaperInterestRateModelFactory = await ethers.getContractFactory(
    "WhitePaperInterestRateModelFactory"
  );
  const whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
  await whitePaperRateFactory.deployed();
  await verify(whitePaperRateFactory.address, []);

  const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
  const poolRegistry = await PoolRegistry.deploy();
  await poolRegistry.deployed();

  await verify(poolRegistry.address, []);

  await poolRegistry.initialize(
    cTokenFactory.address,
    jumpRateFactory.address,
    whitePaperRateFactory.address
  );

  const Comptroller = await ethers.getContractFactory('Comptroller');
  const comptroller = await Comptroller.deploy(poolRegistry.address);
  await comptroller.deployed();
  await verify(comptroller.address, []);

  const closeFactor = convertToUnit(0.05, 18) 
  const liquidationIncentive = convertToUnit(1, 18)

  tx = await poolRegistry.createRegistryPool(
    "Pool 1",
    comptroller.address,
    closeFactor,
    liquidationIncentive,
    priceOracle.address
  );
  await tx.wait(1)
  
  const pools = await poolRegistry.callStatic.getAllPools();
  const comptrollerProxy = await ethers.getContractAt(
    "Comptroller",
    pools[0].comptroller
  );

  const unitroller = await ethers.getContractAt(
    "Unitroller",
    pools[0].comptroller
  );

  await verify(unitroller.address, [], "contracts/Unitroller.sol:Unitroller");

  tx = await unitroller._acceptAdmin();
  await tx.wait(1)


  tx = await poolRegistry.addMarket({
    poolId: 1,
    asset: mockWBTC.address,
    decimals: 8,
    name: "Compound WBTC",
    symbol: "cWBTC",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
  });
  await tx.wait(1)

  tx = await poolRegistry.addMarket({
    poolId: 1,
    asset: mockDAI.address,
    decimals: 18,
    name: "Compound DAI",
    symbol: "cDAI",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
  });
  await tx.wait(1)

  const cWBTCAddress = await poolRegistry.getCTokenForAsset(
    1,
    mockWBTC.address
  );
  const cDAIAddress = await poolRegistry.getCTokenForAsset(
    1,
    mockDAI.address
  );

  const cWBTC = await ethers.getContractAt("CErc20Immutable", cWBTCAddress);
  const cDAI = await ethers.getContractAt("CErc20Immutable", cDAIAddress);

  console.log("PoolRegistry Address:", poolRegistry.address);
  console.log("Pool Name: Pool 1")
  console.log("Comptroller Proxy Address:", comptrollerProxy.address);
  console.log("MockDAI Address:", mockDAI.address);
  console.log("MockWBTC Address:", mockWBTC.address);
  console.log("cDAI Address:", cDAI.address);
  console.log("cWBTC Address:", cWBTC.address);
  console.log("MocPriceOracle Address:", priceOracle.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

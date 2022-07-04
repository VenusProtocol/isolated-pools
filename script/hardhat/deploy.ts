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

  const PoolDirectory = await ethers.getContractFactory("PoolDirectory");
  const poolDirectory = await PoolDirectory.deploy();
  await poolDirectory.deployed();
  await verify(poolDirectory.address, []);

  const Comptroller = await ethers.getContractFactory('Comptroller');
  const comptroller = await Comptroller.deploy();
  await comptroller.deployed();
  await verify(comptroller.address, []);

  const SimplePriceOracle = await ethers.getContractFactory('SimplePriceOracle')
  const simplePriceOracle = await SimplePriceOracle.deploy()
  await simplePriceOracle.deployed()
  await verify(simplePriceOracle.address, []);

  const closeFactor = convertToUnit(0.05, 18) 
  const liquidationIncentive = convertToUnit(1, 18)

  let tx = await poolDirectory.deployPool(
    "Pool 1",
    comptroller.address,
    closeFactor,
    liquidationIncentive,
    simplePriceOracle.address
  )
  await tx.wait(1)

  const pools = await poolDirectory.callStatic.getAllPools()

  const comptrollerProxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
  const unitroller = await ethers.getContractAt("Unitroller", pools[0].comptroller);

  await verify(unitroller.address, [], "contracts/Unitroller.sol:Unitroller");

  tx = await unitroller._acceptAdmin();
  await tx.wait(1)

  const MockDAI = await ethers.getContractFactory('MockToken')
  const mockDAI = await MockDAI.deploy('MakerDAO', 'DAI', 18)
  await mockDAI.deployed()
  await verify(mockDAI.address, ['MakerDAO', 'DAI', 18]);

  const MockWBTC = await ethers.getContractFactory('MockToken')
  const mockWBTC = await MockWBTC.deploy('Bitcoin', 'BTC', 8)
  await mockWBTC.deployed()
  await verify(mockWBTC.address, ['Bitcoin', 'BTC', 8]);

  const MockPotLike = await ethers.getContractFactory('MockPotLike')
  const potLike = await MockPotLike.deploy();
  await potLike.deployed()
  await verify(potLike.address, []);

  const MockJugLike = await ethers.getContractFactory('MockJugLike')
  const jugLike = await MockJugLike.deploy();
  await jugLike.deployed()
  await verify(jugLike.address, [], "contracts/Mocks/MockJugLike.sol:MockJugLike");

  const DAIInterestRateModelV3 = await ethers.getContractFactory('DAIInterestRateModelV3')
  
  const daiInterest = await DAIInterestRateModelV3.deploy(
    '1090000000000000000',
    "800000000000000000",
    potLike.address,
    jugLike.address,
    owner.address
  )
  await daiInterest.deployed()
  await verify(daiInterest.address, [
    '1090000000000000000',
    "800000000000000000",
    potLike.address,
    jugLike.address,
    owner.address
  ]);

  const CDAI = await ethers.getContractFactory('CErc20Immutable')
  const cDAI = await CDAI.deploy(
    mockDAI.address,
    comptrollerProxy.address,
    daiInterest.address,
    convertToUnit(1, 18),
    'Compound DAI',
    'cDAI',
    18,
    owner.address
  )
  await cDAI.deployed()
  await verify(cDAI.address, [
    mockDAI.address,
    comptrollerProxy.address,
    daiInterest.address,
    convertToUnit(1, 18),
    'Compound DAI',
    'cDAI',
    18,
    owner.address
  ], "contracts/CErc20Immutable.sol:CErc20Immutable");

  const JumpRateModelV2 = await ethers.getContractFactory('JumpRateModelV2')
  const wbtcInterest = await JumpRateModelV2.deploy(
    0,
    "40000000000000000",
    "1090000000000000000",
    "800000000000000000",
    owner.address
  )
  await wbtcInterest.deployed()
  await verify(wbtcInterest.address, [
    0,
    "40000000000000000",
    "1090000000000000000",
    "800000000000000000",
    owner.address
  ]);


  const CWBTC = await ethers.getContractFactory('CErc20Immutable')
  const cWBTC = await CWBTC.deploy(
    mockWBTC.address,
    comptrollerProxy.address,
    wbtcInterest.address,
    convertToUnit(1, 18),
    'Compound WBTC',
    'cWBTC',
    8,
    owner.address
  )
  await cWBTC.deployed()
  await verify(cWBTC.address, [
    mockWBTC.address,
    comptrollerProxy.address,
    wbtcInterest.address,
    convertToUnit(1, 18),
    'Compound WBTC',
    'cWBTC',
    8,
    owner.address
  ], "contracts/CErc20Immutable.sol:CErc20Immutable");

  const MockPriceOracle = await ethers.getContractFactory('MockPriceOracle')
  const priceOracle = await MockPriceOracle.deploy()
  await priceOracle.deployed()
  await verify(priceOracle.address, []);

  const btcPrice = "21000.34"
  const daiPrice = "1"

  tx = await priceOracle.setPrice(cDAI.address, convertToUnit(daiPrice, 18))
  await tx.wait(1)
  tx = await priceOracle.setPrice(cWBTC.address, convertToUnit(btcPrice, 28))
  await tx.wait(1)
  tx = await comptrollerProxy._setPriceOracle(priceOracle.address);
  await tx.wait(1)

  tx = await comptrollerProxy._supportMarket(cDAI.address)
  await tx.wait(1)
  tx = await comptrollerProxy._supportMarket(cWBTC.address)
  await tx.wait(1)

  tx = await comptrollerProxy._setCollateralFactor(cDAI.address, convertToUnit(0.7, 18))
  await tx.wait(1)
  tx = await comptrollerProxy._setCollateralFactor(cWBTC.address, convertToUnit(0.7, 18))
  await tx.wait(1)

  console.log("PoolDirectory Address:", poolDirectory.address);
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

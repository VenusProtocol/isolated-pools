import { ethers } from "hardhat";
import { expect } from "chai";
import { MockToken, PoolDirectory, Comptroller, SimplePriceOracle, CErc20Immutable, DAIInterestRateModelV3, JumpRateModelV2, MockPotLike, MockJugLike, MockPriceOracle, Unitroller } from "../../typechain";
import BigNumber from "bignumber.js"
import { convertToUnit } from "../../helpers/utils";

let poolDirectory:PoolDirectory
let comptroller:Comptroller
let simplePriceOracle:SimplePriceOracle
let mockDAI:MockToken
let mockWBTC:MockToken
let cDAI:CErc20Immutable
let cWBTC:CErc20Immutable
let daiInterest:DAIInterestRateModelV3
let wbtcInterest:JumpRateModelV2
let potLike:MockPotLike
let jugLike:MockJugLike
let priceOracle:MockPriceOracle
let comptrollerProxy:Comptroller
let unitroller:Unitroller

describe('PoolDirectory', async function () {
  it('Deploy Comptroller', async function () {
    const PoolDirectory = await ethers.getContractFactory('PoolDirectory');
    poolDirectory = await PoolDirectory.deploy();
    await poolDirectory.deployed();

    await poolDirectory.initialize(false, []);

    const Comptroller = await ethers.getContractFactory('Comptroller');
    comptroller = await Comptroller.deploy();
    await comptroller.deployed();

    const closeFactor = convertToUnit(0.05, 18) 
    const liquidationIncentive = convertToUnit(1, 18)

    const SimplePriceOracle = await ethers.getContractFactory('SimplePriceOracle')
    simplePriceOracle = await SimplePriceOracle.deploy()
    await simplePriceOracle.deployed()

    await poolDirectory.deployPool(
      "Pool 1",
      comptroller.address,
      closeFactor,
      liquidationIncentive,
      simplePriceOracle.address
    )
    const pools = await poolDirectory.callStatic.getAllPools()
    expect(pools[0].name).equal("Pool 1")

    comptrollerProxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
    unitroller = await ethers.getContractAt("Unitroller", pools[0].comptroller);

    await unitroller._acceptAdmin();
  });

  it('Deploy CToken', async function () {
    const MockDAI = await ethers.getContractFactory('MockToken')
    mockDAI = await MockDAI.deploy('MakerDAO', 'DAI', 18)
    await mockDAI.faucet(convertToUnit(1000, 18));

    const [owner] = await ethers.getSigners();
    const daiBalance = await mockDAI.balanceOf(owner.address)
    expect(daiBalance).equal(convertToUnit(1000, 18))

    const MockWBTC = await ethers.getContractFactory('MockToken')
    mockWBTC = await MockWBTC.deploy('Bitcoin', 'BTC', 8)
    await mockWBTC.faucet(convertToUnit(1000, 8))

    const btcBalance = await mockWBTC.balanceOf(owner.address)

    expect(btcBalance).equal(convertToUnit(1000, 8))

    const MockPotLike = await ethers.getContractFactory('MockPotLike')
    potLike = await MockPotLike.deploy();

    const MockJugLike = await ethers.getContractFactory('MockJugLike')
    jugLike = await MockJugLike.deploy();

    const DAIInterestRateModelV3 = await ethers.getContractFactory('DAIInterestRateModelV3')
    daiInterest = await DAIInterestRateModelV3.deploy(
      '1090000000000000000',
      "800000000000000000",
      potLike.address,
      jugLike.address,
      owner.address
    )

    const CDAI = await ethers.getContractFactory('CErc20Immutable')
    cDAI = await CDAI.deploy(
      mockDAI.address,
      comptrollerProxy.address,
      daiInterest.address,
      convertToUnit(1, 18),
      'Compound DAI',
      'cDAI',
      18,
      owner.address
    )

    const JumpRateModelV2 = await ethers.getContractFactory('JumpRateModelV2')
    wbtcInterest = await JumpRateModelV2.deploy(
      0,
      "40000000000000000",
      "1090000000000000000",
      "800000000000000000",
      owner.address
    )
    
    const CWBTC = await ethers.getContractFactory('CErc20Immutable')
    cWBTC = await CWBTC.deploy(
      mockWBTC.address,
      comptrollerProxy.address,
      wbtcInterest.address,
      convertToUnit(1, 18),
      'Compound WBTC',
      'cWBTC',
      8,
      owner.address
    )
  });

  it('Deploy Price Oracle', async function () {
    const MockPriceOracle = await ethers.getContractFactory('MockPriceOracle')
    priceOracle = await MockPriceOracle.deploy()

    const btcPrice = "21000.34"
    const daiPrice = "1"

    await priceOracle.setPrice(cDAI.address, convertToUnit(daiPrice, 18))
    await priceOracle.setPrice(cWBTC.address, convertToUnit(btcPrice, 28))

    expect((await priceOracle.getUnderlyingPrice(cDAI.address)).toString()).equal(convertToUnit(daiPrice, 18))
    expect((await priceOracle.getUnderlyingPrice(cWBTC.address)).toString()).equal(convertToUnit(btcPrice, 28))

    await comptrollerProxy._setPriceOracle(priceOracle.address);
  })

  it('Enter Market', async function () {
    await comptrollerProxy._supportMarket(cDAI.address)
    await comptrollerProxy._supportMarket(cWBTC.address)

    await comptrollerProxy._setCollateralFactor(cDAI.address, convertToUnit(0.7, 18))
    await comptrollerProxy._setCollateralFactor(cWBTC.address, convertToUnit(0.7, 18))

    const [owner, user] = await ethers.getSigners();
    await comptrollerProxy.enterMarkets([ cDAI.address, cWBTC.address ])
    await comptrollerProxy.connect(user).enterMarkets([ cDAI.address, cWBTC.address ])
    const res = await comptrollerProxy.getAssetsIn(owner.address)
    expect(res[0]).equal(cDAI.address)
    expect(res[1]).equal(cWBTC.address)
  })

  it('Lend and Borrow', async function () {
    const daiAmount = convertToUnit(31000, 18)
    await mockDAI.faucet(daiAmount)
    await mockDAI.approve(cDAI.address, daiAmount)
    await cDAI.mint(daiAmount)

    const [owner, user] = await ethers.getSigners();
    await mockWBTC.connect(user).faucet(convertToUnit(1000, 8));

    const btcAmount = convertToUnit(1000, 8)
    await mockWBTC.connect(user).approve(cWBTC.address, btcAmount)
    await cWBTC.connect(user).mint(btcAmount)

    // console.log((await comptrollerProxy.callStatic.getAccountLiquidity(owner.address))[1].toString())
    // console.log((await comptrollerProxy.callStatic.getAccountLiquidity(user.address))[1].toString())
    await cWBTC.borrow(convertToUnit(1, 8));
    await cDAI.connect(user).borrow(convertToUnit(100, 18));
  })
})
import { network, ethers } from "hardhat";
import { expect } from "chai";
import { MockToken, PoolDirectory, Comptroller, SimplePriceOracle, CErc20, DAIInterestRateModelV3, JumpRateModelV2 } from "../../typechain";
import BigNumber from "bignumber.js"

let poolDirectory:PoolDirectory
let comptroller:Comptroller
let simplePriceOracle:SimplePriceOracle
let mockDAI:MockToken
let mockWBTC:MockToken
let cDAI:CErc20
let cWBTC:CErc20
let daiInterest:DAIInterestRateModelV3
let wbtcInterest:JumpRateModelV2

describe('PoolDirectory', async function () {
  it('Deploy Comptroller', async function () {
    const PoolDirectory = await ethers.getContractFactory('PoolDirectory');
    poolDirectory = await PoolDirectory.deploy();
    await poolDirectory.deployed();

    await poolDirectory.initialize(false, []);

    const Comptroller = await ethers.getContractFactory('Comptroller');
    comptroller = await Comptroller.deploy();
    await comptroller.deployed();

    const closeFactor = (new BigNumber(0.05)).times( (new BigNumber(10)).pow(18) ).toString()
    const liquidationIncentive = (new BigNumber(1)).times( (new BigNumber(10)).pow(18) ).toString()

    const SimplePriceOracle = await ethers.getContractFactory('SimplePriceOracle')
    simplePriceOracle = await SimplePriceOracle.deploy()
    await simplePriceOracle.deployed()

    const pool = await poolDirectory.callStatic.deployPool(
      "Pool 1",
      comptroller.address,
      closeFactor,
      liquidationIncentive,
      simplePriceOracle.address
    )

    expect(pool[0].toString()).equal('0')
    expect(pool[1]).not.equal('0x0000000000000000000000000000000000000000')
  });

  it('Deploy CToken', async function () {
    const MockDAI = await ethers.getContractFactory('MockToken')
    mockDAI = await MockDAI.deploy('MakerDAO', 'DAI', 18)
    await mockDAI.faucet();

    const [owner] = await ethers.getSigners();
    const daiBalance = await mockDAI.balanceOf(owner.address)
    expect(daiBalance).equal("1000000000000000000000")

    const MockWBTC = await ethers.getContractFactory('MockToken')
    mockWBTC = await MockWBTC.deploy('Bitcoin', 'BTC', 8)
    await mockWBTC.faucet()

    const btcBalance = await mockWBTC.balanceOf(owner.address)

    expect(btcBalance).equal("100000000000")

    // const DAIInterestRateModelV3 = await ethers.getContractFactory('DAIInterestRateModelV3')
    // daiInterest = await DAIInterestRateModelV3.deploy(
    //   '1090000000000000000',
    //   "800000000000000000",
    //   owner.address,
    //   owner.address,
    //   owner.address
    // )

    // const CDAI = await ethers.getContractFactory('CErc20')
    // cDAI = await CDAI.deploy()
    // await cDAI["initialize(address,address,address,uint256,string,string,uint8)"](
    //   mockDAI.address,
    //   comptroller.address,
    //   daiInterest.address,
    //   (new BigNumber(1)).times( new BigNumber(10).pow(18) ).toString(),
    //   'Compound DAI',
    //   'cDAI',
    //   18
    // )

    // const JumpRateModelV2 = await ethers.getContractFactory('JumpRateModelV2')
    // wbtcInterest = await JumpRateModelV2.deploy(
    //   0,
    //   "40000000000000000",
    //   "1090000000000000000",
    //   "800000000000000000",
    //   owner.address
    // )
    
    const CWBTC = await ethers.getContractFactory('CErc20')
    cWBTC = await CWBTC.deploy()

    await cWBTC["initialize(address,address,address,uint256,string,string,uint8)"](
      mockWBTC.address,
      comptroller.address,
      "0x0000000000000000000000000000000000000000",
      (new BigNumber(1)).times( new BigNumber(10).pow(18) ).toString(),
      'Compound WBTC',
      'cWBTC',
      8
    )
  });
})
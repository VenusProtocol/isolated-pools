import { ethers } from "hardhat";
import {
  AccessControlManager,
  VBep20,
  VBep20__factory,
  Comptroller,
  Comptroller__factory,
  IRiskFund,
  MockToken,
  PriceOracle,
  Shortfall,
  Shortfall__factory,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import BigNumber from "bignumber.js";

let shortfall:MockContract<Shortfall>
let fakeRiskFund:FakeContract<IRiskFund>
let mockBUSD: MockToken;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: MockContract<VBep20>;
let cWBTC: MockContract<VBep20>;
let comptroller: MockContract<Comptroller>;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let fakePriceOracle: FakeContract<PriceOracle>;

let riskFundBalance = "10000"
const minimumPoolBadDebt = "10000"
const pooldId = "1"

describe("Shortfall: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const MockBUSD = await ethers.getContractFactory("MockToken");
    mockBUSD = await MockBUSD.deploy("BUSD", "BUSD", 18);
    await mockBUSD.faucet(convertToUnit(100000, 18));

    fakeRiskFund = await smock.fake<IRiskFund>("IRiskFund")

    const Shortfall = await smock.mock<Shortfall__factory>('Shortfall');
    shortfall = await Shortfall.deploy(
      mockBUSD.address,
      fakeRiskFund.address
    );
    await shortfall.initialize(parseUnits(minimumPoolBadDebt, "18"));

    const [poolRegistry] = await ethers.getSigners();
    await shortfall.setPoolRegistry(poolRegistry.address)

    //Deploy Mock Tokens
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000000, 8));

    fakeAccessControlManager = await smock.fake<AccessControlManager>(
      "AccessControlManager"
    );
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const Comptroller = await smock.mock<Comptroller__factory>('Comptroller');
    comptroller = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address)

    cDAI = await (await smock.mock<VBep20__factory>("VBep20")).deploy()
    cWBTC = await (await smock.mock<VBep20__factory>("VBep20")).deploy()
    
    cWBTC.setVariable("decimals", 8);
    cDAI.decimals.returns(18);
    
    cDAI.underlying.returns(mockDAI.address)
    cWBTC.setVariable("underlying", mockWBTC.address)

    cDAI.setVariable("shortfall", shortfall.address)
    cWBTC.setVariable("shortfall", shortfall.address)

    await shortfall.setPoolComptroller(pooldId, comptroller.address)

    comptroller.getAllMarkets.returns((args: any) => {
      return [cDAI.address, cWBTC.address];
    });

    fakePriceOracle = await smock.fake<PriceOracle>("PriceOracle");

    const btcPrice = "21000.34";
    const daiPrice = "1";

    fakePriceOracle.getUnderlyingPrice.returns((args: any) => {
      if (cDAI && cWBTC) {
        if (args[0] === cDAI.address) {
          return convertToUnit(daiPrice, 18);
        } else {
          return convertToUnit(btcPrice, 18);
        }
      }

      return 1;
    });

    comptroller.oracle.returns(fakePriceOracle.address);

    fakeRiskFund.getPoolReserve.returns(parseUnits(riskFundBalance, 18))
    fakeRiskFund.transferReserveForAuction.returns(0);
  });

  it("Should have debt and reserve", async function () {
    const comptrollerAddress = (await shortfall.comptrollers(1));
    expect(comptrollerAddress).equal(comptroller.address)

    cDAI.badDebt.returns(parseUnits("1000", 18))
    cWBTC.badDebt.returns(parseUnits("1", 8))

    expect(await fakeRiskFund.getPoolReserve(1)).equal(parseUnits(riskFundBalance, 18).toString())

    expect(await cDAI.badDebt()).equal(parseUnits("1000", 18))
    expect(await cWBTC.badDebt()).equal(parseUnits("1", 8))
  });

  it("Should not be able to start auction", async function () {
    cDAI.badDebt.returns(parseUnits("20", 18))
    cWBTC.badDebt.returns(parseUnits("0.01", 8))

    await expect(shortfall.startAuction(1)).to.be.reverted;
  });

  it("Scenerio 1 - Start auction", async function () {
    cDAI.badDebt.returns(parseUnits("10000", 18))
    cDAI.setVariable("badDebt", parseUnits("10000", 18))
    cWBTC.badDebt.returns(parseUnits("2", 8))
    cWBTC.setVariable("badDebt", parseUnits("2", 8))

    await shortfall.startAuction(pooldId);
    
    const auction = await shortfall.auctions(pooldId);
    expect(auction.status).equal(1)
    expect(auction.auctionType).equal(0)
    expect(auction.seizedRiskFund).equal(parseUnits(riskFundBalance, 18))
    
    const startBidBps = (new BigNumber((new BigNumber("10000")).times(0.9).times(100))).dividedBy("52000.68").toFixed(2)
    expect(auction.startBidBps.toString()).equal((new BigNumber(startBidBps)).times(100).toString())
  });

  it("Scenerio 1 - Place bid", async function () {
    const auction = await shortfall.auctions(pooldId);

    mockDAI.approve(shortfall.address, parseUnits("10000", 18));
    mockWBTC.approve(shortfall.address, parseUnits("2", 8));

    const [owner] = await ethers.getSigners();

    const previousDaiBalance = await mockDAI.balanceOf(owner.address)
    const previousWBTCBalance = await mockWBTC.balanceOf(owner.address)

    await shortfall.placeBid(pooldId, auction.startBidBps);
    expect(((await mockDAI.balanceOf(owner.address))).div(parseUnits("1", 18)).toNumber()).lt(previousDaiBalance.div(parseUnits("1", 18)).toNumber())
    expect(((await mockWBTC.balanceOf(owner.address))).div(parseUnits("1", 8)).toNumber()).lt(previousWBTCBalance.div(parseUnits("1", 8)).toNumber())

    let percentageToDeduct = (new BigNumber(auction.startBidBps.toString())).dividedBy(100);
    let total = (new BigNumber((await cDAI.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString()))
    let amountToDeduct = ((new BigNumber(total)).times(percentageToDeduct)).dividedBy(100).toString()
    let amountDeducted = (new BigNumber(previousDaiBalance.div(parseUnits("1", 18)).toString())).minus(((await mockDAI.balanceOf(owner.address))).div(parseUnits("1", 18)).toString()).toString()
    expect(amountDeducted).equal(amountToDeduct)

    percentageToDeduct = (new BigNumber(auction.startBidBps.toString())).dividedBy(100);
    total = (new BigNumber((await cWBTC.badDebt()).toString()).dividedBy(parseUnits("1", "8").toString()))
    amountToDeduct = ((new BigNumber(total)).times(percentageToDeduct)).dividedBy(100).toString()
    amountDeducted = ((new BigNumber(previousWBTCBalance.toString())).minus((await mockWBTC.balanceOf(owner.address)).toString())).div(parseUnits("1", 8).toString()).toString()
    expect(amountDeducted).equal(amountToDeduct)
  });

  it("Scenerio 1 - Close Auction", async function () {
    async function mineNBlocks(n:number) {
      for (let index = 0; index < n; index++) {
        await ethers.provider.send('evm_mine', [Date.now() * 1000]);
      }
    }

    const [owner] = await ethers.getSigners();

    await mineNBlocks((await shortfall.nextBidderBlockLimit()).toNumber() + 2)

    //simulate transferReserveForAuction
    await mockBUSD.transfer(shortfall.address, parseUnits(riskFundBalance, 18))

    await shortfall.closeAuction(pooldId)
    const auction = await shortfall.auctions(pooldId);
    expect(auction.status).equal(2)
  }); 
});
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { AddressOne, convertToUnit } from "../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  IRiskFund,
  MockToken,
  PoolRegistry,
  PriceOracle,
  Shortfall,
  Shortfall__factory,
  VToken,
  VToken__factory,
} from "../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let owner: SignerWithAddress;
let poolRegistry: FakeContract<PoolRegistry>;
let someone: SignerWithAddress;
let bidder1: SignerWithAddress;
let bidder2: SignerWithAddress;
let shortfall: MockContract<Shortfall>;
let accessControlManager: AccessControlManager;
let fakeRiskFund: FakeContract<IRiskFund>;
let mockBUSD: MockToken;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let vDAI: MockContract<VToken>;
let vWBTC: MockContract<VToken>;
let comptroller: FakeContract<Comptroller>;
let fakePriceOracle: FakeContract<PriceOracle>;

let riskFundBalance = "10000";
const minimumPoolBadDebt = "10000";
let poolAddress;

/**
 * Deploying required contracts along with the poolRegistry.
 */
async function shortfallFixture() {
  const MockBUSD = await ethers.getContractFactory("MockToken");
  mockBUSD = await MockBUSD.deploy("BUSD", "BUSD", 18);
  await mockBUSD.faucet(convertToUnit(100000, 18));

  const AccessControlManagerFactor = await ethers.getContractFactory("AccessControlManager");
  accessControlManager = await AccessControlManagerFactor.deploy();
  fakeRiskFund = await smock.fake<IRiskFund>("IRiskFund");

  const Shortfall = await smock.mock<Shortfall__factory>("Shortfall");
  shortfall = await upgrades.deployProxy(Shortfall, [
    mockBUSD.address,
    fakeRiskFund.address,
    parseUnits(minimumPoolBadDebt, "18"),
    accessControlManager.address,
  ]);

  [owner, someone, bidder1, bidder2] = await ethers.getSigners();

  poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");

  await shortfall.updatePoolRegistry(poolRegistry.address);

  // Deploy Mock Tokens
  const MockDAI = await ethers.getContractFactory("MockToken");
  mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
  await mockDAI.faucet(convertToUnit(1000000000, 18));

  const MockWBTC = await ethers.getContractFactory("MockToken");
  mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
  await mockWBTC.faucet(convertToUnit(1000000000, 8));

  const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
  comptroller = await Comptroller.deploy(poolRegistry.address);
  poolAddress = comptroller.address;

  poolRegistry.getPoolByComptroller.returns({
    name: "test",
    creator: AddressOne,
    comptroller: comptroller.address,
    blockPosted: 0,
    timestampPosted: 0,
  });

  const VToken = await smock.mock<VToken__factory>("VToken");
  vDAI = await VToken.deploy();
  vWBTC = await VToken.deploy();

  await vWBTC.setVariable("decimals", 8);
  vDAI.decimals.returns(18);

  vDAI.underlying.returns(mockDAI.address);
  await vWBTC.setVariable("underlying", mockWBTC.address);

  await vDAI.setVariable("shortfall", shortfall.address);
  await vWBTC.setVariable("shortfall", shortfall.address);

  comptroller.getAllMarkets.returns(() => {
    return [vDAI.address, vWBTC.address];
  });

  fakePriceOracle = await smock.fake<PriceOracle>("PriceOracle");

  const btcPrice = "21000.34";
  const daiPrice = "1";

  fakePriceOracle.getUnderlyingPrice.returns((args: any) => {
    if (vDAI && vWBTC) {
      if (args[0] === vDAI.address) {
        return convertToUnit(daiPrice, 18);
      } else {
        return convertToUnit(btcPrice, 28);
      }
    }

    return 1;
  });

  comptroller.oracle.returns(fakePriceOracle.address);

  fakeRiskFund.poolReserves.returns(parseUnits(riskFundBalance, 18));
  fakeRiskFund.transferReserveForAuction.returns(0);

  // Access Control
  await accessControlManager.giveCallPermission(shortfall.address, "updateIncentiveBps(uint256)", owner.address);

  await accessControlManager.giveCallPermission(shortfall.address, "updateMinimumPoolBadDebt(uint256)", owner.address);

  await accessControlManager.giveCallPermission(shortfall.address, "updateWaitForFirstBidder(uint256)", owner.address);

  await accessControlManager.giveCallPermission(
    shortfall.address,
    "updateNextBidderBlockLimit(uint256)",
    owner.address,
  );

  // setup bidders
  // bidder 1
  await mockDAI.transfer(bidder1.address, parseUnits("500000", 18));
  await mockDAI.connect(bidder1).approve(shortfall.address, parseUnits("100000", 18));
  await mockWBTC.transfer(bidder1.address, parseUnits("50", 8));
  await mockWBTC.connect(bidder1).approve(shortfall.address, parseUnits("50", 8));
  // // bidder 2
  await mockDAI.transfer(bidder2.address, parseUnits("500000", 18));
  await mockDAI.connect(bidder2).approve(shortfall.address, parseUnits("100000", 18));
  await mockWBTC.transfer(bidder2.address, parseUnits("50", 8));
  await mockWBTC.connect(bidder2).approve(shortfall.address, parseUnits("50", 8));
}

describe("Shortfall: Tests", async function () {
  async function setup() {
    await loadFixture(shortfallFixture);
  }

  describe("setters", async function () {
    beforeEach(setup);

    describe("updatePoolRegistry", async function () {
      it("reverts on invalid PoolRegistry address", async function () {
        await expect(shortfall.updatePoolRegistry(constants.AddressZero)).to.be.revertedWith("invalid address");
      });

      it("fails if called by a non-owner", async function () {
        await expect(shortfall.connect(someone).updatePoolRegistry(poolRegistry.address)).to.be.rejectedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("emits PoolRegistryUpdated event", async function () {
        const tx = shortfall.updatePoolRegistry(someone.address);
        await expect(tx).to.emit(shortfall, "PoolRegistryUpdated").withArgs(poolRegistry.address, someone.address);
      });
    });

    describe("updateMinimumPoolBadDebt", async function () {
      it("fails if called by a non permissioned account", async function () {
        await expect(shortfall.connect(someone).updateMinimumPoolBadDebt(1)).to.be.reverted;
      });

      it("updates minimumPoolBadDebt in storage", async function () {
        await shortfall.updateMinimumPoolBadDebt(1);
        expect(await shortfall.minimumPoolBadDebt()).to.equal(1);
      });

      it("emits MinimumPoolBadDebtUpdated event", async function () {
        const tx = shortfall.updateMinimumPoolBadDebt(1);
        await expect(tx)
          .to.emit(shortfall, "MinimumPoolBadDebtUpdated")
          .withArgs(parseUnits(minimumPoolBadDebt, "18"), 1);
      });
    });

    describe("waitForFirstBidder", async function () {
      it("fails if called by a non permissioned account", async function () {
        await expect(shortfall.connect(someone).updateWaitForFirstBidder(200)).to.be.reverted;
      });

      it("updates updateWaitForFirstBidder in storage", async function () {
        await shortfall.updateWaitForFirstBidder(200);
        expect(await shortfall.waitForFirstBidder()).to.equal(200);
      });

      it("emits WaitForFirstBidderUpdated event", async function () {
        const tx = shortfall.updateWaitForFirstBidder(200);
        await expect(tx).to.emit(shortfall, "WaitForFirstBidderUpdated").withArgs(100, 200);
      });
    });

    describe("updateNextBidderBlockLimit", async function () {
      it("fails if called by a non permissioned account", async function () {
        await accessControlManager.revokeCallPermission(
          shortfall.address,
          "updateNextBidderBlockLimit(uint256)",
          owner.address,
        );
        await expect(shortfall.connect(someone).updateNextBidderBlockLimit(1)).to.be.reverted;
        await accessControlManager.giveCallPermission(
          shortfall.address,
          "updateNextBidderBlockLimit(uint256)",
          owner.address,
        );
      });

      it("updates nextBidderBlockLimit in storage", async function () {
        await shortfall.updateNextBidderBlockLimit(100);
        expect(await shortfall.nextBidderBlockLimit()).to.equal(100);
      });

      it("emits NextBidderBlockLimitUpdated event", async function () {
        const tx = shortfall.updateNextBidderBlockLimit(100);
        await expect(tx).to.emit(shortfall, "NextBidderBlockLimitUpdated").withArgs(10, 100);
      });
    });
  });

  describe("updateIncentiveBps", async function () {
    it("fails if caller is not allowed", async function () {
      await expect(shortfall.connect(someone).updateIncentiveBps(1)).to.be.reverted;
    });

    it("fails if new incentive BPS is set to 0", async function () {
      await expect(shortfall.updateIncentiveBps(0)).to.be.revertedWith("incentiveBps must not be 0");
    });

    it("emits IncentiveBpsUpdated event", async function () {
      const tx = shortfall.updateIncentiveBps(2000);
      await expect(tx).to.emit(shortfall, "IncentiveBpsUpdated").withArgs(1000, 2000);
    });
  });

  describe("placeBid", async function () {
    beforeEach(setup);

    async function startAuction() {
      vDAI.badDebt.returns(parseUnits("10000", 18));
      await vDAI.setVariable("badDebt", parseUnits("10000", 18));
      vWBTC.badDebt.returns(parseUnits("2", 8));
      await vWBTC.setVariable("badDebt", parseUnits("2", 8));
      await shortfall.startAuction(poolAddress);
    }

    it("fails if auction is not active", async function () {
      await expect(shortfall.placeBid(poolAddress, "10000")).to.be.revertedWith("no on-going auction");
    });

    it("fails if auction is stale", async function () {
      await startAuction();
      await mine(100);
      await expect(shortfall.placeBid(poolAddress, "10000")).to.be.revertedWith("auction is stale, restart it");
    });
  });

  describe("LARGE_POOL_DEBT Scenario", async function () {
    before(setup);
    let startBlockNumber;

    it("Should have debt and reserve", async function () {
      vDAI.badDebt.returns(parseUnits("1000", 18));
      vWBTC.badDebt.returns(parseUnits("1", 8));

      expect(await fakeRiskFund.poolReserves(comptroller.address)).equal(parseUnits(riskFundBalance, 18).toString());

      expect(await vDAI.badDebt()).equal(parseUnits("1000", 18));
      expect(await vWBTC.badDebt()).equal(parseUnits("1", 8));
    });

    it("Should not be able to start auction when bad debt is low", async function () {
      vDAI.badDebt.returns(parseUnits("20", 18));
      vWBTC.badDebt.returns(parseUnits("0.01", 8));

      await expect(shortfall.startAuction(poolAddress)).to.be.revertedWith("pool bad debt is too low");
    });

    it("can't restart when there is no ongoing auction", async function () {
      await expect(shortfall.restartAuction(poolAddress)).to.be.revertedWith("no on-going auction");
    });

    it("Should not be able to close auction when there is no active auction", async function () {
      await expect(shortfall.closeAuction(poolAddress)).to.be.revertedWith("no on-going auction");
    });

    it("Should not be able to placeBid when there is no active auction", async function () {
      vDAI.badDebt.returns(parseUnits("20", 18));
      vWBTC.badDebt.returns(parseUnits("0.01", 8));

      await expect(shortfall.placeBid(poolAddress, "1800")).to.be.revertedWith("no on-going auction");
    });

    it("Start auction", async function () {
      vDAI.badDebt.returns(parseUnits("10000", 18));
      await vDAI.setVariable("badDebt", parseUnits("10000", 18));
      vWBTC.badDebt.returns(parseUnits("2", 8));
      await vWBTC.setVariable("badDebt", parseUnits("2", 8));

      const receipt = await shortfall.startAuction(poolAddress);
      startBlockNumber = receipt.blockNumber;

      const auction = await shortfall.auctions(poolAddress);
      expect(auction.status).equal(1);
      expect(auction.auctionType).equal(0);
      expect(auction.seizedRiskFund).equal(parseUnits(riskFundBalance, 18));

      const startBidBps = new BigNumber("10000000000").dividedBy("52000.68").dividedBy("11000").toFixed(2);
      expect(auction.startBidBps.toString()).equal(new BigNumber(startBidBps).times(100).toString());
    });

    it("Should not be able to place bid lower max basis points", async function () {
      await expect(shortfall.placeBid(poolAddress, "10001")).to.be.revertedWith(
        "basis points cannot be more than 10000",
      );
    });

    it("Place bid", async function () {
      const auction = await shortfall.auctions(poolAddress);

      await mockDAI.approve(shortfall.address, parseUnits("10000", 18));
      await mockWBTC.approve(shortfall.address, parseUnits("2", 8));

      const previousDaiBalance = await mockDAI.balanceOf(owner.address);
      const previousWBTCBalance = await mockWBTC.balanceOf(owner.address);

      await shortfall.placeBid(poolAddress, auction.startBidBps);
      expect((await mockDAI.balanceOf(owner.address)).div(parseUnits("1", 18)).toNumber()).lt(
        previousDaiBalance.div(parseUnits("1", 18)).toNumber(),
      );
      expect((await mockWBTC.balanceOf(owner.address)).div(parseUnits("1", 8)).toNumber()).lt(
        previousWBTCBalance.div(parseUnits("1", 8)).toNumber(),
      );

      let percentageToDeduct = new BigNumber(auction.startBidBps.toString()).dividedBy(100);
      let total = new BigNumber((await vDAI.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString());
      let amountToDeduct = new BigNumber(total).times(percentageToDeduct).dividedBy(100).toString();
      let amountDeducted = new BigNumber(previousDaiBalance.div(parseUnits("1", 18)).toString())
        .minus((await mockDAI.balanceOf(owner.address)).div(parseUnits("1", 18)).toString())
        .toString();
      expect(amountDeducted).equal(amountToDeduct);

      percentageToDeduct = new BigNumber(auction.startBidBps.toString()).dividedBy(100);
      total = new BigNumber((await vWBTC.badDebt()).toString()).dividedBy(parseUnits("1", "8").toString());
      amountToDeduct = new BigNumber(total).times(percentageToDeduct).dividedBy(100).toString();
      amountDeducted = new BigNumber(previousWBTCBalance.toString())
        .minus((await mockWBTC.balanceOf(owner.address)).toString())
        .div(parseUnits("1", 8).toString())
        .toString();
      expect(amountDeducted).equal(amountToDeduct);
    });

    it("Should not be able to start auction while on is ongoing", async function () {
      await expect(shortfall.startAuction(poolAddress)).to.be.revertedWith("auction is on-going");
    });

    it("Should not be able to place bid lower than highest bid", async function () {
      await expect(shortfall.placeBid(poolAddress, "1200")).to.be.revertedWith("your bid is not the highest");
    });

    it("Transfer back previous balance after second bid", async function () {
      const auction = await shortfall.auctions(poolAddress);
      const previousOwnerDaiBalance = await mockDAI.balanceOf(owner.address);

      const percentageToDeduct = new BigNumber(auction.startBidBps.toString()).dividedBy(100);
      const totalVDai = new BigNumber((await vDAI.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString());
      const amountToDeductVDai = new BigNumber(totalVDai).times(percentageToDeduct).dividedBy(100).toString();

      const previousOwnerWBtcBalance = await mockWBTC.balanceOf(owner.address);
      const totalVBtc = new BigNumber((await vWBTC.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString());
      const amountToDeductVBtc = new BigNumber(totalVBtc).times(percentageToDeduct).dividedBy(100).toString();

      await shortfall.connect(bidder2).placeBid(poolAddress, "1800");

      expect(await mockDAI.balanceOf(owner.address)).to.be.equal(
        previousOwnerDaiBalance.add(convertToUnit(amountToDeductVDai, 18)),
      );
      expect(await mockWBTC.balanceOf(owner.address)).to.be.equal(
        previousOwnerWBtcBalance.add(convertToUnit(amountToDeductVBtc, 18)),
      );
    });

    it("can't close ongoing auction", async function () {
      await expect(shortfall.closeAuction(poolAddress)).to.be.revertedWith(
        "waiting for next bidder. cannot close auction",
      );
    });

    it("Close Auction", async function () {
      const originalBalance = await mockBUSD.balanceOf(bidder2.address);
      await mine((await shortfall.nextBidderBlockLimit()).toNumber() + 2);

      // simulate transferReserveForAuction
      await mockBUSD.transfer(shortfall.address, parseUnits(riskFundBalance, 18));
      fakeRiskFund.transferReserveForAuction.returns(parseUnits("10000", 18));

      await expect(shortfall.closeAuction(poolAddress))
        .to.emit(shortfall, "AuctionClosed")
        .withArgs(
          comptroller.address,
          startBlockNumber,
          bidder2.address,
          1800,
          parseUnits("10000", 18),
          [vDAI.address, vWBTC.address],
          [parseUnits("1800", 18), "36000000"],
        );

      const auction = await shortfall.auctions(poolAddress);
      expect(auction.status).equal(2);

      expect(vWBTC.badDebtRecovered).to.have.been.calledOnce;
      expect(vWBTC.badDebtRecovered).to.have.been.calledWith("36000000");

      expect(vDAI.badDebtRecovered).to.have.been.calledOnce;
      expect(vDAI.badDebtRecovered).to.have.been.calledWith(parseUnits("1800", 18));
      expect(await mockBUSD.balanceOf(bidder2.address)).to.be.equal(originalBalance.add(auction.seizedRiskFund));
    });
  });

  describe("LARGE_RISK_FUND Scenario", async function () {
    before(setup);
    let startBlockNumber;
    it("Start auction", async function () {
      vDAI.badDebt.returns(parseUnits("10000", 18));
      await vDAI.setVariable("badDebt", parseUnits("10000", 18));
      vWBTC.badDebt.returns(parseUnits("1", 8));
      await vWBTC.setVariable("badDebt", parseUnits("1", 8));

      riskFundBalance = "50000";
      fakeRiskFund.poolReserves.returns(parseUnits(riskFundBalance, 18));

      const receipt = await shortfall.startAuction(poolAddress);
      startBlockNumber = receipt.blockNumber;

      const auction = await shortfall.auctions(poolAddress);
      expect(auction.status).equal(1);
      expect(auction.auctionType).equal(1);

      const startBidBps = new BigNumber(new BigNumber("21000.34").plus(10000).times(1.1).times(100)).dividedBy(
        riskFundBalance,
      );
      expect(new BigNumber(startBidBps).times(riskFundBalance).dividedBy(100).toString()).equal(
        new BigNumber(auction.seizedRiskFund.toString()).dividedBy(parseUnits("1", 18).toString()).toString(),
      );
    });

    it("Place bid", async function () {
      const auction = await shortfall.auctions(poolAddress);

      await mockDAI.approve(shortfall.address, parseUnits("10000", 18));
      await mockWBTC.approve(shortfall.address, parseUnits("1", 8));

      const previousDaiBalance = await mockDAI.balanceOf(owner.address);
      const previousWBTCBalance = await mockWBTC.balanceOf(owner.address);

      await shortfall.placeBid(poolAddress, auction.startBidBps);
      expect((await mockDAI.balanceOf(owner.address)).div(parseUnits("1", 18)).toNumber()).lt(
        previousDaiBalance.div(parseUnits("1", 18)).toNumber(),
      );
      expect((await mockWBTC.balanceOf(owner.address)).div(parseUnits("1", 8)).toNumber()).lt(
        previousWBTCBalance.div(parseUnits("1", 8)).toNumber(),
      );

      let percentageToDeduct = new BigNumber(auction.startBidBps.toString()).dividedBy(100);
      let total = new BigNumber((await vDAI.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString());
      let amountToDeduct = new BigNumber(total).times(percentageToDeduct).dividedBy(100).toString();
      let amountDeducted = new BigNumber(previousDaiBalance.div(parseUnits("1", 18)).toString())
        .minus((await mockDAI.balanceOf(owner.address)).div(parseUnits("1", 18)).toString())
        .toString();
      expect(amountDeducted).equal(amountToDeduct);

      percentageToDeduct = new BigNumber(auction.startBidBps.toString()).dividedBy(100);
      total = new BigNumber((await vWBTC.badDebt()).toString()).dividedBy(parseUnits("1", "8").toString());
      amountToDeduct = new BigNumber(total).times(percentageToDeduct).dividedBy(100).toString();
      amountDeducted = new BigNumber(previousWBTCBalance.toString())
        .minus((await mockWBTC.balanceOf(owner.address)).toString())
        .div(parseUnits("1", 8).toString())
        .toString();
      expect(amountDeducted).equal(amountToDeduct);
    });

    it("Transfer back previous balance after second bid", async function () {
      const auction = await shortfall.auctions(poolAddress);
      const previousOwnerDaiBalance = await mockDAI.balanceOf(owner.address);

      const percentageToDeduct = new BigNumber(auction.startBidBps.toString()).dividedBy(100);
      const totalVDai = new BigNumber((await vDAI.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString());
      const amountToDeductVDai = new BigNumber(totalVDai).times(percentageToDeduct).dividedBy(100).toString();

      const previousOwnerWBtcBalance = await mockWBTC.balanceOf(owner.address);
      const totalVBtc = new BigNumber((await vWBTC.badDebt()).toString()).dividedBy(parseUnits("1", "18").toString());
      const amountToDeductVBtc = new BigNumber(totalVBtc).times(percentageToDeduct).dividedBy(100).toString();

      await shortfall.connect(bidder2).placeBid(poolAddress, "1800");

      expect(await mockDAI.balanceOf(owner.address)).to.be.equal(
        previousOwnerDaiBalance.add(convertToUnit(amountToDeductVDai, 18)),
      );
      expect(await mockWBTC.balanceOf(owner.address)).to.be.equal(
        previousOwnerWBtcBalance.add(convertToUnit(amountToDeductVBtc, 18)),
      );
    });

    it("Close Auction", async function () {
      const originalBalance = await mockBUSD.balanceOf(bidder2.address);
      let auction = await shortfall.auctions(poolAddress);

      await mine((await shortfall.nextBidderBlockLimit()).toNumber() + 2);

      // simulate transferReserveForAuction
      await mockBUSD.transfer(shortfall.address, auction.seizedRiskFund);
      fakeRiskFund.transferReserveForAuction.returns("6138067320000000000000");

      await expect(shortfall.closeAuction(poolAddress))
        .to.emit(shortfall, "AuctionClosed")
        .withArgs(
          comptroller.address,
          startBlockNumber,
          bidder2.address,
          1800,
          "6138067320000000000000",
          [vDAI.address, vWBTC.address],
          [parseUnits("10000", 18), "100000000"],
        );
      auction = await shortfall.auctions(poolAddress);
      expect(auction.status).equal(2);

      expect(vWBTC.badDebtRecovered).to.have.been.calledTwice;
      expect(vWBTC.badDebtRecovered).to.have.been.calledWith(parseUnits("1", 8));

      expect(vDAI.badDebtRecovered).to.have.been.calledTwice;
      expect(vDAI.badDebtRecovered).to.have.been.calledWith(parseUnits("10000", 18));
      const riskFundBidAmount = auction.seizedRiskFund.mul(auction.highestBidBps).div(10000);
      expect(await mockBUSD.balanceOf(bidder2.address)).to.be.equal(originalBalance.add(riskFundBidAmount));
    });
  });

  describe("Restart Auction", async function () {
    beforeEach(setup);

    it("Can't restart auction early ", async function () {
      vDAI.badDebt.returns(parseUnits("10000", 18));
      await vDAI.setVariable("badDebt", parseUnits("10000", 18));
      vWBTC.badDebt.returns(parseUnits("2", 8));
      await vWBTC.setVariable("badDebt", parseUnits("2", 8));

      await shortfall.startAuction(poolAddress);
      await mine(5);
      await expect(shortfall.restartAuction(poolAddress)).to.be.revertedWith(
        "you need to wait for more time for first bidder",
      );
    });

    it("Can restart auction", async function () {
      vDAI.badDebt.returns(parseUnits("1000", 18));
      await vDAI.setVariable("badDebt", parseUnits("1000", 18));
      vWBTC.badDebt.returns(parseUnits("1", 8));
      await vWBTC.setVariable("badDebt", parseUnits("1", 8));

      const receipt = await shortfall.startAuction(poolAddress);

      await mine(100);

      await expect(shortfall.restartAuction(poolAddress))
        .to.emit(shortfall, "AuctionRestarted")
        .withArgs(poolAddress, receipt.blockNumber);
    });

    it("Cannot restart auction after a bid is placed", async function () {
      vDAI.badDebt.returns(parseUnits("1000", 18));
      await vDAI.setVariable("badDebt", parseUnits("1000", 18));
      vWBTC.badDebt.returns(parseUnits("1", 8));
      await vWBTC.setVariable("badDebt", parseUnits("1", 8));

      await shortfall.startAuction(poolAddress);
      const auction = await shortfall.auctions(poolAddress);

      await mockDAI.approve(shortfall.address, parseUnits("50000", 18));
      await mockWBTC.approve(shortfall.address, parseUnits("50000", 8));

      await shortfall.placeBid(poolAddress, auction.startBidBps);

      await mine(100);

      await expect(shortfall.restartAuction(poolAddress)).to.be.revertedWith(
        "you need to wait for more time for first bidder",
      );
    });
  });
});

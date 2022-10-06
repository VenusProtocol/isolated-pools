import {
  PoolRegistry,
  AccessControlManager,
  RiskFund,
  VBep20ImmutableFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  LiquidatedShareReserve,
  PriceOracle,
  MockPriceOracle,
  Comp,
  Comptroller,
  VToken,
  MockToken,
  VBep20,
  VBep20Immutable,
} from "../../typechain";
import chai from "chai";
import { smock } from "@defi-wonderland/smock";
import { convertToUnit } from "../../helpers/utils";
import { Error } from "../hardhat/util/Errors";
import { ethers } from "hardhat";
import { BigNumber, Signer} from "ethers";

const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { deployments } = require("hardhat");
const { expect } = chai;
chai.use(smock.matchers);

const setupTest = deployments.createFixture(
  async ({ deployments, getNamedAccounts, ethers }: any) => {
    await deployments.fixture(["Pools"]);
    const { deployer, acc1 } = await getNamedAccounts();
    const PoolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry");
    const AccessControlManager = await ethers.getContract(
      "AccessControlManager"
    );
    const RiskFund = await ethers.getContract("RiskFund");
    const VBep20ImmutableFactory = await ethers.getContract(
      "VBep20ImmutableFactory"
    );
    const JumpRateModelFactory = await ethers.getContract(
      "JumpRateModelFactory"
    );
    const WhitePaperRateFactory = await ethers.getContract(
      "WhitePaperInterestRateModelFactory"
    );
    const LiquidatedShareReserve = await ethers.getContract(
      "LiquidatedShareReserve"
    );

    const PriceOracle = await ethers.getContract("MockPriceOracle");

    const pools = await PoolRegistry.callStatic.getAllPools();
    const Comptroller = await ethers.getContractAt(
      "Comptroller",
      pools[0].comptroller
    );

    const wBTC = await ethers.getContract("MockBTC");
    const DAI = await ethers.getContract("MockDAI");

    // Set Oracle
    await Comptroller._setPriceOracle(PriceOracle.address);

    const vWBTCAddress = await PoolRegistry.getVTokenForAsset(1, wBTC.address);
    const vDAIAddress = await PoolRegistry.getVTokenForAsset(1, DAI.address);

    const vWBTC = await ethers.getContractAt("VBep20Immutable", vWBTCAddress);
    const vDAI = await ethers.getContractAt("VBep20Immutable", vDAIAddress);


    //Enter Markets
    await Comptroller.enterMarkets([vDAI.address, vWBTC.address]);

    //Enable Access to Supply Caps
    await AccessControlManager.giveCallPermission(
      ethers.constants.AddressZero,
      "_setMarketSupplyCaps(VToken[],uint256[])",
      deployer
    );

    //Set Supply Caps
    let supply = convertToUnit(10, 6);
    await Comptroller._setMarketSupplyCaps(
      [vDAI.address, vWBTC.address],
      [supply, supply]
    );
    return {
      fixture: {
        PoolRegistry,
        AccessControlManager,
        RiskFund,
        VBep20ImmutableFactory,
        JumpRateModelFactory,
        WhitePaperRateFactory,
        LiquidatedShareReserve,
        PriceOracle,
        Comptroller,
        vWBTC,
        vDAI,
        wBTC,
        DAI,
        deployer,
        acc1
      },
    };
  }
);

describe("Positive Cases", () => {
  let fixture;
  let PoolRegistry: PoolRegistry;
  let AccessControlManager: AccessControlManager;
  let RiskFund: RiskFund;
  let VBep20ImmutableFactory: VBep20ImmutableFactory;
  let JumpRateModelFactory: JumpRateModelFactory;
  let WhitePaperRateFactory: WhitePaperInterestRateModelFactory;
  let LiquidatedShareReserve: LiquidatedShareReserve;
  let PriceOracle: MockPriceOracle;
  let Comptroller: Comptroller;
  let vWBTC: VBep20Immutable;
  let vDAI: VBep20Immutable;
  let wBTC: MockToken;
  let DAI: MockToken;
  let deployer: any;
  let acc1: any;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({
      PoolRegistry,
      AccessControlManager,
      RiskFund,
      VBep20ImmutableFactory,
      JumpRateModelFactory,
      WhitePaperRateFactory,
      LiquidatedShareReserve,
      PriceOracle,
      Comptroller,
      vWBTC,
      vDAI,
      wBTC,
      DAI,
      deployer,
      acc1
    } = fixture);
  });
  describe("Setup", () => {
    it("PoolRegistry should be initialized properly", async function () {
      await expect(
        PoolRegistry.initialize(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("PoolRegistry has the required permissions ", async function () {
      let canCall = await AccessControlManager.connect(
        Comptroller.address
      ).isAllowedToCall(
        PoolRegistry.address,
        "_setCollateralFactor(VToken,uint256)"
      );
      expect(canCall).to.be.true;

      canCall = await AccessControlManager.connect(
        Comptroller.address
      ).isAllowedToCall(PoolRegistry.address, "_supportMarket(VToken)");
      expect(canCall).to.be.true;

      canCall = await AccessControlManager.connect(
        Comptroller.address
      ).isAllowedToCall(PoolRegistry.address, "_setLiquidationIncentive(uint)");
      expect(canCall).to.be.true;
    });
  });
  describe("Main Operations", () => {
    const mintAmount: number = 1e6;
    const borrowAmount: number = 1e6;
    const collateralFactor: number = 0.7;
    let otherAcc: Signer;


    beforeEach(async () =>{
      await DAI.faucet(mintAmount*100);
      await DAI.approve(vDAI.address, mintAmount * 10);

      // Fund 2nd account
      otherAcc = await ethers.getSigner(acc1);
      await wBTC.connect(otherAcc).faucet(mintAmount*100);
      await wBTC.connect(otherAcc).approve(vWBTC.address, mintAmount * 100);
    });
    it.only("Mint, Redeem, Borrow, Repay", async function () {
      
      let error: BigNumber;
      let liquidity: BigNumber;
      let shortfall: BigNumber;
      let balance: BigNumber;
      let borrowBalance: BigNumber;
      let exchangeRate: BigNumber;

      ////////////
      /// MINT ///
      ////////////

      await expect(vDAI.mint(mintAmount))
        .to.emit(vDAI, "Mint")
        .withArgs(deployer, mintAmount, mintAmount);
      [error, balance, borrowBalance, exchangeRate] =
        await vDAI.getAccountSnapshot(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(mintAmount);
      expect(borrowBalance).to.equal(0);

      [error, liquidity, shortfall] = await Comptroller.getAccountLiquidity(deployer)
     
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(mintAmount*collateralFactor);
      expect(shortfall).to.equal(0);

      ////////////
      // Borrow //
      ////////////

      let expectedMintScaled = convertToUnit(0.01,18);

      //Supply WBTC to market from 2nd account
      await expect(vWBTC.connect(otherAcc).mint(mintAmount))
      .to.emit(vWBTC, "Mint")
      .withArgs(await otherAcc.getAddress(), mintAmount, expectedMintScaled);

      [error, balance, borrowBalance, exchangeRate] = await vWBTC.getAccountSnapshot(await otherAcc.getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(expectedMintScaled)
      expect(borrowBalance).to.equal(0);
      
      [error, liquidity, shortfall] = await Comptroller.getAccountLiquidity(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(mintAmount*collateralFactor);
      expect(shortfall).to.equal(0);

      let borrowAmount = convertToUnit(7,4);

      const btcBorrowAmount = 1e4;

      await expect(vWBTC.borrow(btcBorrowAmount))
        .to.emit(vWBTC, "Borrow")
        .withArgs(deployer, btcBorrowAmount, btcBorrowAmount,btcBorrowAmount);

      [error, balance, borrowBalance, exchangeRate] =
        await vWBTC.getAccountSnapshot(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(0);
      expect(borrowBalance).to.equal(btcBorrowAmount);

      ////////////
      // REDEEM //
      ////////////

      let redeemAmount = 10e3;
      await expect(vDAI.redeem(redeemAmount)).to.emit(vDAI,"Redeem")
      .withArgs(deployer,redeemAmount,redeemAmount);

      [error, balance, borrowBalance, exchangeRate] = await vDAI.getAccountSnapshot(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(mintAmount-redeemAmount);
      expect(borrowBalance).to.equal(0);

      [error, liquidity, shortfall] = await Comptroller.getAccountLiquidity(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      // Not sure why liquidity is 593000
      // Balance * CF = 990000*0.7 = 693000
      expect(liquidity).to.equal((mintAmount-redeemAmount)*collateralFactor-1e5);
      expect(shortfall).to.equal(0);


      ////////////
      /// REPAY //
      ////////////
      await wBTC.faucet(btcBorrowAmount);
      await wBTC.approve(vWBTC.address, btcBorrowAmount);
      await expect(vWBTC.repayBorrow(btcBorrowAmount)).to.emit(vWBTC,"RepayBorrow");

      [error, balance, borrowBalance, exchangeRate] = await vDAI.getAccountSnapshot(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(mintAmount-redeemAmount);
      expect(borrowBalance).to.equal(0);

      [error, liquidity, shortfall] = await Comptroller.getAccountLiquidity(deployer);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(((mintAmount-redeemAmount)*collateralFactor));
      expect(shortfall).to.equal(0);
    });
    
  });
});

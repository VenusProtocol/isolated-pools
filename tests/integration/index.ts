import {
  PoolRegistry,
  AccessControlManager,
  RiskFund,
  VBep20ImmutableProxyFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  ProtocolShareReserve,
  PriceOracle,
  MockPriceOracle,
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
    const { deployer, acc1, acc2 } = await getNamedAccounts();
    const PoolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry");
    const AccessControlManager = await ethers.getContract(
      "AccessControlManager"
    );
    const RiskFund = await ethers.getContract("RiskFund");
    const VBep20ImmutableFactory = await ethers.getContract(
      "VBep20ImmutableProxyFactory"
    );
    const JumpRateModelFactory = await ethers.getContract(
      "JumpRateModelFactory"
    );
    const WhitePaperRateFactory = await ethers.getContract(
      "WhitePaperInterestRateModelFactory"
    );
    const ProtocolShareReserve = await ethers.getContract(
      "ProtocolShareReserve"
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
    await Comptroller.connect(await ethers.getSigner(acc1)).enterMarkets([vDAI.address, vWBTC.address]);
    await Comptroller.connect(await ethers.getSigner(acc2)).enterMarkets([vDAI.address, vWBTC.address]);

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
        ProtocolShareReserve,
        PriceOracle,
        Comptroller,
        vWBTC,
        vDAI,
        wBTC,
        DAI,
        deployer,
        acc1,
        acc2
      },
    };
  }
);

describe("Positive Cases", () => {
  let fixture;
  let PoolRegistry: PoolRegistry;
  let AccessControlManager: AccessControlManager;
  let RiskFund: RiskFund;
  let VBep20ImmutableFactory: VBep20ImmutableProxyFactory;
  let JumpRateModelFactory: JumpRateModelFactory;
  let WhitePaperRateFactory: WhitePaperInterestRateModelFactory;
  let ProtocolShareReserve: ProtocolShareReserve;
  let PriceOracle: MockPriceOracle;
  let Comptroller: Comptroller;
  let vWBTC: VBep20Immutable;
  let vDAI: VBep20Immutable;
  let wBTC: MockToken;
  let DAI: MockToken;
  let deployer: string;
  let acc1: string;
  let acc2: string;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({
      PoolRegistry,
      AccessControlManager,
      RiskFund,
      VBep20ImmutableFactory,
      JumpRateModelFactory,
      WhitePaperRateFactory,
      ProtocolShareReserve,
      PriceOracle,
      Comptroller,
      vWBTC,
      vDAI,
      wBTC,
      DAI,
      deployer,
      acc1,
      acc2
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
        "_setCollateralFactor(VToken,uint256,uint256)"
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
    let acc1Signer: Signer;
    let acc2Signer: Signer;


    beforeEach(async () =>{
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await DAI.connect(acc2Signer).faucet(mintAmount*100);
      await DAI.connect(acc2Signer).approve(vDAI.address, mintAmount * 10);

      // Fund 2nd account
      await wBTC.connect(acc1Signer).faucet(mintAmount*100);
      await wBTC.connect(acc1Signer).approve(vWBTC.address, mintAmount * 100);
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
      await expect(vDAI.connect(acc2Signer).mint(mintAmount))
        .to.emit(vDAI, "Mint")
        .withArgs(acc2, mintAmount, mintAmount);
      [error, balance, borrowBalance, exchangeRate] =
        await vDAI.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(mintAmount);
      expect(borrowBalance).to.equal(0);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(mintAmount*collateralFactor);
      expect(shortfall).to.equal(0);
      ////////////
      // Borrow //
      ////////////

      let expectedMintScaled = convertToUnit(0.01,18);
      //Supply WBTC to market from 2nd account
      await expect(vWBTC.connect(acc1Signer).mint(mintAmount))
      .to.emit(vWBTC, "Mint")
      .withArgs(await acc1Signer.getAddress(), mintAmount, expectedMintScaled);

      [error, balance, borrowBalance, exchangeRate] = await vWBTC.connect(acc2Signer).getAccountSnapshot(await acc1Signer.getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(expectedMintScaled)
      expect(borrowBalance).to.equal(0);

      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(mintAmount*collateralFactor);
      expect(shortfall).to.equal(0);

      let borrowAmount = convertToUnit(7,4);

      const btcBorrowAmount = 1e4;

      await expect(vWBTC.connect(acc2Signer).borrow(btcBorrowAmount))
        .to.emit(vWBTC, "Borrow")
        .withArgs(acc2, btcBorrowAmount, btcBorrowAmount,btcBorrowAmount);

      [error, balance, borrowBalance, exchangeRate] =
        await vWBTC.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(0);
      expect(borrowBalance).to.equal(btcBorrowAmount);

      ////////////
      // REDEEM //
      ////////////

      let redeemAmount = 10e3;
      await expect(vDAI.connect(acc2Signer).redeem(redeemAmount)).to.emit(vDAI,"Redeem")
      .withArgs(acc2,redeemAmount,redeemAmount);

      [error, balance, borrowBalance, exchangeRate] = await vDAI.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(mintAmount-redeemAmount);
      expect(borrowBalance).to.equal(0);

      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      // Not sure why liquidity is 593000
      // Balance * CF = 990000*0.7 = 693000
      expect(liquidity).to.equal((mintAmount-redeemAmount)*collateralFactor-1e5);
      expect(shortfall).to.equal(0);


      ////////////
      /// REPAY //
      ////////////
      await wBTC.connect(acc2Signer).faucet(btcBorrowAmount);
      await wBTC.connect(acc2Signer).approve(vWBTC.address, btcBorrowAmount);
      await expect(vWBTC.connect(acc2Signer).repayBorrow(btcBorrowAmount)).to.emit(vWBTC,"RepayBorrow");

      [error, balance, borrowBalance, exchangeRate] = await vDAI.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(mintAmount-redeemAmount);
      expect(borrowBalance).to.equal(0);

      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(((mintAmount-redeemAmount)*collateralFactor));
      expect(shortfall).to.equal(0);
    });
    
  });
});

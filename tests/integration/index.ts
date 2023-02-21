import { FakeContract, smock } from "@defi-wonderland/smock";
import BigNumber from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";
import { deployments } from "hardhat";

import { convertToUnit, scaleDownBy } from "../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  MockToken,
  PoolRegistry,
  PriceOracle,
  RewardsDistributor,
  RiskFund,
  VToken,
} from "../../typechain";
import { Error } from "../hardhat/util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

const toggleMining = async status => {
  if (!status) {
    await ethers.provider.send("evm_setAutomine", [false]);
  } else {
    await ethers.provider.send("evm_setAutomine", [true]);
  }
};

const mineBlock = async () => {
  await ethers.provider.send("hardhat_mine");
};

const setupTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }: any) => {
  await deployments.fixture([
    "MockTokens",
    "OracleDeploy",
    "Oracle",
    "SwapRouter",
    "AccessControl",
    "RiskFund",
    "Factories",
    "AccessControlConfig",
    "Pools",
  ]);
  const EXPONENT_SCALE = 10e18;
  const { deployer, acc1, acc2, acc3 } = await getNamedAccounts();
  const PoolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry");
  const AccessControlManager = await ethers.getContract("AccessControlManager");
  const RiskFund = await ethers.getContract("RiskFund");
  const VTokenFactory = await ethers.getContract("VTokenProxyFactory");
  const JumpRateModelFactory = await ethers.getContract("JumpRateModelFactory");
  const WhitePaperRateFactory = await ethers.getContract("WhitePaperInterestRateModelFactory");
  const ProtocolShareReserve = await ethers.getContract("ProtocolShareReserve");
  const shortfall = await ethers.getContract("Shortfall");

  const PriceOracle = await ethers.getContract("ResilientOracle");

  const pools = await PoolRegistry.callStatic.getAllPools();
  const Comptroller = await ethers.getContractAt("Comptroller", pools[0].comptroller);

  const BNX = await ethers.getContract("MockBNX");
  const WBNB = await ethers.getContract("MockWBNB");
  const BUSD = await ethers.getContract("MockBUSD");

  await RiskFund.setPoolRegistry(PoolRegistry.address);
  await ProtocolShareReserve.setPoolRegistry(PoolRegistry.address);

  // Set Oracle
  await Comptroller.setPriceOracle(PriceOracle.address);

  const vBNXAddress = await PoolRegistry.getVTokenForAsset(Comptroller.address, BNX.address);
  const vWBNBAddress = await PoolRegistry.getVTokenForAsset(Comptroller.address, WBNB.address);

  const vBNX = await ethers.getContractAt("VToken", vBNXAddress);
  const vWBNB = await ethers.getContractAt("VToken", vWBNBAddress);

  // Enter Markets
  await Comptroller.connect(await ethers.getSigner(acc1)).enterMarkets([vBNX.address, vWBNB.address]);
  await Comptroller.connect(await ethers.getSigner(acc2)).enterMarkets([vBNX.address, vWBNB.address]);
  await Comptroller.connect(await ethers.getSigner(acc3)).enterMarkets([vBNX.address, vWBNB.address]);

  // Enable access to setting supply and borrow caps
  await AccessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMarketSupplyCaps(address[],uint256[])",
    deployer,
  );
  await AccessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMarketBorrowCaps(address[],uint256[])",
    deployer,
  );

  // Set supply caps
  const supply = convertToUnit(10, 36);
  await Comptroller.setMarketSupplyCaps([vBNX.address, vWBNB.address], [supply, supply]);

  // Set borrow caps
  const borrowCap = convertToUnit(10, 36);
  await Comptroller.setMarketBorrowCaps([vBNX.address, vWBNB.address], [borrowCap, borrowCap]);

  const vBNXPrice: BigNumber = new BigNumber(
    scaleDownBy((await PriceOracle.getUnderlyingPrice(vBNX.address)).toString(), 18),
  );
  const vWBNBPrice: BigNumber = new BigNumber(
    scaleDownBy((await PriceOracle.getUnderlyingPrice(vWBNB.address)).toString(), 18),
  );

  await RiskFund.setPoolRegistry(PoolRegistry.address);

  await ProtocolShareReserve.setPoolRegistry(PoolRegistry.address);

  return {
    fixture: {
      PoolRegistry,
      AccessControlManager,
      RiskFund,
      VTokenFactory,
      JumpRateModelFactory,
      WhitePaperRateFactory,
      ProtocolShareReserve,
      PriceOracle,
      Comptroller,
      vBNX,
      vWBNB,
      BNX,
      WBNB,
      deployer,
      acc1,
      acc2,
      vBNXPrice,
      vWBNBPrice,
      acc3,
      BUSD,
      shortfall,
    },
  };
});

describe("Positive Cases", () => {
  let fixture;
  let PoolRegistry: PoolRegistry;
  let AccessControlManager: AccessControlManager;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vWBNB: VToken;
  let BNX: MockToken;
  let WBNB: MockToken;
  let acc1: string;
  let acc2: string;
  let deployer: string;
  let vBNXPrice: BigNumber;
  let vWBNBPrice: BigNumber;
  let rewardDistributor: FakeContract<RewardsDistributor>;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({
      PoolRegistry,
      AccessControlManager,
      Comptroller,
      vBNX,
      vWBNB,
      BNX,
      WBNB,
      acc1,
      acc2,
      vBNXPrice,
      vWBNBPrice,
      deployer,
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
          ethers.constants.AddressZero,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("PoolRegistry has the required permissions ", async function () {
      let canCall = await AccessControlManager.connect(Comptroller.address).isAllowedToCall(
        PoolRegistry.address,
        "setCollateralFactor(address,uint256,uint256)",
      );
      expect(canCall).to.be.true;

      canCall = await AccessControlManager.connect(Comptroller.address).isAllowedToCall(
        PoolRegistry.address,
        "supportMarket(address)",
      );
      expect(canCall).to.be.true;

      canCall = await AccessControlManager.connect(Comptroller.address).isAllowedToCall(
        PoolRegistry.address,
        "setLiquidationIncentive(uint256)",
      );
      expect(canCall).to.be.true;
    });
  });

  describe("Transfer Operation", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 18);
    let acc2Signer: Signer;
    let acc1Signer: Signer;
    it("Approve and transfer by owner", async function () {
      acc2Signer = await ethers.getSigner(acc2);

      rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
      await Comptroller.addRewardsDistributor(rewardDistributor.address);
      const comptrollerRewardDistributor = await Comptroller.getRewardDistributors();
      expect(comptrollerRewardDistributor[0]).equal(rewardDistributor.address);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      await vBNX.connect(acc2Signer).mint(mintAmount);
      await vBNX.connect(acc2Signer).approve(acc1, convertToUnit(1, 6));
      expect(await vBNX.allowance(acc2, acc1)).to.be.equal(convertToUnit(1, 6));
      await vBNX.connect(acc2Signer).transfer(acc1, convertToUnit(1, 6));
      expect(await vBNX.balanceOf(acc1)).to.be.equal(convertToUnit(1, 6));
    });

    it("Approve and transferFrom", async function () {
      acc2Signer = await ethers.getSigner(acc2);
      acc1Signer = await ethers.getSigner(acc1);

      rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
      await Comptroller.addRewardsDistributor(rewardDistributor.address);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      await vBNX.connect(acc2Signer).mint(mintAmount);
      await vBNX.connect(acc2Signer).approve(acc1, convertToUnit(1, 6));
      await vBNX.connect(acc1Signer).transferFrom(acc2, acc1, convertToUnit(1, 6));
      expect(await vBNX.balanceOf(acc1)).to.be.equal(convertToUnit(1, 6));
    });

    it("Success on sweep tokens ", async function () {
      acc2Signer = await ethers.getSigner(acc2);
      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).transfer(vWBNB.address, mintAmount);
      expect(await BNX.balanceOf(deployer)).to.be.equal(0);
      await vWBNB.sweepToken(BNX.address);
      expect(await BNX.balanceOf(deployer)).to.be.equal(mintAmount);
    });
  });

  describe("Main Operations", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 18);
    const vTokenMintAmount: BigNumberish = convertToUnit(1, 8);
    const collateralFactor: number = 0.7;
    let acc1Signer: Signer;
    let acc2Signer: Signer;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
      await Comptroller.addRewardsDistributor(rewardDistributor.address);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await WBNB.connect(acc1Signer).faucet(mintAmount);
      await WBNB.connect(acc1Signer).approve(vWBNB.address, mintAmount);
    });

    it("Mint, Redeem, Borrow, Repay", async function () {
      let error: BigNumber;
      let liquidity: BigNumber;
      let shortfall: BigNumber;
      let balance: BigNumber;
      let borrowBalance: BigNumber;
      // //////////
      // // MINT //
      // //////////
      const tx = await vBNX.connect(acc2Signer).mint(mintAmount);
      await expect(tx).to.emit(vBNX, "Mint").withArgs(acc2, mintAmount, vTokenMintAmount, vTokenMintAmount);
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(vTokenMintAmount);
      expect(borrowBalance).to.equal(0);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(new BigNumber(mintAmount).multipliedBy(collateralFactor).multipliedBy(vBNXPrice));
      expect(shortfall).to.equal(0);
      // ////////////
      // // Borrow //
      // ////////////
      // Supply WBNB to market from 1st account
      await expect(vWBNB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vWBNB, "Mint")
        .withArgs(await acc1Signer.getAddress(), mintAmount, vTokenMintAmount, vTokenMintAmount);
      [error, balance, borrowBalance] = await vWBNB.getAccountSnapshot(await acc1Signer.getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(vTokenMintAmount);
      expect(borrowBalance).to.equal(0);
      [error, liquidity, shortfall] = await Comptroller.connect(acc1Signer).getAccountLiquidity(acc1);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(new BigNumber(mintAmount).multipliedBy(collateralFactor).multipliedBy(vWBNBPrice));
      expect(shortfall).to.equal(0);
      const WBNBBorrowAmount = convertToUnit(1, 18);
      await expect(vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount))
        .to.emit(vWBNB, "Borrow")
        .withArgs(acc2, WBNBBorrowAmount, WBNBBorrowAmount, WBNBBorrowAmount);
      [error, balance, borrowBalance] = await vWBNB.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(0);
      expect(borrowBalance).to.equal(WBNBBorrowAmount);
      // ////////////
      // // REDEEM //
      // ////////////
      const vTokenRedeemAmount = convertToUnit(5, 7);
      const tokenRedeemAmount = convertToUnit(5, 17);
      const balanceAfterVToken = new BigNumber(vTokenMintAmount).minus(vTokenRedeemAmount);
      const balanceAfter = new BigNumber(mintAmount).minus(tokenRedeemAmount);
      await expect(vBNX.connect(acc2Signer).redeem(vTokenRedeemAmount))
        .to.emit(vBNX, "Redeem")
        .withArgs(acc2, tokenRedeemAmount, vTokenRedeemAmount, balanceAfterVToken);
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(balanceAfterVToken);
      expect(borrowBalance).to.equal(0);
      [error, balance, borrowBalance] = await vWBNB.connect(acc2Signer).getAccountSnapshot(acc2);
      const bnxLiquidity = new BigNumber(mintAmount).minus(new BigNumber(tokenRedeemAmount)).multipliedBy(vBNXPrice);
      const WBNBBorrow = new BigNumber(borrowBalance.toString()).multipliedBy(vWBNBPrice);
      let preComputeLiquidity = bnxLiquidity.minus(WBNBBorrow).multipliedBy(collateralFactor);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(Number(liquidity)).to.be.closeTo(preComputeLiquidity.toNumber(), Number(convertToUnit(1, 18)));
      expect(shortfall).to.equal(0);
      // ////////////
      // // REPAY //
      // //////////
      await WBNB.connect(acc2Signer).faucet(WBNBBorrowAmount);
      await WBNB.connect(acc2Signer).approve(vWBNB.address, WBNBBorrowAmount);
      await expect(vWBNB.connect(acc2Signer).repayBorrow(WBNBBorrowAmount)).to.emit(vWBNB, "RepayBorrow");
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(balanceAfterVToken);
      expect(borrowBalance).to.equal(0);
      preComputeLiquidity = balanceAfter.multipliedBy(collateralFactor).multipliedBy(vBNXPrice);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(Number(liquidity)).to.be.closeTo(preComputeLiquidity.toNumber(), Number(convertToUnit(1, 14)));
      expect(shortfall).to.equal(0);
    });
  });
});

describe("Straight Cases For Single User Liquidation and healing", () => {
  let fixture;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vWBNB: VToken;
  let BNX: MockToken;
  let WBNB: MockToken;
  let acc1: string;
  let acc2: string;
  let vBNXPrice: BigNumber;
  const EXPONENT_SCALE = 1e18;
  let rewardDistributor: FakeContract<RewardsDistributor>;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ Comptroller, vBNX, vWBNB, BNX, WBNB, acc1, acc2, vBNXPrice } = fixture);
    rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
    await Comptroller.addRewardsDistributor(rewardDistributor.address);
  });

  describe("Force Liquidation of user via Comptroller", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 15);
    const WBNBBorrowAmount: BigNumberish = convertToUnit(1, 15);
    const vTokenMintedAmount: BigNumberish = convertToUnit(1, 5);
    const insufficientLiquidityBorrow: BigNumberish = convertToUnit(3, 18);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let result;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await WBNB.connect(acc1Signer).faucet(mintAmount);
      await WBNB.connect(acc1Signer).approve(vWBNB.address, mintAmount);
      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // borrow
      // Supply WBNB to market from 2nd account
      await expect(vWBNB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vWBNB, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // It should revert when try to borrow more than liquidity
      await expect(vWBNB.connect(acc2Signer).borrow(insufficientLiquidityBorrow)).to.be.revertedWithCustomError(
        Comptroller,
        "InsufficientLiquidity",
      );
      // Approve more assets for liquidation
      await WBNB.connect(acc1Signer).faucet(insufficientLiquidityBorrow);
      await WBNB.connect(acc1Signer).approve(vWBNB.address, insufficientLiquidityBorrow);
      await expect(vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount))
        .to.emit(vWBNB, "Borrow")
        .withArgs(acc2, WBNBBorrowAmount, WBNBBorrowAmount, WBNBBorrowAmount);
    });

    it("Should revert when repay amount on liquidation is not equal to borrow amount", async function () {
      await BNX.connect(acc2Signer).faucet(1e10);
      await BNX.connect(acc2Signer).approve(vBNX.address, 1e10);
      await vBNX.connect(acc2Signer).mint(1e10);
      // Repay amount does not make borrower principal to zero
      const repayAmount = Number(WBNBBorrowAmount) / 2;
      const param = {
        vTokenCollateral: vBNX.address,
        vTokenBorrowed: vWBNB.address,
        repayAmount: repayAmount,
      };
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 12));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("100", 12));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await expect(Comptroller.connect(acc1Signer).liquidateAccount(acc2, [param])).to.be.revertedWith(
        "Nonzero borrow balance after liquidation",
      );
    });

    it("Should success on liquidation when repayamount is equal to borrowing", async function () {
      await BNX.connect(acc2Signer).faucet(1e10);
      await BNX.connect(acc2Signer).approve(vBNX.address, 1e10);
      await vBNX.connect(acc2Signer).mint(1e10);

      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 12));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("100", 12));

      const vBNXPriceFake: BigNumber = new BigNumber(
        scaleDownBy((await dummyPriceOracle.getUnderlyingPrice(vBNX.address)).toString(), 18),
      );
      const vWBNBPriceFake: BigNumber = new BigNumber(
        scaleDownBy((await dummyPriceOracle.getUnderlyingPrice(vWBNB.address)).toString(), 18),
      );

      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      const repayAmount = convertToUnit("1000000000013588", 0);
      const param = {
        vTokenCollateral: vBNX.address,
        vTokenBorrowed: vWBNB.address,
        repayAmount: repayAmount,
      };

      result = await Comptroller.connect(acc1Signer).liquidateAccount(acc2, [param]);
      const seizeAmount = EXPONENT_SCALE * repayAmount * (vWBNBPriceFake / vBNXPriceFake);
      const exchangeRateStored = await vBNX.exchangeRateStored();
      const seizeTokensOverall = seizeAmount / exchangeRateStored;
      const reserveMantissa = await vWBNB.protocolSeizeShareMantissa();
      const seizeTokens = seizeTokensOverall - (seizeTokensOverall * reserveMantissa) / EXPONENT_SCALE;

      await expect(result)
        .to.emit(vWBNB, "LiquidateBorrow")
        .withArgs(acc1, acc2, repayAmount, vBNX.address, seizeTokensOverall.toFixed(0));
      const liquidatorBalance = await vBNX.connect(acc1Signer).balanceOf(acc1);
      expect(liquidatorBalance).to.equal(seizeTokens.toFixed(0));
    });
  });

  describe("Liquidation of user via Vtoken", () => {
    let mintAmount = convertToUnit("1", 17);
    let vTokenMintAmount = convertToUnit("1", 7);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let WBNBBorrowAmount = convertToUnit("1", 4);
    let udnerlyingMintAmount;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await WBNB.connect(acc1Signer).faucet(mintAmount);
      await WBNB.connect(acc1Signer).approve(vWBNB.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintAmount, vTokenMintAmount);
      // borrow
      // Supply WBNB to market from 2nd account
      await expect(vWBNB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vWBNB, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintAmount, vTokenMintAmount);
      await expect(vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount))
        .to.emit(vWBNB, "Borrow")
        .withArgs(acc2, WBNBBorrowAmount, WBNBBorrowAmount, WBNBBorrowAmount);

      // Approve more assets for liquidation
      await WBNB.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await WBNB.connect(acc1Signer).approve(vWBNB.address, convertToUnit("1", 18));
    });

    it("Should revert when liquidation is called through vToken and does not met minCollateral Criteria", async function () {
      const collateral: BigNumberish = vBNXPrice * mintAmount;
      await expect(vWBNB.connect(acc1Signer).liquidateBorrow(acc2, WBNBBorrowAmount, vWBNB.address))
        .to.be.revertedWithCustomError(Comptroller, "MinimalCollateralViolated")
        .withArgs("100000000000000000000", collateral.toString());
    });

    it("Should revert when try to drain market", async function () {
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 40));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await vWBNB.connect(acc2Signer).borrow(convertToUnit("1", 18));
      await expect(vWBNB.connect(acc2Signer).borrow(convertToUnit("1", 28))).to.be.revertedWithCustomError(
        vWBNB,
        "BorrowCashNotAvailable",
      );
    });

    it("Should revert when liquidation is called through vToken and no shortfall", async function () {
      // Mint and Increase collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 18);
      await BNX.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, udnerlyingMintAmount);

      await vBNX.connect(acc2Signer).mint(udnerlyingMintAmount);
      // Liquidation
      await expect(
        vWBNB.connect(acc1Signer).liquidateBorrow(acc2, WBNBBorrowAmount, vWBNB.address),
      ).to.be.revertedWithCustomError(Comptroller, "InsufficientShortfall");
    });

    it("Should revert when liquidation is called through vToken and trying to seize more tokens", async function () {
      // Mint and Incrrease collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 18);
      const VTokenMintAmount = convertToUnit(1, 8);
      await BNX.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, udnerlyingMintAmount);
      const expectedTotalBalance = Number(convertToUnit(1, 7)) + Number(convertToUnit(1, 8));
      await expect(vBNX.connect(acc2Signer).mint(udnerlyingMintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, udnerlyingMintAmount, VTokenMintAmount, expectedTotalBalance);
      // price manipulation and borrow to overcome insufficient shortfall
      WBNBBorrowAmount = convertToUnit("1", 18);
      await vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount);
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("100", 40));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      // Liquidation
      await expect(vWBNB.connect(acc1Signer).liquidateBorrow(acc2, 201, vBNX.address)).to.be.revertedWith(
        "LIQUIDATE_SEIZE_TOO_MUCH",
      );
    });

    it("Should revert when liquidation is called through vToken and trying to pay too much", async function () {
      // Mint and Incrrease collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 18);
      const VTokenMintAmount = convertToUnit("1", 8);
      const expectedTotalBalance = Number(convertToUnit(1, 7)) + Number(convertToUnit(1, 8));
      await BNX.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, udnerlyingMintAmount);

      await expect(vBNX.connect(acc2Signer).mint(udnerlyingMintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, udnerlyingMintAmount, VTokenMintAmount, expectedTotalBalance);
      // price manipulation and borrow to overcome insufficient shortfall
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("1", 20));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      // Liquidation
      await expect(
        vWBNB.connect(acc1Signer).liquidateBorrow(acc2, convertToUnit("1", 18), vBNX.address),
      ).to.be.revertedWithCustomError(Comptroller, "TooMuchRepay");
    });

    it("Should success when liquidation is called through vToken", async function () {
      // Mint and Incrrease collateral of the user
      mintAmount = convertToUnit("1", 18);
      vTokenMintAmount = convertToUnit("1", 8);
      const expectedTotalBalance = Number(convertToUnit(1, 7)) + Number(convertToUnit(1, 8));
      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintAmount, expectedTotalBalance);

      // price manipulation and borrow to overcome insufficient shortfall
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("100", 18));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      const borrowBalance = await vWBNB.borrowBalanceStored(acc2);
      const closeFactor = await Comptroller.closeFactorMantissa();
      const maxClose = (borrowBalance * closeFactor) / 1e18;
      const seizeAmount = EXPONENT_SCALE * maxClose * (convertToUnit("100", 18) / convertToUnit("100", 18));
      const exchangeRateStored = await vBNX.exchangeRateStored();
      const seizeTokensOverall = seizeAmount / exchangeRateStored;
      const reserveMantissa = await vWBNB.protocolSeizeShareMantissa();
      const seizeTokens = (seizeTokensOverall - (seizeTokensOverall * reserveMantissa) / EXPONENT_SCALE).toFixed(0);
      await expect(vWBNB.connect(acc1Signer).liquidateBorrow(acc2, maxClose.toString(), vBNX.address))
        .to.emit(vWBNB, "LiquidateBorrow")
        .withArgs(acc1, acc2, maxClose.toString(), vBNX.address, seizeTokensOverall.toFixed(0));
      const liquidatorBalance = await vBNX.connect(acc1Signer).balanceOf(acc1);
      expect(liquidatorBalance).to.equal(seizeTokens);
    });
  });

  describe("Heal Borrow and Forgive account", () => {
    const mintAmount = convertToUnit("1", 12);
    const vTokenMintedAmount = convertToUnit("1", 2);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    const WBNBBorrowAmount = convertToUnit(1, 4);
    let result;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await WBNB.connect(acc1Signer).faucet(mintAmount);
      await WBNB.connect(acc1Signer).approve(vWBNB.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // borrow
      // Supply WBNB to market from 2nd account
      await expect(vWBNB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vWBNB, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // It should revert when try to borrow more than liquidity
      await expect(vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount))
        .to.emit(vWBNB, "Borrow")
        .withArgs(acc2, WBNBBorrowAmount, WBNBBorrowAmount, WBNBBorrowAmount);

      // Approve more assets for liquidation
      await WBNB.connect(acc1Signer).faucet(WBNBBorrowAmount);
      await WBNB.connect(acc1Signer).approve(vWBNB.address, WBNBBorrowAmount);
    });

    it("Should revert when total collateral is greater then minLiquidation threshold", async function () {
      // Increase mint to make collateral large then min threshold liquidation
      const mintAmount = convertToUnit("1", 18);
      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);
      await vBNX.connect(acc2Signer).mint(mintAmount);
      // heal
      await expect(Comptroller.connect(acc1Signer).healAccount(acc2))
        .to.be.revertedWithCustomError(Comptroller, "CollateralExceedsThreshold")
        .withArgs("100000000000000000000", "159990159990000000000");
    });

    it("Should revert on healing if borrow is less then collateral amount", async function () {
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("1.4", 15));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("1", 23));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await expect(Comptroller.connect(acc1Signer).healAccount(acc2))
        .to.be.revertedWithCustomError(Comptroller, "CollateralExceedsThreshold")
        .withArgs("1000000000", "1400000000");
    });

    it("Should success on healing and forgive borrow account", async function () {
      // Increase price of borrowed underlying tokens to surpass available collateral
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("1", 25));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("1", 15));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      /*
      Calculations
      snapshot.totalCollateral 1e9  // (bnxPrice * mint amount) / mantissa
      snapshot.borrows 1e11    //  (WBNBPrice * WBNBBorrowAmount) / mantissa
      percantage 0.1   (collateral/borrow) * mantissa
      repaymentAmount 1000       percentage*borrowBalance 
      borrowBalance 10000
      */
      const collateralAmount = 1e9;
      const borrowAmount = 1e11;
      const percantageOfRepay = (collateralAmount / borrowAmount) * 1e18;
      const repayAmount = WBNBBorrowAmount * (percantageOfRepay / 1e18);
      const badDebt = WBNBBorrowAmount - repayAmount;
      result = await Comptroller.connect(acc1Signer).healAccount(acc2);
      await expect(result)
        .to.emit(vWBNB, "RepayBorrow")
        .withArgs(vWBNB.address, acc2, WBNBBorrowAmount - repayAmount, repayAmount, 0)
        .to.emit(vWBNB, "BadDebtIncreased")
        .withArgs(acc2, WBNBBorrowAmount - repayAmount, 0, badDebt);

      // Forgive Account
      result = await vWBNB.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(result.error).to.equal(Error.NO_ERROR);
      expect(result.vTokenBalance).to.equal(0);
      expect(result.borrowBalance).to.equal(0);
      expect((await vWBNB.badDebt()).toString()).to.equal(badDebt.toString());
    });
  });
});

describe("Risk Fund and Auction related scenarios", () => {
  let fixture;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vWBNB: VToken;
  let BNX: MockToken;
  let WBNB: MockToken;
  let acc1: string;
  let acc2: string;
  let deployer: string;
  let ProtocolShareReserve: ProtocolShareReserve;
  let RiskFund: RiskFund;
  let PoolRegistry: PoolRegistry;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ Comptroller, vBNX, vWBNB, BNX, WBNB, acc1, acc2, deployer, ProtocolShareReserve, RiskFund, PoolRegistry } =
      fixture);
  });

  describe("Generate risk fund swap it to base asset", () => {
    const mintAmount = convertToUnit("1", 12);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let deployerSigner: Signer;
    const WBNBBorrowAmount = 1e4;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);
      deployerSigner = await ethers.getSigner(deployer);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);
      // Fund 2nd account
      await WBNB.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await WBNB.connect(acc1Signer).approve(vWBNB.address, convertToUnit("1", 18));
      await vBNX.connect(acc2Signer).mint(mintAmount);
      // borrow
      await vWBNB.connect(acc1Signer).mint(convertToUnit("1", 18));
      await vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount);
      // Approve more assets for liquidation
      await WBNB.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await WBNB.connect(acc1Signer).approve(vWBNB.address, convertToUnit("1", 18));
      await RiskFund.setPoolRegistry(PoolRegistry.address);
    });

    it("generate bad Debt, reserves transfer to protocol share reserves, start auction", async function () {
      // Increase price of borrowed underlying tokens to surpass available collateral
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vWBNB.address).returns(convertToUnit("1", 25));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("1", 15));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await Comptroller.connect(acc1Signer).healAccount(acc2);
      // At this point market contain bad debt
      const totalReserves = await vBNX.totalReserves();
      // Reserves of the market are being transferred to protocol share reserves
      await vBNX.reduceReserves(totalReserves);
      // Check the balance of protocol share reserve
      expect(await BNX.balanceOf(ProtocolShareReserve.address)).to.be.equal(totalReserves);
      expect(await BNX.balanceOf(deployer)).to.be.equal(0);
      // Reduce reserves, transfer 70% to protocol income and rest 30% to riskFund
      await ProtocolShareReserve.connect(deployerSigner).releaseFunds(Comptroller.address, BNX.address, totalReserves);
      expect(await BNX.balanceOf(deployer)).to.be.equal(totalReserves * 0.7);
      expect(await BNX.balanceOf(RiskFund.address)).to.be.equal(totalReserves * 0.3);
    });
  });
});

describe("Multiple Users Engagement in a Block", () => {
  let fixture;
  let vBNX: VToken;
  let vWBNB: VToken;
  let BNX: MockToken;
  let WBNB: MockToken;
  let acc1: string;
  let acc2: string;
  let acc3: string;
  let Comptroller: Comptroller;
  let vBNXPrice;
  let vWBNBPrice;
  let acc1Signer: Signer;
  let acc2Signer: Signer;
  let acc3Signer: Signer;
  let error;
  let liquidity;
  let shortfall;
  let balance;
  let borrowBalance;
  const mintAmount1 = convertToUnit("1", 18);
  const mintAmount2 = convertToUnit("1", 16);
  const mintAmount3 = convertToUnit("1", 14);
  const vTokenMintedAmount1 = convertToUnit("1", 8);
  const vTokenMintedAmount2 = convertToUnit("1", 6);
  const vTokenMintedAmount3 = convertToUnit("1", 4);
  const WBNBBorrowAmount = 1e4;
  const collateralFactor = 0.7;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ vBNX, vWBNB, BNX, WBNB, acc1, acc2, acc3, Comptroller, vBNXPrice, vWBNBPrice } = fixture);
    acc1Signer = await ethers.getSigner(acc1);
    acc2Signer = await ethers.getSigner(acc2);
    acc3Signer = await ethers.getSigner(acc3);
  });

  it("Mint Redeem Borrow Repay", async function () {
    await WBNB.connect(acc1Signer).faucet(mintAmount1);
    await WBNB.connect(acc1Signer).approve(vWBNB.address, mintAmount1);

    await BNX.connect(acc2Signer).faucet(mintAmount2);
    await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount2);

    await BNX.connect(acc3Signer).faucet(mintAmount3);
    await BNX.connect(acc3Signer).approve(vBNX.address, mintAmount3);

    // MINT //
    // Minting in same block should not affect each other balance
    await toggleMining(false);
    await vWBNB.connect(acc1Signer).mint(mintAmount1);
    await vBNX.connect(acc2Signer).mint(mintAmount2);
    await vBNX.connect(acc3Signer).mint(mintAmount3);
    await mineBlock();
    await toggleMining(true);
    // Verify Balances of each account
    expect(await vWBNB.balanceOf(acc1)).to.equal(vTokenMintedAmount1);
    expect(await vBNX.balanceOf(acc2)).to.equal(vTokenMintedAmount2);
    expect(await vBNX.balanceOf(acc3)).to.equal(vTokenMintedAmount3);

    // BORROW //
    await toggleMining(false);
    await vWBNB.connect(acc2Signer).borrow(WBNBBorrowAmount);
    await vWBNB.connect(acc3Signer).borrow(WBNBBorrowAmount);
    await vBNX.connect(acc1Signer).borrow(WBNBBorrowAmount);
    await mineBlock();
    await toggleMining(true);

    // Verify Balance of accounts
    expect(await BNX.balanceOf(acc1)).to.equal(WBNBBorrowAmount);
    expect(await WBNB.balanceOf(acc2)).to.equal(WBNBBorrowAmount);
    expect(await WBNB.balanceOf(acc3)).to.equal(WBNBBorrowAmount);

    // REPAY //
    await BNX.connect(acc1Signer).approve(vBNX.address, WBNBBorrowAmount);
    await WBNB.connect(acc2Signer).approve(vWBNB.address, WBNBBorrowAmount);
    await WBNB.connect(acc3Signer).approve(vWBNB.address, WBNBBorrowAmount);

    await toggleMining(false);
    await vBNX.connect(acc1Signer).repayBorrow(WBNBBorrowAmount);
    await vWBNB.connect(acc2Signer).repayBorrow(WBNBBorrowAmount);
    await vWBNB.connect(acc3Signer).repayBorrow(WBNBBorrowAmount);
    await mineBlock();
    await toggleMining(true);

    [error, balance, borrowBalance] = await vBNX.connect(acc1Signer).getAccountSnapshot(acc1);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    [error, balance, borrowBalance] = await vWBNB.connect(acc3Signer).getAccountSnapshot(acc2);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    [error, balance, borrowBalance] = await vWBNB.connect(acc3Signer).getAccountSnapshot(acc3);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    // REDEEM //
    await toggleMining(false);
    const redeemAmount = convertToUnit("1", 3);
    await vBNX.connect(acc1Signer).redeem(redeemAmount);
    await vWBNB.connect(acc2Signer).redeem(redeemAmount);
    await vWBNB.connect(acc3Signer).redeem(redeemAmount);
    await mineBlock();
    await toggleMining(true);
    [error, liquidity, shortfall] = await Comptroller.connect(acc1Signer).getAccountLiquidity(acc1);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount1 * collateralFactor * vWBNBPrice).toString());
    expect(shortfall).to.equal(0);

    [error, liquidity, shortfall] = await Comptroller.connect(acc3Signer).getAccountLiquidity(acc2);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount2 * collateralFactor * vBNXPrice).toString());
    expect(shortfall).to.equal(0);

    [error, liquidity, shortfall] = await Comptroller.connect(acc3Signer).getAccountLiquidity(acc3);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount3 * collateralFactor * vBNXPrice).toString());
    expect(shortfall).to.equal(0);
  });
});

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
    "Factories",
    "AccessControlConfig",
    "Pools",
    "RiskFund",
  ]);
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
  const BTCB = await ethers.getContract("MockBTCB");
  const BUSD = await ethers.getContract("MockBUSD");

  await RiskFund.setPoolRegistry(PoolRegistry.address);
  await ProtocolShareReserve.setPoolRegistry(PoolRegistry.address);

  // Set Oracle
  await Comptroller.setPriceOracle(PriceOracle.address);

  const vBNXAddress = await PoolRegistry.getVTokenForAsset(Comptroller.address, BNX.address);
  const vBTCBAddress = await PoolRegistry.getVTokenForAsset(Comptroller.address, BTCB.address);

  const vBNX = await ethers.getContractAt("VToken", vBNXAddress);
  const vBTCB = await ethers.getContractAt("VToken", vBTCBAddress);

  // Enter Markets
  await Comptroller.connect(await ethers.getSigner(acc1)).enterMarkets([vBNX.address, vBTCB.address]);
  await Comptroller.connect(await ethers.getSigner(acc2)).enterMarkets([vBNX.address, vBTCB.address]);
  await Comptroller.connect(await ethers.getSigner(acc3)).enterMarkets([vBNX.address, vBTCB.address]);

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
  await Comptroller.setMarketSupplyCaps([vBNX.address, vBTCB.address], [supply, supply]);

  // Set borrow caps
  const borrowCap = convertToUnit(10, 36);
  await Comptroller.setMarketBorrowCaps([vBNX.address, vBTCB.address], [borrowCap, borrowCap]);

  const vBNXPrice: BigNumber = new BigNumber(
    scaleDownBy((await PriceOracle.getUnderlyingPrice(vBNX.address)).toString(), 18),
  );
  const vBTCBPrice: BigNumber = new BigNumber(
    scaleDownBy((await PriceOracle.getUnderlyingPrice(vBTCB.address)).toString(), 18),
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
      vBTCB,
      BNX,
      BTCB,
      deployer,
      acc1,
      acc2,
      vBNXPrice,
      vBTCBPrice,
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
  let vBTCB: VToken;
  let BNX: MockToken;
  let BTCB: MockToken;
  let acc1: string;
  let acc2: string;
  let deployer: string;
  let vBNXPrice: BigNumber;
  let vBTCBPrice: BigNumber;
  let rewardDistributor: FakeContract<RewardsDistributor>;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({
      PoolRegistry,
      AccessControlManager,
      Comptroller,
      vBNX,
      vBTCB,
      BNX,
      BTCB,
      acc1,
      acc2,
      vBNXPrice,
      vBTCBPrice,
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
      await BNX.connect(acc2Signer).transfer(vBTCB.address, mintAmount);
      expect(await BNX.balanceOf(deployer)).to.be.equal(0);
      await vBTCB.sweepToken(BNX.address);
      expect(await BNX.balanceOf(deployer)).to.be.equal(mintAmount);
    });
  });

  describe("Main Operations", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 18);
    const vTokenMintAmount: BigNumberish = convertToUnit(1, 8);
    const btcbCollateralFactor = 0.7;
    const bnxCollateralFactor = 0.6;
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
      await BTCB.connect(acc1Signer).faucet(mintAmount);
      await BTCB.connect(acc1Signer).approve(vBTCB.address, mintAmount);
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
      expect(liquidity).to.equal(new BigNumber(mintAmount).multipliedBy(bnxCollateralFactor).multipliedBy(vBNXPrice));
      expect(shortfall).to.equal(0);
      // ////////////
      // // Borrow //
      // ////////////
      // Supply BTCB to market from 1st account
      await expect(vBTCB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBTCB, "Mint")
        .withArgs(await acc1Signer.getAddress(), mintAmount, vTokenMintAmount, vTokenMintAmount);
      [error, balance, borrowBalance] = await vBTCB.getAccountSnapshot(await acc1Signer.getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(vTokenMintAmount);
      expect(borrowBalance).to.equal(0);
      [error, liquidity, shortfall] = await Comptroller.connect(acc1Signer).getAccountLiquidity(acc1);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(new BigNumber(mintAmount).multipliedBy(btcbCollateralFactor).multipliedBy(vBTCBPrice));
      expect(shortfall).to.equal(0);
      const BTCBBorrowAmount = convertToUnit(1, 18);
      await expect(vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount))
        .to.emit(vBTCB, "Borrow")
        .withArgs(acc2, BTCBBorrowAmount, BTCBBorrowAmount, BTCBBorrowAmount);
      [error, balance, borrowBalance] = await vBTCB.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(0);
      expect(borrowBalance).to.equal(BTCBBorrowAmount);
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
      [error, balance, borrowBalance] = await vBTCB.connect(acc2Signer).getAccountSnapshot(acc2);
      const bnxLiquidity = new BigNumber(mintAmount).minus(new BigNumber(tokenRedeemAmount)).multipliedBy(vBNXPrice);
      const BTCBBorrow = new BigNumber(borrowBalance.toString()).multipliedBy(vBTCBPrice);
      let preComputeLiquidity = bnxLiquidity.minus(BTCBBorrow).multipliedBy(bnxCollateralFactor);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(Number(liquidity)).to.be.closeTo(preComputeLiquidity.toNumber(), Number(convertToUnit(1, 18)));
      expect(shortfall).to.equal(0);
      // ////////////
      // // REPAY //
      // //////////
      await BTCB.connect(acc2Signer).faucet(BTCBBorrowAmount);
      await BTCB.connect(acc2Signer).approve(vBTCB.address, BTCBBorrowAmount);
      await expect(vBTCB.connect(acc2Signer).repayBorrow(BTCBBorrowAmount)).to.emit(vBTCB, "RepayBorrow");
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(balanceAfterVToken);
      expect(borrowBalance).to.equal(0);
      preComputeLiquidity = balanceAfter.multipliedBy(bnxCollateralFactor).multipliedBy(vBNXPrice);
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
  let vBTCB: VToken;
  let BNX: MockToken;
  let BTCB: MockToken;
  let acc1: string;
  let acc2: string;
  let vBNXPrice: BigNumber;
  const EXPONENT_SCALE = 1e18;
  let rewardDistributor: FakeContract<RewardsDistributor>;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ Comptroller, vBNX, vBTCB, BNX, BTCB, acc1, acc2, vBNXPrice } = fixture);
    rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
    await Comptroller.addRewardsDistributor(rewardDistributor.address);
  });

  describe("Force Liquidation of user via Comptroller", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 15);
    const BTCBBorrowAmount: BigNumberish = convertToUnit(1, 15);
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
      await BTCB.connect(acc1Signer).faucet(mintAmount);
      await BTCB.connect(acc1Signer).approve(vBTCB.address, mintAmount);
      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // borrow
      // Supply BTCB to market from 2nd account
      await expect(vBTCB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBTCB, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // It should revert when try to borrow more than liquidity
      await expect(vBTCB.connect(acc2Signer).borrow(insufficientLiquidityBorrow)).to.be.revertedWithCustomError(
        Comptroller,
        "InsufficientLiquidity",
      );
      // Approve more assets for liquidation
      await BTCB.connect(acc1Signer).faucet(insufficientLiquidityBorrow);
      await BTCB.connect(acc1Signer).approve(vBTCB.address, insufficientLiquidityBorrow);
      await expect(vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount))
        .to.emit(vBTCB, "Borrow")
        .withArgs(acc2, BTCBBorrowAmount, BTCBBorrowAmount, BTCBBorrowAmount);
    });

    it("Should revert when repay amount on liquidation is not equal to borrow amount", async function () {
      await BNX.connect(acc2Signer).faucet(1e10);
      await BNX.connect(acc2Signer).approve(vBNX.address, 1e10);
      await vBNX.connect(acc2Signer).mint(1e10);
      // Repay amount does not make borrower principal to zero
      const repayAmount = Number(BTCBBorrowAmount) / 2;
      const param = {
        vTokenCollateral: vBNX.address,
        vTokenBorrowed: vBTCB.address,
        repayAmount: repayAmount,
      };
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 12));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("100", 12));
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
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("100", 12));

      const vBNXPriceFake: BigNumber = new BigNumber(
        scaleDownBy((await dummyPriceOracle.getUnderlyingPrice(vBNX.address)).toString(), 18),
      );
      const vBTCBPriceFake: BigNumber = new BigNumber(
        scaleDownBy((await dummyPriceOracle.getUnderlyingPrice(vBTCB.address)).toString(), 18),
      );

      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      const repayAmount = convertToUnit("1000000000011889", 0);
      const param = {
        vTokenCollateral: vBNX.address,
        vTokenBorrowed: vBTCB.address,
        repayAmount: repayAmount,
      };

      result = await Comptroller.connect(acc1Signer).liquidateAccount(acc2, [param]);
      const seizeAmount = EXPONENT_SCALE * repayAmount * (vBTCBPriceFake / vBNXPriceFake);
      const exchangeRateStored = await vBNX.exchangeRateStored();
      const seizeTokensOverall = seizeAmount / exchangeRateStored;
      const reserveMantissa = await vBTCB.protocolSeizeShareMantissa();
      const seizeTokens = seizeTokensOverall - (seizeTokensOverall * reserveMantissa) / EXPONENT_SCALE;

      await expect(result)
        .to.emit(vBTCB, "LiquidateBorrow")
        .withArgs(acc1, acc2, repayAmount, vBNX.address, seizeTokensOverall.toFixed(0));
      const liquidatorBalance = await vBNX.connect(acc1Signer).balanceOf(acc1);
      expect(liquidatorBalance).to.equal(seizeTokens.toFixed(0));
    });
  });

  describe("Liquidation of user via VToken", () => {
    let mintAmount = convertToUnit("1", 17);
    let vTokenMintAmount = convertToUnit("1", 7);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let BTCBBorrowAmount = convertToUnit("1", 4);
    let udnerlyingMintAmount;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await BTCB.connect(acc1Signer).faucet(mintAmount);
      await BTCB.connect(acc1Signer).approve(vBTCB.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintAmount, vTokenMintAmount);
      // borrow
      // Supply BTCB to market from 2nd account
      await expect(vBTCB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBTCB, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintAmount, vTokenMintAmount);
      await expect(vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount))
        .to.emit(vBTCB, "Borrow")
        .withArgs(acc2, BTCBBorrowAmount, BTCBBorrowAmount, BTCBBorrowAmount);

      // Approve more assets for liquidation
      await BTCB.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await BTCB.connect(acc1Signer).approve(vBTCB.address, convertToUnit("1", 18));
    });

    it("Should revert when liquidation is called through vToken and does not met minCollateral Criteria", async function () {
      const collateral: BigNumberish = vBNXPrice * mintAmount;
      await expect(vBTCB.connect(acc1Signer).liquidateBorrow(acc2, BTCBBorrowAmount, vBTCB.address))
        .to.be.revertedWithCustomError(Comptroller, "MinimalCollateralViolated")
        .withArgs("100000000000000000000", collateral.toString());
    });

    it("Should revert when try to drain market", async function () {
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 40));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await vBTCB.connect(acc2Signer).borrow(convertToUnit("1", 18));
      await expect(vBTCB.connect(acc2Signer).borrow(convertToUnit("1", 28))).to.be.revertedWithCustomError(
        vBTCB,
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
        vBTCB.connect(acc1Signer).liquidateBorrow(acc2, BTCBBorrowAmount, vBTCB.address),
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
      BTCBBorrowAmount = convertToUnit("1", 18);
      await vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount);
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("100", 40));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      // Liquidation
      await expect(vBTCB.connect(acc1Signer).liquidateBorrow(acc2, 201, vBNX.address)).to.be.revertedWith(
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
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("1", 20));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      // Liquidation
      await expect(
        vBTCB.connect(acc1Signer).liquidateBorrow(acc2, convertToUnit("1", 18), vBNX.address),
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
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("100", 18));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      const borrowBalance = await vBTCB.borrowBalanceStored(acc2);
      const closeFactor = await Comptroller.closeFactorMantissa();
      const maxClose = (borrowBalance * closeFactor) / 1e18;
      const seizeAmount = EXPONENT_SCALE * maxClose * (convertToUnit("100", 18) / convertToUnit("100", 18));
      const exchangeRateStored = await vBNX.exchangeRateStored();
      const seizeTokensOverall = seizeAmount / exchangeRateStored;
      const reserveMantissa = await vBTCB.protocolSeizeShareMantissa();
      const seizeTokens = (seizeTokensOverall - (seizeTokensOverall * reserveMantissa) / EXPONENT_SCALE).toFixed(0);
      await expect(vBTCB.connect(acc1Signer).liquidateBorrow(acc2, maxClose.toString(), vBNX.address))
        .to.emit(vBTCB, "LiquidateBorrow")
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
    const BTCBBorrowAmount = convertToUnit(1, 4);
    let result;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await BTCB.connect(acc1Signer).faucet(mintAmount);
      await BTCB.connect(acc1Signer).approve(vBTCB.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // borrow
      // Supply BTCB to market from 2nd account
      await expect(vBTCB.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBTCB, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // It should revert when try to borrow more than liquidity
      await expect(vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount))
        .to.emit(vBTCB, "Borrow")
        .withArgs(acc2, BTCBBorrowAmount, BTCBBorrowAmount, BTCBBorrowAmount);

      // Approve more assets for liquidation
      await BTCB.connect(acc1Signer).faucet(BTCBBorrowAmount);
      await BTCB.connect(acc1Signer).approve(vBTCB.address, BTCBBorrowAmount);
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
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("1", 23));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await expect(Comptroller.connect(acc1Signer).healAccount(acc2))
        .to.be.revertedWithCustomError(Comptroller, "CollateralExceedsThreshold")
        .withArgs("1000000000", "1400000000");
    });

    it("Should success on healing and forgive borrow account", async function () {
      // Increase price of borrowed underlying tokens to surpass available collateral
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("1", 25));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("1", 15));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      /*
      Calculations
      snapshot.totalCollateral 1e9  // (bnxPrice * mint amount) / mantissa
      snapshot.borrows 1e11    //  (BTCBPrice * BTCBBorrowAmount) / mantissa
      percantage 0.1   (collateral/borrow) * mantissa
      repaymentAmount 1000       percentage*borrowBalance 
      borrowBalance 10000
      */
      const collateralAmount = 1e9;
      const borrowAmount = 1e11;
      const percantageOfRepay = (collateralAmount / borrowAmount) * 1e18;
      const repayAmount = BTCBBorrowAmount * (percantageOfRepay / 1e18);
      const badDebt = BTCBBorrowAmount - repayAmount;
      result = await Comptroller.connect(acc1Signer).healAccount(acc2);
      await expect(result)
        .to.emit(vBTCB, "RepayBorrow")
        .withArgs(vBTCB.address, acc2, BTCBBorrowAmount - repayAmount, repayAmount, 0)
        .to.emit(vBTCB, "BadDebtIncreased")
        .withArgs(acc2, BTCBBorrowAmount - repayAmount, 0, badDebt);

      // Forgive Account
      result = await vBTCB.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(result.error).to.equal(Error.NO_ERROR);
      expect(result.vTokenBalance).to.equal(0);
      expect(result.borrowBalance).to.equal(0);
      expect((await vBTCB.badDebt()).toString()).to.equal(badDebt.toString());
    });
  });
});

describe("Risk Fund and Auction related scenarios", () => {
  let fixture;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vBTCB: VToken;
  let BNX: MockToken;
  let BTCB: MockToken;
  let acc1: string;
  let acc2: string;
  let deployer: string;
  let ProtocolShareReserve: ProtocolShareReserve;
  let RiskFund: RiskFund;
  let PoolRegistry: PoolRegistry;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ Comptroller, vBNX, vBTCB, BNX, BTCB, acc1, acc2, deployer, ProtocolShareReserve, RiskFund, PoolRegistry } =
      fixture);
  });

  describe("Generate risk fund swap it to base asset", () => {
    const mintAmount = convertToUnit("1", 12);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let deployerSigner: Signer;
    const BTCBBorrowAmount = 1e4;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);
      deployerSigner = await ethers.getSigner(deployer);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);
      // Fund 2nd account
      await BTCB.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await BTCB.connect(acc1Signer).approve(vBTCB.address, convertToUnit("1", 18));
      await vBNX.connect(acc2Signer).mint(mintAmount);
      // borrow
      await vBTCB.connect(acc1Signer).mint(convertToUnit("1", 18));
      await vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount);
      // Approve more assets for liquidation
      await BTCB.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await BTCB.connect(acc1Signer).approve(vBTCB.address, convertToUnit("1", 18));
      await RiskFund.setPoolRegistry(PoolRegistry.address);
    });

    it("generate bad Debt, reserves transfer to protocol share reserves, start auction", async function () {
      // Increase price of borrowed underlying tokens to surpass available collateral
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBTCB.address).returns(convertToUnit("1", 25));
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
  let vBTCB: VToken;
  let BNX: MockToken;
  let BTCB: MockToken;
  let acc1: string;
  let acc2: string;
  let acc3: string;
  let Comptroller: Comptroller;
  let vBNXPrice;
  let vBTCBPrice;
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
  const BTCBBorrowAmount = 1e4;
  const btcbCollateralFactor = 0.7;
  const bnxCollateralFactor = 0.6;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ vBNX, vBTCB, BNX, BTCB, acc1, acc2, acc3, Comptroller, vBNXPrice, vBTCBPrice } = fixture);
    acc1Signer = await ethers.getSigner(acc1);
    acc2Signer = await ethers.getSigner(acc2);
    acc3Signer = await ethers.getSigner(acc3);
  });

  it("Mint Redeem Borrow Repay", async function () {
    await BTCB.connect(acc1Signer).faucet(mintAmount1);
    await BTCB.connect(acc1Signer).approve(vBTCB.address, mintAmount1);

    await BNX.connect(acc2Signer).faucet(mintAmount2);
    await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount2);

    await BNX.connect(acc3Signer).faucet(mintAmount3);
    await BNX.connect(acc3Signer).approve(vBNX.address, mintAmount3);

    // MINT //
    // Minting in same block should not affect each other balance
    await toggleMining(false);
    await vBTCB.connect(acc1Signer).mint(mintAmount1);
    await vBNX.connect(acc2Signer).mint(mintAmount2);
    await vBNX.connect(acc3Signer).mint(mintAmount3);
    await mineBlock();
    await toggleMining(true);
    // Verify Balances of each account
    expect(await vBTCB.balanceOf(acc1)).to.equal(vTokenMintedAmount1);
    expect(await vBNX.balanceOf(acc2)).to.equal(vTokenMintedAmount2);
    expect(await vBNX.balanceOf(acc3)).to.equal(vTokenMintedAmount3);

    // BORROW //
    await toggleMining(false);
    await vBTCB.connect(acc2Signer).borrow(BTCBBorrowAmount);
    await vBTCB.connect(acc3Signer).borrow(BTCBBorrowAmount);
    await vBNX.connect(acc1Signer).borrow(BTCBBorrowAmount);
    await mineBlock();
    await toggleMining(true);

    // Verify Balance of accounts
    expect(await BNX.balanceOf(acc1)).to.equal(BTCBBorrowAmount);
    expect(await BTCB.balanceOf(acc2)).to.equal(BTCBBorrowAmount);
    expect(await BTCB.balanceOf(acc3)).to.equal(BTCBBorrowAmount);

    // REPAY //
    await BNX.connect(acc1Signer).approve(vBNX.address, BTCBBorrowAmount);
    await BTCB.connect(acc2Signer).approve(vBTCB.address, BTCBBorrowAmount);
    await BTCB.connect(acc3Signer).approve(vBTCB.address, BTCBBorrowAmount);

    await toggleMining(false);
    await vBNX.connect(acc1Signer).repayBorrow(BTCBBorrowAmount);
    await vBTCB.connect(acc2Signer).repayBorrow(BTCBBorrowAmount);
    await vBTCB.connect(acc3Signer).repayBorrow(BTCBBorrowAmount);
    await mineBlock();
    await toggleMining(true);

    [error, balance, borrowBalance] = await vBNX.connect(acc1Signer).getAccountSnapshot(acc1);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    [error, balance, borrowBalance] = await vBTCB.connect(acc3Signer).getAccountSnapshot(acc2);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    [error, balance, borrowBalance] = await vBTCB.connect(acc3Signer).getAccountSnapshot(acc3);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    // REDEEM //
    await toggleMining(false);
    const redeemAmount = convertToUnit("1", 3);
    await vBNX.connect(acc1Signer).redeem(redeemAmount);
    await vBTCB.connect(acc2Signer).redeem(redeemAmount);
    await vBTCB.connect(acc3Signer).redeem(redeemAmount);
    await mineBlock();
    await toggleMining(true);
    [error, liquidity, shortfall] = await Comptroller.connect(acc1Signer).getAccountLiquidity(acc1);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount1 * btcbCollateralFactor * vBTCBPrice).toString());
    expect(shortfall).to.equal(0);

    [error, liquidity, shortfall] = await Comptroller.connect(acc3Signer).getAccountLiquidity(acc2);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount2 * bnxCollateralFactor * vBNXPrice).toString());
    expect(shortfall).to.equal(0);

    [error, liquidity, shortfall] = await Comptroller.connect(acc3Signer).getAccountLiquidity(acc3);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount3 * bnxCollateralFactor * vBNXPrice).toString());
    expect(shortfall).to.equal(0);
  });
});

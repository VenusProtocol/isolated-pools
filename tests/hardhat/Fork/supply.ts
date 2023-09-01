import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  MockPriceOracle,
  MockPriceOracle__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORKING = process.env.FORKING === "true";
let network = process.env.NETWORK_NAME;
if (network == "") network = "bsc";

const {
  ACM,
  ACC1,
  ACC2,
  ACC3,
  ADMIN,
  TOKEN1,
  VTOKEN1,
  TOKEN2,
  VTOKEN2,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  COMPTROLLER,
  BLOCK_NUMBER,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
} = getContractAddresses(network as string);

const AddressZero = "0x0000000000000000000000000000000000000000";

let impersonatedTimelock: Signer;
let impersonatedOracleOwner: Signer;
let accessControlManager: AccessControlManager;
let priceOracle: ChainlinkOracle;
let comptroller: Comptroller;
let vTOKEN1: VToken;
let vTOKEN2: VToken;
let token1: IERC20;
let token2: IERC20;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let token1Holder: string;
let token2Holder: string;
let resilientOracle: MockPriceOracle;

const blocksToMine: number = 300000;
const TOKEN2BorrowAmount = convertToUnit("1", 17);

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
  impersonatedOracleOwner = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

async function configureVToken(vTokenAddress: string) {
  return VToken__factory.connect(vTokenAddress, impersonatedTimelock);
}

async function grantPermissions() {
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMarketSupplyCaps(address[],uint256[])", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMarketBorrowCaps(address[],uint256[])", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(CHAINLINK_ORACLE, "setDirectPrice(address,uint256)", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMinLiquidatableCollateral(uint256)", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setCollateralFactor(address,uint256,uint256)", ADMIN);
}

if (FORKING) {
  describe("Supply fork tests", async () => {
    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();
      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(ACC3, ethers.utils.parseUnits("2"));
      token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));
      token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));
      token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      token1 = IERC20__factory.connect(TOKEN1, impersonatedTimelock);
      vTOKEN2 = await configureVToken(VTOKEN2);
      vTOKEN1 = await configureVToken(VTOKEN1);

      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      priceOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedOracleOwner);

      const tupleForToken2 = {
        asset: TOKEN2,
        oracles: [CHAINLINK_ORACLE, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      const tupleForToken1 = {
        asset: TOKEN1,
        oracles: [CHAINLINK_ORACLE, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      if (network == "bsctestnet") {
        resilientOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);
        await resilientOracle.setTokenConfig(tupleForToken2);
      } else if (network == "bsc") {
        resilientOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);
        await resilientOracle.setTokenConfig(tupleForToken2);
        await resilientOracle.setTokenConfig(tupleForToken1);
        await priceOracle.setDirectPrice(token1.address, convertToUnit("1", 18));
      }

      await grantPermissions();

      await comptroller.setMarketSupplyCaps(
        [vTOKEN2.address, vTOKEN1.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vTOKEN2.address, vTOKEN1.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN2.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN2.address, vTOKEN1.address]);
      await comptroller.connect(acc3Signer).enterMarkets([vTOKEN1.address]);
    }

    beforeEach(async () => {
      await setup();
      await priceOracle.setDirectPrice(token2.address, convertToUnit("1", 15));
    });

    const calculateExchangeRate = async () => {
      const cash = await vTOKEN2.getCash();
      const borrows = await vTOKEN2.totalBorrows();
      const badDebt = await vTOKEN2.badDebt();
      const reserves = await vTOKEN2.totalReserves();
      const supply = await vTOKEN2.totalSupply();

      if (Number(supply) == 0) {
        return await vTOKEN2.exchangeRateStored();
      }

      const exchangeRatecal = BigNumber.from(cash)
        .add(BigNumber.from(borrows))
        .add(BigNumber.from(badDebt))
        .sub(BigNumber.from(reserves))
        .mul(BigNumber.from(convertToUnit(1, 18)));

      return BigNumber.from(exchangeRatecal).div(BigNumber.from(supply));
    };

    const assertExchangeRate = async () => {
      await vTOKEN2.accrueInterest();
      const exchangeRate = await vTOKEN2.exchangeRateStored();
      const calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).equals(calculatedRate);
    };

    const assertRedeemAmount = async (accountBalance, balanceBefore) => {
      const balanceAfter = await token2.balanceOf(ACC1);
      const exchangeRate = await vTOKEN2.callStatic.exchangeRateCurrent();
      const expectedRedeemAmount = BigNumber.from(accountBalance)
        .mul(BigNumber.from(exchangeRate))
        .div(BigNumber.from(convertToUnit(1, 18)))
        .add(BigNumber.from(balanceBefore));
      expect(expectedRedeemAmount).closeTo(balanceAfter, 120);
    };

    it("Evolution of exchange rate", async () => {
      const mintAmount = convertToUnit("1", 18);
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();
      // Mint vTOKEN2 with first account(ACC1)
      await token2.connect(token2Holder).transfer(ACC1, convertToUnit(2, 18));
      await token2.connect(acc1Signer).approve(vTOKEN2.address, convertToUnit(2, 18));
      await expect(vTOKEN2.connect(acc1Signer).mint(convertToUnit(1, 18))).to.emit(vTOKEN2, "Mint");

      // Mining  3,00,000 blocks
      await mine(300000);

      // Assert current exchange rate
      await assertExchangeRate();

      // Set oracle price for TOKEN2
      await priceOracle.setDirectPrice(token2.address, convertToUnit("1", 15));

      let [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);

      // Mint vTOKEN1 with second account(ACC2)
      await token1.connect(token1Holder).transfer(ACC2, mintAmount);
      await token1.connect(acc2Signer).approve(vTOKEN1.address, mintAmount);
      await expect(vTOKEN1.connect(acc2Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");

      // Borrow TOKEN2 with second account(ACC2)
      await expect(vTOKEN2.connect(acc2Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");

      // Mine 300,000 blocks
      await mine(blocksToMine);

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      await token2.connect(acc2Signer).approve(vTOKEN2.address, convertToUnit(1, 18));

      await vTOKEN2.connect(acc2Signer).repayBorrow(TOKEN2BorrowAmount);

      // Mine 300,000 blocks
      await mine(blocksToMine);

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      // setup to liquidate the second account(ACC2) with first account(ACC1)
      await comptroller.setMinLiquidatableCollateral(0);
      const tuple1 = {
        asset: TOKEN2,
        feed: CHAINLINK_ORACLE,
        maxStalePeriod: "900000000000000000000000000000000000000000000000000000000000",
      };
      const tuple2 = {
        asset: TOKEN1,
        feed: CHAINLINK_ORACLE,
        maxStalePeriod: "900000000000000000000000000000000000000000000000000000000000",
      };
      await priceOracle.setTokenConfig(tuple1);
      await priceOracle.setTokenConfig(tuple2);

      await expect(vTOKEN2.connect(acc2Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      await priceOracle.setDirectPrice(token1.address, convertToUnit("1.05", 14));

      [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);

      expect(err).equals(0);
      expect(liquidity).equals(0);
      expect(shortfall).greaterThan(0);

      const borrowBalance = (await vTOKEN2.borrowBalanceStored(ACC2)).toString();
      const closeFactor = (await comptroller.closeFactorMantissa()).toString();
      const maxClose = BigInt(BigInt(borrowBalance) * BigInt(closeFactor)) / BigInt(2e18);
      let result = vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, maxClose, vTOKEN1.address);
      await expect(result).to.emit(vTOKEN2, "LiquidateBorrow");

      // Mine 300,000 blocks
      await mine(blocksToMine);

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      // Setup for healAccount(ACC2)

      await priceOracle.setDirectPrice(token1.address, convertToUnit(1, 10));
      await priceOracle.setDirectPrice(token2.address, convertToUnit(1, 18));

      const [err2, liquidity2, shortfall2] = await comptroller.getAccountLiquidity(ACC2);
      expect(err2).equals(0);
      expect(liquidity2).equals(0);
      expect(shortfall2).greaterThan(0);
      await comptroller.setMinLiquidatableCollateral(convertToUnit(1, 22));

      result = comptroller.connect(acc1Signer).healAccount(ACC2);
      await expect(result).to.emit(vTOKEN2, "RepayBorrow");

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      const totalBal = await vTOKEN2.balanceOf(ACC1);
      await expect(vTOKEN2.connect(acc1Signer).redeem(totalBal)).to.emit(vTOKEN2, "Redeem");

      // Mine 300,000 blocks
      await mine(blocksToMine);

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();
    });

    it("Three users Mint, one redeems", async () => {
      const mintAmount = convertToUnit("1", 18);
      // Mint vTOKEN2 with first account(ACC1)
      await token2.connect(token2Holder).transfer(ACC1, convertToUnit(2, 18));
      await token2.connect(acc1Signer).approve(vTOKEN2.address, convertToUnit(2, 18));
      await expect(vTOKEN2.connect(acc1Signer).mint(convertToUnit(1, 18))).to.emit(vTOKEN2, "Mint");

      // Mint vTOKEN2 with second account(ACC2)
      await token2.connect(token2Holder).transfer(ACC2, convertToUnit(2, 18));
      await token2.connect(acc2Signer).approve(vTOKEN2.address, convertToUnit(2, 18));
      await expect(vTOKEN2.connect(acc2Signer).mint(convertToUnit(1, 18))).to.emit(vTOKEN2, "Mint");

      // Mint vTOKEN1 with second account(ACC2)
      await token1.connect(token1Holder).transfer(ACC3, mintAmount);
      await token1.connect(acc3Signer).approve(vTOKEN1.address, mintAmount);
      await expect(vTOKEN1.connect(acc3Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");

      // Borrow TOKEN2 with third account(ACC3)
      await expect(vTOKEN2.connect(acc3Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");

      // Mine 300,000 blocks
      await mine(blocksToMine);

      // Partial redeem for first account(ACC1)
      let balanceBefore = await token2.balanceOf(ACC1);
      await vTOKEN2.connect(acc1Signer).redeem(convertToUnit(5, 7));

      // Assert undelying after partial redeem
      await assertRedeemAmount(convertToUnit(5, 7), balanceBefore);

      // Mine 300,000 blocks
      await mine(blocksToMine);

      // Complete redeem for first account(ACC1)
      const accountBalance = await vTOKEN2.balanceOf(ACC1);
      balanceBefore = await token2.balanceOf(ACC1);
      await vTOKEN2.connect(acc1Signer).redeem(accountBalance);

      // Assert undelying after complete redeem
      await assertRedeemAmount(accountBalance, balanceBefore);
    });
  });
}

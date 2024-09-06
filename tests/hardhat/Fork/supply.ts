import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, network, upgrades } from "hardhat";

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
  WrappedNative,
  WrappedNative__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, mineOnZksync, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const {
  ACM,
  ACC1,
  ACC2,
  ACC3,
  ADMIN,
  TOKEN1,
  TOKEN2,
  VTOKEN1,
  VTOKEN2,
  COMPTROLLER,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
  BLOCK_NUMBER,
} = getContractAddresses(FORKED_NETWORK as string);

const AddressZero = "0x0000000000000000000000000000000000000000";

let token1: IERC20 | WrappedNative;
let token2: IERC20;
let vTOKEN1: VToken;
let vTOKEN2: VToken;
let comptroller: Comptroller;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let token1Holder: Signer;
let token2Holder: Signer;
let impersonatedTimelock: Signer;
let resilientOracle: MockPriceOracle;
let chainlinkOracle: ChainlinkOracle;
let accessControlManager: AccessControlManager;

const blocksToMine: number = 30000;
const TOKEN2BorrowAmount = convertToUnit("1", 17);

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

async function grantPermissions() {
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(chainlinkOracle.address, "setDirectPrice(address,uint256)", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(chainlinkOracle.address, "setTokenConfig(TokenConfig)", ADMIN);
  await tx.wait();
}

if (FORK) {
  describe("Supply fork tests", async () => {
    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();
      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(ACC3, ethers.utils.parseUnits("2"));
      token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2000000"));
      token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2000000"));

      vTOKEN2 = VToken__factory.connect(VTOKEN2, impersonatedTimelock);
      vTOKEN1 = VToken__factory.connect(VTOKEN1, impersonatedTimelock);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      token1 = IERC20__factory.connect(TOKEN1, impersonatedTimelock);
      if (FORKED_NETWORK == "arbitrumsepolia" || FORKED_NETWORK == "arbitrumone" || FORKED_NETWORK == "zksyncsepolia") {
        token1 = WrappedNative__factory.connect(TOKEN1, impersonatedTimelock);
        await token1.connect(token1Holder).deposit({ value: convertToUnit("200000", 18) });
      }

      if (FORKED_NETWORK == "opbnbmainnet" || FORKED_NETWORK == "opbnbtestnet") {
        const chainlinkOracleFactory = await ethers.getContractFactory("ChainlinkOracle");
        chainlinkOracle = await upgrades.deployProxy(chainlinkOracleFactory, [ACM], { impersonatedTimelock });
      } else {
        chainlinkOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);
      }
      await grantPermissions();

      const tupleForToken2 = {
        asset: TOKEN2,
        oracles: [chainlinkOracle.address, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      const tupleForToken1 = {
        asset: TOKEN1,
        oracles: [chainlinkOracle.address, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      resilientOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);
      await resilientOracle.setTokenConfig(tupleForToken2);
      await resilientOracle.setTokenConfig(tupleForToken1);

      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1", 18));

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
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, convertToUnit("1", 15));
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

      // Mining  300,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }
      // Assert current exchange rate
      await assertExchangeRate();

      // Set oracle price for TOKEN2
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, convertToUnit("1", 15));

      let [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);

      // Mint vTOKEN1 with second account(ACC2)
      await token1.connect(token1Holder).transfer(ACC2, mintAmount);
      await token1.connect(acc2Signer).approve(vTOKEN1.address, mintAmount);
      await expect(vTOKEN1.connect(acc2Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");

      // Borrow TOKEN2 with second account(ACC2)
      await expect(vTOKEN2.connect(acc2Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");

      // Mine 30,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }
      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      await token2.connect(acc2Signer).approve(vTOKEN2.address, convertToUnit(1, 18));

      await vTOKEN2.connect(acc2Signer).repayBorrow(TOKEN2BorrowAmount);

      // Mine 30,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }
      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      // setup to liquidate the second account(ACC2) with first account(ACC1)
      await comptroller.setMinLiquidatableCollateral(1);
      const tuple1 = {
        asset: TOKEN1,
        feed: chainlinkOracle.address,
        maxStalePeriod: "9000000000000000000",
      };
      const tuple2 = {
        asset: TOKEN2,
        feed: chainlinkOracle.address,
        maxStalePeriod: "9000000000000000000",
      };

      await chainlinkOracle.connect(impersonatedTimelock).setTokenConfig(tuple1);
      await chainlinkOracle.connect(impersonatedTimelock).setTokenConfig(tuple2);

      await expect(vTOKEN2.connect(acc2Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1.05", 14));

      [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);

      expect(err).equals(0);
      expect(liquidity).equals(0);
      expect(shortfall).greaterThan(0);

      const borrowBalance = (await vTOKEN2.borrowBalanceStored(ACC2)).toString();
      const closeFactor = (await comptroller.closeFactorMantissa()).toString();
      const maxClose = BigInt(BigInt(borrowBalance) * BigInt(closeFactor)) / BigInt(2e18);
      const result = vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, maxClose, vTOKEN1.address);
      await expect(result).to.emit(vTOKEN2, "LiquidateBorrow");

      // Mine 30,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      // Setup for healAccount(ACC2)

      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit(1, 10));
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, convertToUnit(1, 18));

      const [err2, liquidity2, shortfall2] = await comptroller.getAccountLiquidity(ACC2);
      expect(err2).equals(0);
      expect(liquidity2).equals(0);
      expect(shortfall2).greaterThan(0);
      await comptroller.setMinLiquidatableCollateral(convertToUnit(1, 22));

      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();

      const totalBal = await vTOKEN2.balanceOf(ACC1);
      await expect(vTOKEN2.connect(acc1Signer).redeem(totalBal)).to.emit(vTOKEN2, "Redeem");

      // Mine 30,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }
      // Accural all the interest till latest block
      await vTOKEN2.accrueInterest();

      // Assert current exchange rate
      await assertExchangeRate();
      await network.provider.request({ method: "hardhat_reset" });
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

      // Mine 30,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }
      // Partial redeem for first account(ACC1)
      let balanceBefore = await token2.balanceOf(ACC1);
      await vTOKEN2.connect(acc1Signer).redeem(convertToUnit(5, 7));

      // Assert undelying after partial redeem
      await assertRedeemAmount(convertToUnit(5, 7), balanceBefore);

      // Mine 30,000 blocks
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(blocksToMine);
      } else {
        await mine(blocksToMine);
      }
      // Complete redeem for first account(ACC1)
      const accountBalance = await vTOKEN2.balanceOf(ACC1);
      balanceBefore = await token2.balanceOf(ACC1);
      await vTOKEN2.connect(acc1Signer).redeem(accountBalance);

      // Assert undelying after complete redeem
      await assertRedeemAmount(accountBalance, balanceBefore);
      await network.provider.request({ method: "hardhat_reset" });
    });
  });
}

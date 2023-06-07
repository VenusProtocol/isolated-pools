import { smock } from "@defi-wonderland/smock";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";
const FORK_MAINNET = process.env.FORK_MAINNET === "true";

let ADMIN: string;
let ACM: string;
let acc1: string;
let acc2: string;
let acc3: string;
let USDD: string;
let HAY: string;
let COMPTROLLER: string;
let VUSDD: string;
let VHAY: string;
let ORACLE: string;
let ORACLE_ADMIN: string;

if (FORK_TESTNET) {
  ADMIN = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
  ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
  acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
  acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
  acc3 = "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3";
  USDD = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382";
  HAY = "0xe73774DfCD551BF75650772dC2cC56a2B6323453";
  COMPTROLLER = "0x605AA769d14F6Af2E405295FEC2A4d8Baa623d80";
  VUSDD = "0xed7401294ebf0a1b0721562a69031565f4a4bacd";
  VHAY = "0x3e745593031bedbea4fed90f8065783a9d067333";
  ORACLE = "0xfc4e26B7fD56610E84d33372435F0275A359E8eF";
  ORACLE_ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let impersonatedOracleOwner: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vUSDD: VToken;
let vHAY: VToken;
let usdd: MockToken;
let hay: MockToken;
let priceOracle: ResilientOracleInterface;
let oracle: ChainlinkOracle;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let mintAmount: BigNumberish;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
  impersonatedOracleOwner = await initMainnetUser(ORACLE_ADMIN, ethers.utils.parseUnits("2"));
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
}

if (FORK_TESTNET || FORK_MAINNET) {
  describe("Liquidations", async () => {
    mintAmount = convertToUnit("1000", 18); // $1000
    async function setup() {
      await setForkBlock(30080357);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(acc3, ethers.utils.parseUnits("2"));

      hay = MockToken__factory.connect(HAY, impersonatedTimelock);
      usdd = MockToken__factory.connect(USDD, impersonatedTimelock);
      vHAY = await configureVToken(VHAY);
      vUSDD = await configureVToken(VUSDD);

      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      const resilientOracle = await comptroller.oracle();
      priceOracle = ResilientOracleInterface__factory.connect(resilientOracle, impersonatedTimelock);
      oracle = ChainlinkOracle__factory.connect(ORACLE, impersonatedOracleOwner);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([VUSDD, VHAY]);
      await comptroller.connect(acc2Signer).enterMarkets([VUSDD, VHAY]);
      await comptroller.connect(acc3Signer).enterMarkets([VHAY]);

      await comptroller.setMarketSupplyCaps([VHAY, VUSDD], [convertToUnit(1, 50), convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([VHAY, VUSDD], [convertToUnit(1, 50), convertToUnit(1, 50)]);
    }
    beforeEach(async () => {
      await setup();

      await oracle.setDirectPrice(USDD, convertToUnit(1, 18));
      await oracle.setDirectPrice(HAY, convertToUnit(1, 18));

      // Increase collateral for acc1
      await usdd.connect(acc1Signer).faucet(mintAmount);
      await usdd.connect(acc1Signer).approve(VUSDD, mintAmount);
      await expect(vUSDD.connect(acc1Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");

      // Increase collateral for acc2
      await hay.connect(acc2Signer).faucet(mintAmount);
      await hay.connect(acc2Signer).approve(VHAY, mintAmount);
      await expect(vHAY.connect(acc2Signer).mint(mintAmount)).to.emit(vHAY, "Mint");
    });

    it("Liquidate from VToken", async function () {
      let accountInfo = await comptroller.getAccountLiquidity(acc2);
      let availableLiquidity = accountInfo.liquidity;
      await vUSDD.connect(acc2Signer).borrow(availableLiquidity);

      accountInfo = await comptroller.getAccountLiquidity(acc2);
      availableLiquidity = accountInfo.liquidity;
      expect(availableLiquidity).equals(0);

      await oracle.setDirectPrice(USDD, convertToUnit("1.2", 18));
      const borrowBalance = await vUSDD.borrowBalanceStored(acc2);
      const closeFactor = await comptroller.closeFactorMantissa();
      const maxClose = borrowBalance.mul(closeFactor).div(convertToUnit(1, 18));

      // (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
      const totalReservesUsddPrev = await vHAY.totalReserves();
      const vHAYBalAcc1Prev = await vHAY.balanceOf(acc1);
      const vHAYBalAcc2Prev = await vHAY.balanceOf(acc2);
      const borrowBalancePrev = await vUSDD.borrowBalanceStored(acc2);

      const priceBorrowed = await priceOracle.getUnderlyingPrice(vUSDD.address);
      const priceCollateral = await priceOracle.getUnderlyingPrice(vHAY.address);
      const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
      const exchangeRateCollateralPrev = await vUSDD.callStatic.exchangeRateCurrent();
      const num = liquidationIncentive.mul(priceBorrowed).div(convertToUnit(1, 18));
      const den = priceCollateral.mul(exchangeRateCollateralPrev).div(convertToUnit(1, 18));
      const seizeTokens = num.mul(maxClose).div(den);

      await usdd.connect(acc1Signer).faucet(maxClose);
      await usdd.connect(acc1Signer).approve(VUSDD, maxClose);
      await expect(vUSDD.connect(acc1Signer).liquidateBorrow(acc2, maxClose, VHAY)).to.be.emit(
        vUSDD,
        "LiquidateBorrow",
      );

      const vHAYBalAcc2New = await vHAY.balanceOf(acc2);
      const vHAYBalAcc1New = await vHAY.balanceOf(acc1);
      const totalReservesHayNew = await vHAY.totalReserves();
      const exchangeRateCollateralNew = await vHAY.exchangeRateStored();

      const protocolSeizeShareMantissa = await vUSDD.protocolSeizeShareMantissa();
      const protocolSeizeTokens = seizeTokens.mul(protocolSeizeShareMantissa).div(convertToUnit(1, 18));
      const liquidatorSeizeTokens = seizeTokens.sub(protocolSeizeTokens);

      const reserveIncrease = protocolSeizeTokens.mul(exchangeRateCollateralNew).div(convertToUnit(1, 18));
      const borrowBalanceNew = await vUSDD.borrowBalanceStored(acc2);

      expect(borrowBalancePrev.sub(maxClose)).to.closeTo(borrowBalanceNew, parseUnits("0.000009", 18));
      expect(vHAYBalAcc2Prev.sub(vHAYBalAcc2New)).to.closeTo(seizeTokens, parseUnits("0.000000000009", 18));
      expect(vHAYBalAcc1New.sub(vHAYBalAcc1Prev)).to.closeTo(liquidatorSeizeTokens, parseUnits("0.000000000009", 18));
      expect(totalReservesHayNew.sub(totalReservesUsddPrev)).to.closeTo(reserveIncrease, parseUnits("0.09", 18));
    });
  });
}

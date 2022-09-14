import { Signer, BaseContract, BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, Comptroller__factory, PriceOracle, VBep20Immutable, PoolRegistry, AccessControlManager
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";


const borrowedPrice = convertToUnit(2, 10);
const collateralPrice = convertToUnit(1, 18);
const repayAmount = convertToUnit(1, 18);

async function calculateSeizeTokens(
  comptroller: MockContract<Comptroller>,
  vTokenBorrowed: FakeContract<VBep20Immutable>,
  vTokenCollateral: FakeContract<VBep20Immutable>,
  repayAmount: BigNumberish
) {
  return comptroller.liquidateCalculateSeizeTokens(vTokenBorrowed.address, vTokenCollateral.address, repayAmount);
}

function rando(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe('Comptroller', () => {
  let root: Signer;
  let accounts: Signer[];
  let comptroller: MockContract<Comptroller>;
  let oracle: FakeContract<PriceOracle>;
  let vTokenBorrowed: FakeContract<VBep20Immutable>;
  let vTokenCollateral: FakeContract<VBep20Immutable>;

  type LiquidateFixture = {
    accessControl: FakeContract<AccessControlManager>;
    comptroller: MockContract<Comptroller>;
    oracle: FakeContract<PriceOracle>;
    vTokenBorrowed: FakeContract<VBep20Immutable>;
    vTokenCollateral: FakeContract<VBep20Immutable>;
  };

  async function setOraclePrice(vToken: FakeContract<VBep20Immutable>, price: BigNumberish) {
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(price);
  }

  async function liquidateFixture(): Promise<LiquidateFixture> {
    const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
    const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    const comptroller = await ComptrollerFactory.deploy(poolRegistry.address, accessControl.address);
    const oracle = await smock.fake<PriceOracle>("PriceOracle");

    accessControl.isAllowedToCall.returns(true);
    await comptroller._setPriceOracle(oracle.address);
    await comptroller._setLiquidationIncentive(convertToUnit("1.1", 18));

    const vTokenBorrowed = await smock.fake<VBep20Immutable>("VBep20Immutable");
    const vTokenCollateral = await smock.fake<VBep20Immutable>("VBep20Immutable");

    return { accessControl, comptroller, oracle, vTokenBorrowed, vTokenCollateral };
  }

  async function configure(
    { accessControl, comptroller, vTokenCollateral, oracle, vTokenBorrowed }: LiquidateFixture
  ) {
    oracle.getUnderlyingPrice.returns(0);
    for (const vToken of [vTokenBorrowed, vTokenCollateral]) {
      vToken.comptroller.returns(comptroller.address);
      vToken.isVToken.returns(true);
    }

    accessControl.isAllowedToCall.returns(true);
    vTokenCollateral.exchangeRateStored.returns(5e9);
    oracle.getUnderlyingPrice.whenCalledWith(vTokenCollateral.address).returns(collateralPrice);
    oracle.getUnderlyingPrice.whenCalledWith(vTokenBorrowed.address).returns(borrowedPrice);
  }

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(liquidateFixture);
    await configure(contracts);
    ({ comptroller, vTokenBorrowed, oracle, vTokenCollateral} = contracts);
  });

  describe('liquidateCalculateAmountSeize', () => {
    it("fails if borrowed asset price is 0", async () => {
      setOraclePrice(vTokenBorrowed, 0);
      const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount)
      expect(err).to.equal(Error.PRICE_ERROR);
      expect(result).to.equal(0);
    });

    it("fails if collateral asset price is 0", async () => {
      setOraclePrice(vTokenCollateral, 0);
      const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount)
      expect(err).to.equal(Error.PRICE_ERROR);
      expect(result).to.equal(0);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(
        calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, constants.MaxUint256)
      ).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if the borrowed asset price causes overflow ", async () => {
      setOraclePrice(vTokenBorrowed, constants.MaxUint256);
      await expect(
        calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount)
      ).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      vTokenCollateral.exchangeRateStored.reverts("exchangeRateStored: exchangeRateStoredInternal failed");
      ethers.provider.getBlockNumber();
      /// TODO: Somehow the error message does not get propagated into the resulting tx. Smock bug?
      await expect(
        comptroller.liquidateCalculateSeizeTokens(vTokenBorrowed.address, vTokenCollateral.address, repayAmount)
      ).to.be.reverted; // revertedWith("exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 2e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 5.230480842e18, 771.32e18, 1.3e18, 10002.45e18],
      [ 7.009232529961056e+24,2.5278726317240445e+24,2.6177112093242585e+23,1179713989619784000,7.790468414639561e+24 ],
      [rando(0, 1e25), rando(0, 1e25), rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)]
    ].forEach((testCase) => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase.map(x => BigInt(x));

        setOraclePrice(vTokenCollateral, collateralPrice);
        setOraclePrice(vTokenBorrowed, borrowedPrice);
        await comptroller._setLiquidationIncentive(liquidationIncentive);
        vTokenCollateral.exchangeRateStored.returns(exchangeRate);

        const seizeAmount = repayAmount * liquidationIncentive * borrowedPrice / collateralPrice;
        const seizeTokens = seizeAmount / exchangeRate;

        const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
        expect(err).to.equal(Error.NO_ERROR);
        expect(Number(result)).to.be.approximately(Number(seizeTokens), 1e7);
      });
    });
  });
});

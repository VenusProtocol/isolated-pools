import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  VToken,
} from "../../../typechain";
import { Error } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

const borrowedPrice = convertToUnit(2, 10);
const collateralPrice = convertToUnit(1, 18);
const repayAmount = convertToUnit(1, 18);

async function calculateSeizeTokens(
  comptroller: MockContract<Comptroller>,
  vTokenBorrowed: FakeContract<VToken>,
  vTokenCollateral: FakeContract<VToken>,
  repayAmount: BigNumberish,
) {
  return comptroller.liquidateCalculateSeizeTokens(vTokenBorrowed.address, vTokenCollateral.address, repayAmount);
}

function rando(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe("Comptroller", () => {
  let comptroller: MockContract<Comptroller>;
  let oracle: FakeContract<PriceOracle>;
  let vTokenBorrowed: FakeContract<VToken>;
  let vTokenCollateral: FakeContract<VToken>;
  const maxLoopsLimit = 150;

  type LiquidateFixture = {
    accessControl: FakeContract<AccessControlManager>;
    comptroller: MockContract<Comptroller>;
    oracle: FakeContract<PriceOracle>;
    vTokenBorrowed: FakeContract<VToken>;
    vTokenCollateral: FakeContract<VToken>;
  };

  async function setOraclePrice(vToken: FakeContract<VToken>, price: BigNumberish) {
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(price);
  }

  async function liquidateFixture(): Promise<LiquidateFixture> {
    const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
    const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
    const comptroller = await upgrades.deployProxy(Comptroller, [maxLoopsLimit, accessControl.address], {
      constructorArgs: [poolRegistry.address],
      initializer: "initialize(uint256,address)",
    });
    const oracle = await smock.fake<PriceOracle>("PriceOracle");

    accessControl.isAllowedToCall.returns(true);
    await comptroller.setPriceOracle(oracle.address);
    await comptroller.setLiquidationIncentive(convertToUnit("1.1", 18));

    const vTokenBorrowed = await smock.fake<VToken>("VToken");
    const vTokenCollateral = await smock.fake<VToken>("VToken");

    return { accessControl, comptroller, oracle, vTokenBorrowed, vTokenCollateral };
  }

  async function configure({ accessControl, comptroller, vTokenCollateral, oracle, vTokenBorrowed }: LiquidateFixture) {
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
    const contracts = await loadFixture(liquidateFixture);
    await configure(contracts);
    ({ comptroller, vTokenBorrowed, oracle, vTokenCollateral } = contracts);
  });

  describe("liquidateCalculateAmountSeize", () => {
    it("fails if borrowed asset price is 0", async () => {
      await setOraclePrice(vTokenBorrowed, 0);
      const call = calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
      await expect(call).to.be.revertedWithCustomError(comptroller, "PriceError").withArgs(vTokenBorrowed.address);
    });

    it("fails if collateral asset price is 0", async () => {
      await setOraclePrice(vTokenCollateral, 0);
      const call = calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
      await expect(call).to.be.revertedWithCustomError(comptroller, "PriceError").withArgs(vTokenCollateral.address);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(
        calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, constants.MaxUint256),
      ).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if the borrowed asset price causes overflow ", async () => {
      await setOraclePrice(vTokenBorrowed, constants.MaxUint256);
      await expect(
        calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount),
      ).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      vTokenCollateral.exchangeRateStored.reverts("exchangeRateStored: exchangeRateStoredInternal failed");
      await ethers.provider.getBlockNumber();
      /// TODO: Somehow the error message does not get propagated into the resulting tx. Smock bug?
      await expect(
        comptroller.liquidateCalculateSeizeTokens(vTokenBorrowed.address, vTokenCollateral.address, repayAmount),
      ).to.be.reverted; // revertedWith("exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 2e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 5.230480842e18, 771.32e18, 1.3e18, 10002.45e18],
      [7.009232529961056e24, 2.5278726317240445e24, 2.6177112093242585e23, 1179713989619784000, 7.790468414639561e24],
      [rando(0, 1e25), rando(0, 1e25), rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)],
    ].forEach(testCase => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase.map(x =>
          BigInt(x),
        );

        await setOraclePrice(vTokenCollateral, collateralPrice);
        await setOraclePrice(vTokenBorrowed, borrowedPrice);
        await comptroller.setLiquidationIncentive(liquidationIncentive);
        vTokenCollateral.exchangeRateStored.returns(exchangeRate);

        const seizeAmount = (repayAmount * liquidationIncentive * borrowedPrice) / collateralPrice;
        const seizeTokens = seizeAmount / exchangeRate;

        const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
        expect(err).to.equal(Error.NO_ERROR);
        expect(Number(result)).to.be.approximately(Number(seizeTokens), 1e7);
      });
    });
  });
});

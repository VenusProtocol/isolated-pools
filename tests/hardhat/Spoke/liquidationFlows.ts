import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, constants } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  ERC20Harness,
  IDeviationBoundedOracle,
  InterestRateModel,
  PoolRegistry,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokeComptroller__factory,
  VTokenHarness,
  VTokenHarness__factory,
} from "../../../typechain";
import { fakeInterestRateModel, makeVToken, mockUnderlying } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const ONE = parseUnits("1", 18);

// Both markets price at 1 and the collateral market's exchange rate is pinned at 1, so a token count is also a
// value. Then seizeTokens = repayAmount * collateralMarketIncentive.
const REPAY_AMOUNT = parseUnits("100", 18);
const BORROW_BALANCE = parseUnits("1000", 18);
const COLLATERAL_BALANCE = parseUnits("1000", 18);
const CLOSE_FACTOR = parseUnits("0.5", 18); // allows repaying up to 500 of the 1000 borrowed
const COLLATERAL_FACTOR = parseUnits("0.4", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.5", 18); // 0.5 * 1000 = 500 against 1000 of debt, so a shortfall
const MIN_LIQUIDATABLE_COLLATERAL = parseUnits("100", 18); // below the 1000 held, so single liquidation applies

interface FlowFixture {
  comptroller: MockContract<SpokeComptroller>;
  oracle: FakeContract<ResilientOracleInterface>;
  borrowed: VTokenHarness;
  collateral: VTokenHarness;
  borrowedUnderlying: MockContract<ERC20Harness>;
  collateralUnderlying: MockContract<ERC20Harness>;
  protocolShareReserve: FakeContract<unknown>;
}

/**
 * A spoke pool with two real vTokens, so that `VToken._seize` runs for real against the comptroller's per-market
 * incentive. A fake comptroller would let the seize arithmetic be stated rather than derived, which is exactly the
 * interaction under test here.
 */
async function deployFlowFixture(): Promise<FlowFixture> {
  const [, , , proxyAdminSigner] = await ethers.getSigners();
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const acm = await smock.fake<AccessControlManager>("AccessControlManager");
  const boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
  acm.isAllowedToCall.returns(true);
  boundedOracle.getBoundedPricesView.returns([ONE, ONE]);

  const comptrollerFactory = await smock.mock<SpokeComptroller__factory>("SpokeComptroller");
  const comptroller = (await upgrades.deployProxy(comptrollerFactory, [150, acm.address], {
    constructorArgs: [poolRegistry.address],
    initializer: "initialize(uint256,address)",
  })) as MockContract<SpokeComptroller>;
  await comptroller.setPriceOracle(oracle.address);
  await comptroller.setDeviationBoundedOracle(boundedOracle.address);
  await comptroller.setCloseFactor(CLOSE_FACTOR);
  await comptroller.setMinLiquidatableCollateral(MIN_LIQUIDATABLE_COLLATERAL);
  // `PoolRegistry.addPool` always sets this while registering a pool, and the snapshot divides by it, so a fixture
  // that skips the registry has to supply it. Individual tests override it where the value is what is under test.
  await comptroller.setLiquidationIncentive(parseUnits("1.1", 18));

  const protocolShareReserve = await smock.fake("ProtocolShareReserve");
  // Zero rates, so no interest accrues and every figure below stays exact.
  const interestRateModel: FakeContract<InterestRateModel> = await fakeInterestRateModel();

  const borrowedUnderlying = await mockUnderlying("Borrowed", "BRW");
  const collateralUnderlying = await mockUnderlying("Collateral", "COL");

  const borrowed = await makeVToken<VTokenHarness__factory>(
    {
      underlying: borrowedUnderlying,
      comptroller,
      accessControlManager: acm,
      admin: proxyAdminSigner,
      interestRateModel,
      protocolShareReserve,
    },
    { kind: "VTokenHarness" },
  );
  const collateral = await makeVToken<VTokenHarness__factory>(
    {
      underlying: collateralUnderlying,
      comptroller,
      accessControlManager: acm,
      admin: proxyAdminSigner,
      interestRateModel,
      protocolShareReserve,
    },
    { kind: "VTokenHarness" },
  );

  oracle.getUnderlyingPrice.whenCalledWith(borrowed.address).returns(ONE);
  oracle.getUnderlyingPrice.whenCalledWith(collateral.address).returns(ONE);

  await setBalance(poolRegistry.address, parseEther("1"));
  for (const vToken of [borrowed, collateral]) {
    await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
    await comptroller.setMarketSupplyCaps([vToken.address], [constants.MaxUint256]);
    await comptroller.setMarketBorrowCaps([vToken.address], [constants.MaxUint256]);
    await comptroller.setCollateralFactor(vToken.address, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
  }

  return {
    comptroller,
    oracle,
    borrowed,
    collateral,
    borrowedUnderlying,
    collateralUnderlying,
    protocolShareReserve,
  };
}

describe("SpokeComptroller: liquidation flows against real vTokens", () => {
  let fixture: FlowFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let borrowed: VTokenHarness;
  let collateral: VTokenHarness;
  let liquidator: SignerWithAddress;
  let borrower: SignerWithAddress;

  beforeEach(async () => {
    [, liquidator, borrower] = await ethers.getSigners();
    fixture = await loadFixture(deployFlowFixture);
    ({ comptroller, borrowed, collateral } = fixture);

    // The borrower owes 1000 in the borrowed market and holds 1000 of collateral, priced 1:1.
    await borrowed.harnessSetAccountBorrows(borrower.address, BORROW_BALANCE, ONE);
    await borrowed.harnessSetTotalBorrows(BORROW_BALANCE);
    await collateral.harnessSetBalance(borrower.address, COLLATERAL_BALANCE);
    await collateral.harnessSetTotalSupply(COLLATERAL_BALANCE);
    await collateral.harnessSetExchangeRate(ONE);
    await comptroller.connect(borrower).enterMarkets([collateral.address, borrowed.address]);

    // The liquidator funds the repayment, and the collateral market holds enough underlying to pay the protocol
    // its share out.
    await fixture.borrowedUnderlying.harnessSetBalance(liquidator.address, REPAY_AMOUNT);
    await fixture.borrowedUnderlying.connect(liquidator).approve(borrowed.address, REPAY_AMOUNT);
    // `internalCash` is tracked separately from the ERC20 balance, and `_doTransferOut` decrements it, so seeding
    // the balance alone would underflow. Both have to be set for the market to be able to pay anything out.
    const collateralCash = parseUnits("100", 18);
    await fixture.collateralUnderlying.harnessSetBalance(collateral.address, collateralCash);
    await collateral.harnessSetInternalCash(collateralCash);
  });

  // `liquidateCalculateSeizeTokens` prices the seizure at the collateral market's incentive, and `VToken._seize`
  // divides the protocol's share back out by that same incentive, because `liquidationIncentiveMantissa()` answers
  // for the calling market. So the protocol takes exactly `protocolSeizeShareMantissa` of the value repaid and the
  // liquidator keeps the whole discount, whichever side of the pool-wide value the market's incentive falls on. Each
  // case pins the token counts, and every case also checks the borrower loses precisely `seizeTokens`.
  const PROTOCOL_SEIZE_TOKENS = parseUnits("5", 18); // 5% of the 100 repaid, at the market's default seize share

  const cases = [
    {
      name: "takes the protocol's share of the repayment when the market and pool incentives agree",
      marketIncentive: parseUnits("1.1", 18),
      poolIncentive: parseUnits("1.1", 18),
      seizeTokens: parseUnits("110", 18),
      liquidatorSeizeTokens: parseUnits("105", 18),
    },
    {
      name: "takes the same share when the market incentive is the higher one",
      marketIncentive: parseUnits("1.15", 18),
      poolIncentive: parseUnits("1.1", 18),
      seizeTokens: parseUnits("115", 18),
      liquidatorSeizeTokens: parseUnits("110", 18),
    },
    {
      name: "takes the same share when the market incentive is the lower one",
      marketIncentive: parseUnits("1.05", 18),
      poolIncentive: parseUnits("1.1", 18),
      seizeTokens: parseUnits("105", 18),
      liquidatorSeizeTokens: parseUnits("100", 18),
    },
  ];

  describe("protocol seize split", () => {
    for (const testCase of cases) {
      it(testCase.name, async () => {
        await comptroller.setLiquidationIncentive(testCase.poolIncentive);
        await comptroller.setMarketLiquidationIncentive(collateral.address, testCase.marketIncentive);

        const [, seizeTokens] = await comptroller.liquidateCalculateSeizeTokens(
          borrowed.address,
          collateral.address,
          REPAY_AMOUNT,
        );
        expect(seizeTokens).to.equal(testCase.seizeTokens);
        const { liquidatorSeizeTokens } = testCase;

        const supplyBefore = await collateral.totalSupply();
        await borrowed.connect(liquidator).liquidateBorrow(borrower.address, REPAY_AMOUNT, collateral.address);

        // The borrower's loss is set entirely by the collateral market's own incentive.
        expect(await collateral.balanceOf(borrower.address)).to.equal(COLLATERAL_BALANCE.sub(seizeTokens));
        expect(await collateral.balanceOf(liquidator.address)).to.equal(liquidatorSeizeTokens);
        expect(await collateral.totalSupply()).to.equal(supplyBefore.sub(PROTOCOL_SEIZE_TOKENS));
      });
    }

    it("still repays the liquidator in full at the lowest incentive the setter allows", async () => {
      // `1e18 + protocolSeizeShareMantissa` is the floor `setMarketLiquidationIncentive` enforces, and it is the
      // break-even point: the liquidator recovers exactly what it repaid and the protocol takes the whole discount.
      // The pool-wide value is parked well above it to show it no longer feeds this split - were it leaking in, the
      // seizure below would price at 150 rather than 105.
      const floor = ONE.add(await collateral.protocolSeizeShareMantissa());
      await comptroller.setLiquidationIncentive(parseUnits("1.5", 18));
      await comptroller.setMarketLiquidationIncentive(collateral.address, floor);

      const [, seizeTokens] = await comptroller.liquidateCalculateSeizeTokens(
        borrowed.address,
        collateral.address,
        REPAY_AMOUNT,
      );
      expect(seizeTokens).to.equal(parseUnits("105", 18));

      await borrowed.connect(liquidator).liquidateBorrow(borrower.address, REPAY_AMOUNT, collateral.address);

      expect(await collateral.balanceOf(liquidator.address)).to.equal(REPAY_AMOUNT);
      expect(await collateral.balanceOf(borrower.address)).to.equal(COLLATERAL_BALANCE.sub(seizeTokens));
    });

    it("rejects a market incentive one wei below that floor", async () => {
      const floor = ONE.add(await collateral.protocolSeizeShareMantissa());

      await expect(
        comptroller.setMarketLiquidationIncentive(collateral.address, floor.sub(1)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationIncentive");
    });

    it("bounds a market's protocol seize share against that market's own incentive", async () => {
      await comptroller.setLiquidationIncentive(parseUnits("1.1", 18));
      await comptroller.setMarketLiquidationIncentive(collateral.address, parseUnits("1.15", 18));

      // A 12% share clears the market's own 1.15 but not the pool-wide 1.1, so it is only accepted because
      // `liquidationIncentiveMantissa()` answers for the calling market.
      await collateral.setProtocolSeizeShare(parseUnits("0.12", 18));
      expect(await collateral.protocolSeizeShareMantissa()).to.equal(parseUnits("0.12", 18));

      await expect(collateral.setProtocolSeizeShare(parseUnits("0.16", 18))).to.be.revertedWithCustomError(
        collateral,
        "ProtocolSeizeShareTooBig",
      );
    });

    it("sends the protocol's share of the underlying to the protocol share reserve", async () => {
      await comptroller.setLiquidationIncentive(parseUnits("1.1", 18));
      await comptroller.setMarketLiquidationIncentive(collateral.address, parseUnits("1.1", 18));
      // 110 seized at a 5% protocol share over a pool-wide incentive of 1.1, and an exchange rate of 1, so the
      // underlying amount equals the token count.
      const protocolSeizeAmount = parseUnits("5", 18);

      await expect(borrowed.connect(liquidator).liquidateBorrow(borrower.address, REPAY_AMOUNT, collateral.address))
        .to.emit(collateral, "ProtocolSeize")
        .withArgs(borrower.address, fixture.protocolShareReserve.address, protocolSeizeAmount);

      expect(await fixture.collateralUnderlying.balanceOf(fixture.protocolShareReserve.address)).to.equal(
        protocolSeizeAmount,
      );
    });
  });
  // Both batch operations require the position to sit below `minLiquidatableCollateral`, so these raise it above
  // the 1000 of collateral the borrower holds.
  describe("batch operations", () => {
    const BATCH_MIN_COLLATERAL = parseUnits("10000", 18);
    const POOL_INCENTIVE = parseUnits("1.1", 18);

    beforeEach(async () => {
      await comptroller.setMinLiquidatableCollateral(BATCH_MIN_COLLATERAL);
      await comptroller.setLiquidationIncentive(POOL_INCENTIVE);
    });

    it("heals an underwater account, repaying maxClearableDebt and recording the rest as bad debt", async () => {
      // 1000 of collateral at an incentive of 1.1 clears 909.090909090909090909 of debt, against 1000 owed, so
      // the percentage is that ratio and the shortfall between it and the debt becomes bad debt.
      const maxClearableDebt = BigNumber.from("909090909090909090909");
      const repayment = BigNumber.from("909090909090909090000");
      const expectedBadDebt = BORROW_BALANCE.sub(repayment);

      await fixture.borrowedUnderlying.harnessSetBalance(liquidator.address, repayment);
      await fixture.borrowedUnderlying.connect(liquidator).approve(borrowed.address, repayment);

      await expect(comptroller.connect(liquidator).healAccount(borrower.address))
        .to.emit(borrowed, "BadDebtIncreased")
        .withArgs(borrower.address, expectedBadDebt, 0, expectedBadDebt);

      expect(await borrowed.badDebt()).to.equal(expectedBadDebt);
      expect(await borrowed.borrowBalanceStored(borrower.address)).to.equal(0);
      // The whole collateral position is seized; the protocol takes 5% of it over the pool-wide incentive.
      expect(await collateral.balanceOf(borrower.address)).to.equal(0);
      expect(await collateral.balanceOf(liquidator.address)).to.equal(COLLATERAL_BALANCE.sub("45454545454545454545"));
      expect(maxClearableDebt).to.be.lt(BORROW_BALANCE);
    });

    it("clears every borrow through liquidateAccount and leaves no bad debt", async () => {
      // 600 of debt against 909.09 of clearable collateral, so liquidateAccount is the correct path.
      const debt = parseUnits("600", 18);
      await borrowed.harnessSetAccountBorrows(borrower.address, debt, ONE);
      await borrowed.harnessSetTotalBorrows(debt);
      await fixture.borrowedUnderlying.harnessSetBalance(liquidator.address, debt);
      await fixture.borrowedUnderlying.connect(liquidator).approve(borrowed.address, debt);

      await comptroller
        .connect(liquidator)
        .liquidateAccount(borrower.address, [
          { vTokenCollateral: collateral.address, vTokenBorrowed: borrowed.address, repayAmount: debt },
        ]);

      expect(await borrowed.borrowBalanceStored(borrower.address)).to.equal(0);
      expect(await borrowed.badDebt()).to.equal(0);
      // 600 repaid at an incentive of 1.1 seizes 660, of which the protocol takes 30.
      expect(await collateral.balanceOf(borrower.address)).to.equal(COLLATERAL_BALANCE.sub(parseUnits("660", 18)));
      expect(await collateral.balanceOf(liquidator.address)).to.equal(parseUnits("630", 18));
    });

    it("rejects orders that leave a borrow outstanding", async () => {
      const debt = parseUnits("600", 18);
      await borrowed.harnessSetAccountBorrows(borrower.address, debt, ONE);
      await borrowed.harnessSetTotalBorrows(debt);
      const partial = parseUnits("300", 18);
      await fixture.borrowedUnderlying.harnessSetBalance(liquidator.address, partial);
      await fixture.borrowedUnderlying.connect(liquidator).approve(borrowed.address, partial);

      await expect(
        comptroller
          .connect(liquidator)
          .liquidateAccount(borrower.address, [
            { vTokenCollateral: collateral.address, vTokenBorrowed: borrowed.address, repayAmount: partial },
          ]),
      ).to.be.revertedWithCustomError(comptroller, "NonzeroBorrowBalanceAfterLiquidation");
    });
  });

  describe("liquidation allowlist against real seizures", () => {
    it("gates a cross-market seizure", async () => {
      await comptroller.setLiquidationAllowlistEnabled(true);

      await expect(borrowed.connect(liquidator).liquidateBorrow(borrower.address, REPAY_AMOUNT, collateral.address))
        .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
        .withArgs(liquidator.address);
    });

    it("gates an in-kind seizure, which takes the internal _seize branch", async () => {
      // Collateral and borrowed are the same market, so `_liquidateBorrowFresh` calls `_seize` directly instead of
      // going through the external `seize`. That branch still has to reach `preSeizeHook`.
      await collateral.harnessSetBalance(borrower.address, 0);
      await borrowed.harnessSetBalance(borrower.address, COLLATERAL_BALANCE);
      await borrowed.harnessSetTotalSupply(COLLATERAL_BALANCE);
      await borrowed.harnessSetExchangeRate(ONE);
      await comptroller.setLiquidationAllowlistEnabled(true);

      await expect(borrowed.connect(liquidator).liquidateBorrow(borrower.address, REPAY_AMOUNT, borrowed.address))
        .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
        .withArgs(liquidator.address);
    });

    it("lets an allowlisted liquidator through the same in-kind path", async () => {
      await collateral.harnessSetBalance(borrower.address, 0);
      await borrowed.harnessSetBalance(borrower.address, COLLATERAL_BALANCE);
      await borrowed.harnessSetTotalSupply(COLLATERAL_BALANCE);
      await borrowed.harnessSetExchangeRate(ONE);
      await fixture.borrowedUnderlying.harnessSetBalance(borrowed.address, parseUnits("100", 18));
      await borrowed.harnessSetInternalCash(parseUnits("100", 18));
      await comptroller.setLiquidationAllowlistEnabled(true);
      await comptroller.setAllowedLiquidator(liquidator.address, true);
      await comptroller.setLiquidationIncentive(parseUnits("1.1", 18));

      await borrowed.connect(liquidator).liquidateBorrow(borrower.address, REPAY_AMOUNT, borrowed.address);

      // 100 repaid at 1.1 seizes 110, of which the protocol takes 5.
      expect(await borrowed.balanceOf(borrower.address)).to.equal(COLLATERAL_BALANCE.sub(parseUnits("110", 18)));
      expect(await borrowed.balanceOf(liquidator.address)).to.equal(parseUnits("105", 18));
    });
  });
});

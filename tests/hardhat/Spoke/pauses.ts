import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { SpokeComptroller } from "../../../typechain";
import { Action, SpokeFixture, TestMarket, deploySpokeComptroller, givePosition, setRiskWeights } from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const COLLATERAL = parseUnits("1000", 18);
const BORROW = parseUnits("100", 18);
const COLLATERAL_FACTOR = parseUnits("0.5", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);

/// One path per action, each reaching the pause check of exactly one `(market, action)` pair. `run` has to succeed
/// while nothing is paused, which is what makes the matrix below meaningful in both directions.
interface PausePath {
  action: number;
  name: string;
  market: () => TestMarket;
  run: () => Promise<unknown>;
}

describe("SpokeComptroller: action pauses", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let collateral: TestMarket;
  let debt: TestMarket;
  let spare: TestMarket;
  let borrower: SignerWithAddress;
  let liquidator: SignerWithAddress;

  /// Collateral in one market, debt in another, and membership without a balance in a third. The third market is
  /// what makes an exit succeed: leaving either of the other two would fail the liquidity check instead.
  async function positioned(): Promise<SpokeFixture> {
    const f = await deploySpokeComptroller({ marketCount: 3 });
    const [collateralMarket, debtMarket] = f.markets;
    await setRiskWeights(f.comptroller, collateralMarket, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    await setRiskWeights(f.comptroller, debtMarket, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    await f.comptroller.setCloseFactor(parseUnits("0.5", 18));
    return f;
  }

  const paths: PausePath[] = [
    {
      action: Action.MINT,
      name: "minting",
      market: () => collateral,
      run: () => comptroller.callStatic.preMintHook(collateral.vToken.address, borrower.address, 1),
    },
    {
      action: Action.REDEEM,
      name: "redeeming",
      market: () => collateral,
      run: () => comptroller.callStatic.preRedeemHook(collateral.vToken.address, borrower.address, 1),
    },
    {
      action: Action.BORROW,
      name: "borrowing",
      market: () => debt,
      run: () => comptroller.connect(borrower).callStatic.preBorrowHook(debt.vToken.address, borrower.address, 1),
    },
    {
      action: Action.REPAY,
      name: "repaying",
      market: () => debt,
      run: () => comptroller.callStatic.preRepayHook(debt.vToken.address, borrower.address),
    },
    {
      action: Action.SEIZE,
      name: "seizing",
      market: () => collateral,
      run: () =>
        comptroller.callStatic.preSeizeHook(
          collateral.vToken.address,
          debt.vToken.address,
          liquidator.address,
          borrower.address,
        ),
    },
    {
      action: Action.LIQUIDATE,
      name: "liquidating",
      market: () => debt,
      run: () =>
        comptroller.callStatic.preLiquidateHook(
          debt.vToken.address,
          collateral.vToken.address,
          borrower.address,
          1,
          true,
        ),
    },
    {
      action: Action.TRANSFER,
      name: "transferring",
      market: () => collateral,
      run: () =>
        comptroller.callStatic.preTransferHook(collateral.vToken.address, borrower.address, liquidator.address, 1),
    },
    {
      action: Action.ENTER_MARKET,
      name: "entering",
      market: () => spare,
      run: () => comptroller.connect(liquidator).callStatic.enterMarkets([spare.vToken.address]),
    },
    {
      action: Action.EXIT_MARKET,
      name: "exiting",
      market: () => spare,
      run: () => comptroller.connect(borrower).callStatic.exitMarket(spare.vToken.address),
    },
  ];

  beforeEach(async () => {
    [, borrower, liquidator] = await ethers.getSigners();
    fixture = await loadFixture(positioned);
    fixture.resetPrices();
    ({ comptroller } = fixture);
    [collateral, debt, spare] = fixture.markets;
    for (const market of fixture.markets) {
      await setBalance(market.vToken.address, parseEther("1"));
    }
    await givePosition(comptroller, borrower, [
      { market: collateral, collateral: COLLATERAL },
      { market: debt, borrow: BORROW },
      { market: spare },
    ]);
  });

  it("leaves every action unpaused on a newly listed market", async () => {
    for (const path of paths) {
      expect(await comptroller.actionPaused(path.market().vToken.address, path.action)).to.equal(false);
      await expect(path.run(), `${path.name} should be allowed`).to.not.be.reverted;
    }
  });

  // The pause state is keyed by `(market, action)`, so each pause has to stop exactly one path and leave the other
  // eight alone. Anything that reads the wrong action, or checks the wrong market, shows up here as a path that
  // either survives its own pause or dies under someone else's.
  for (const path of paths) {
    describe(`pausing ${path.name}`, () => {
      beforeEach(async () => {
        await comptroller.setActionsPaused([path.market().vToken.address], [path.action], true);
      });

      it("blocks its own path", async () => {
        await expect(path.run())
          .to.be.revertedWithCustomError(comptroller, "ActionPaused")
          .withArgs(path.market().vToken.address, path.action);
      });

      it("blocks nothing else", async () => {
        for (const other of paths.filter(candidate => candidate !== path)) {
          await expect(other.run(), `${other.name} should be unaffected`).to.not.be.reverted;
        }
      });

      it("is lifted by the same call", async () => {
        await comptroller.setActionsPaused([path.market().vToken.address], [path.action], false);

        await expect(path.run()).to.not.be.reverted;
      });
    });
  }

  describe("scope", () => {
    it("is per market, so pausing one market leaves the same action open on another", async () => {
      await comptroller.setActionsPaused([collateral.vToken.address], [Action.MINT], true);

      await expect(comptroller.callStatic.preMintHook(debt.vToken.address, borrower.address, 1)).to.not.be.reverted;
    });

    it("applies every market against every action in one call", async () => {
      const both = [collateral.vToken.address, debt.vToken.address];

      await expect(comptroller.setActionsPaused(both, [Action.MINT, Action.BORROW], true))
        .to.emit(comptroller, "ActionPausedMarket")
        .withArgs(collateral.vToken.address, Action.MINT, true);

      for (const market of both) {
        for (const action of [Action.MINT, Action.BORROW]) {
          expect(await comptroller.actionPaused(market, action)).to.equal(true);
        }
      }
      expect(await comptroller.actionPaused(collateral.vToken.address, Action.REDEEM)).to.equal(false);
    });

    // A liquidation touches two markets, and the two halves are paused from opposite ends: LIQUIDATE on the market
    // whose debt is being repaid, SEIZE on the market whose collateral is being taken. Getting this backwards would
    // leave a market that looks paused still liquidatable.
    it("takes liquidating from the borrowed market and seizing from the collateral", async () => {
      await comptroller.setActionsPaused([collateral.vToken.address], [Action.LIQUIDATE], true);
      await comptroller.setActionsPaused([debt.vToken.address], [Action.SEIZE], true);

      await expect(
        comptroller.callStatic.preLiquidateHook(
          debt.vToken.address,
          collateral.vToken.address,
          borrower.address,
          1,
          true,
        ),
      ).to.not.be.reverted;
      await expect(
        comptroller.callStatic.preSeizeHook(
          collateral.vToken.address,
          debt.vToken.address,
          liquidator.address,
          borrower.address,
        ),
      ).to.not.be.reverted;
    });

    it("stops a market from entering a new borrower through the borrow hook", async () => {
      // The borrow hook enters the borrower itself when it is not already a member, and that write goes through
      // the same entry check as `enterMarkets`.
      await comptroller.setActionsPaused([spare.vToken.address], [Action.ENTER_MARKET], true);

      await expect(comptroller.connect(spare.vToken.wallet).preBorrowHook(spare.vToken.address, liquidator.address, 1))
        .to.be.revertedWithCustomError(comptroller, "ActionPaused")
        .withArgs(spare.vToken.address, Action.ENTER_MARKET);
    });

    it("does not stop a borrow by an account already in the market", async () => {
      await comptroller.setActionsPaused([debt.vToken.address], [Action.ENTER_MARKET], true);

      await expect(comptroller.connect(borrower).callStatic.preBorrowHook(debt.vToken.address, borrower.address, 1)).to
        .not.be.reverted;
    });
  });
});

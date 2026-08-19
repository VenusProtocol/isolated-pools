import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { SpokeComptroller } from "../../../typechain";
import { ONE, SpokeFixture, TestMarket, deploySpokeComptroller, givePosition } from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const MINT_AMOUNT = parseUnits("100", 18);

describe("SpokeComptroller: allowlists", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let marketA: TestMarket;
  let marketB: TestMarket;
  let supplier: SignerWithAddress;
  let outsider: SignerWithAddress;
  let borrower: SignerWithAddress;

  beforeEach(async () => {
    [, supplier, outsider, borrower] = await ethers.getSigners();
    fixture = await loadFixture(deploySpokeComptroller);
    fixture.resetPrices();
    ({ comptroller } = fixture);
    [marketA, marketB] = fixture.markets;
  });

  describe("supply allowlist", () => {
    const mint = (market: TestMarket, minter: SignerWithAddress) =>
      comptroller.callStatic.preMintHook(market.vToken.address, minter.address, MINT_AMOUNT);

    it("is disabled on a newly listed market, so anyone may be credited with minted vTokens", async () => {
      expect(await comptroller.isSupplyAllowlistEnabled(marketA.vToken.address)).to.equal(false);

      await expect(mint(marketA, outsider)).to.not.be.reverted;
    });

    it("rejects an account that is not on the allowlist once enabled", async () => {
      await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);

      await expect(mint(marketA, outsider))
        .to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed")
        .withArgs(marketA.vToken.address, outsider.address);
    });

    it("accepts an account on the allowlist once enabled", async () => {
      await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);
      await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true);

      await expect(mint(marketA, supplier)).to.not.be.reverted;
    });

    it("checks the account being credited, not the caller, so a third party may fund the mint", async () => {
      await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);
      await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true);

      // A vToken reaches this hook with `minter` set to the receiver of the vTokens; the payer never appears in
      // the arguments, which is what makes `mintBehalf` by an outsider legitimate.
      await expect(
        comptroller.connect(outsider).callStatic.preMintHook(marketA.vToken.address, supplier.address, MINT_AMOUNT),
      ).to.not.be.reverted;
      await expect(mint(marketA, outsider)).to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed");
    });

    it("rejects again after the account is removed from the allowlist", async () => {
      await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);
      await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true);
      await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, false);

      await expect(mint(marketA, supplier)).to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed");
    });

    it("is scoped per market, both the switch and the entries", async () => {
      await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);
      await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true);

      // B is untouched, so it still accepts anyone.
      await expect(mint(marketB, outsider)).to.not.be.reverted;

      // Once B is gated too, A's entry does not carry over to it.
      await comptroller.setSupplyAllowlistEnabled(marketB.vToken.address, true);
      await expect(mint(marketA, supplier)).to.not.be.reverted;
      await expect(mint(marketB, supplier)).to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed");
    });

    it("does not gate redeeming, so a holder removed from the allowlist can still exit", async () => {
      await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);

      await expect(comptroller.callStatic.preRedeemHook(marketA.vToken.address, outsider.address, ONE)).to.not.be
        .reverted;
    });

    // `preMintHook` checks the pause state, then the listing, then the allowlist, then the supply cap. These pin
    // that order, so a later change cannot silently make the allowlist the first thing a caller hits.
    describe("precedence against the other mint checks", () => {
      it("reports an unlisted market before the allowlist", async () => {
        await expect(comptroller.callStatic.preMintHook(outsider.address, outsider.address, MINT_AMOUNT))
          .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
          .withArgs(outsider.address);
      });

      it("reports the allowlist before the supply cap", async () => {
        await comptroller.setMarketSupplyCaps([marketA.vToken.address], [0]);
        await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);

        // Both the cap and the allowlist would reject this; the allowlist is the one that reports.
        await expect(mint(marketA, outsider)).to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed");
      });

      it("reports the supply cap once the account is allowed", async () => {
        await comptroller.setMarketSupplyCaps([marketA.vToken.address], [0]);
        await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);
        await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true);

        await expect(mint(marketA, supplier))
          .to.be.revertedWithCustomError(comptroller, "SupplyCapExceeded")
          .withArgs(marketA.vToken.address, 0);
      });

      it("reports the pause state before anything else", async () => {
        await comptroller.setActionsPaused([marketA.vToken.address], [0], true);
        await comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true);

        await expect(mint(marketA, outsider))
          .to.be.revertedWithCustomError(comptroller, "ActionPaused")
          .withArgs(marketA.vToken.address, 0);
      });
    });
  });

  describe("liquidation allowlist", () => {
    /// Reaches the allowlist check in `preSeizeHook`: the collateral market is listed, the seizer is a listed
    /// market of this pool, and the borrower is a member of the collateral market.
    const seize = (liquidator: SignerWithAddress) =>
      comptroller.callStatic.preSeizeHook(
        marketB.vToken.address,
        marketA.vToken.address,
        liquidator.address,
        borrower.address,
      );

    beforeEach(async () => {
      await comptroller.connect(borrower).enterMarkets([marketB.vToken.address]);
    });

    it("is disabled by default, so any account may receive seized collateral", async () => {
      expect(await comptroller.isLiquidationAllowlistEnabled()).to.equal(false);

      await expect(seize(outsider)).to.not.be.reverted;
    });

    it("rejects a liquidator that is not on the allowlist once enabled", async () => {
      await comptroller.setLiquidationAllowlistEnabled(true);

      await expect(seize(outsider))
        .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
        .withArgs(outsider.address);
    });

    it("accepts a liquidator on the allowlist once enabled", async () => {
      await comptroller.setLiquidationAllowlistEnabled(true);
      await comptroller.setAllowedLiquidator(outsider.address, true);

      await expect(seize(outsider)).to.not.be.reverted;
    });

    it("is pool-wide, so one entry covers every market", async () => {
      await comptroller.connect(borrower).enterMarkets([marketA.vToken.address]);
      await comptroller.setLiquidationAllowlistEnabled(true);
      await comptroller.setAllowedLiquidator(outsider.address, true);

      await expect(seize(outsider)).to.not.be.reverted;
      await expect(
        comptroller.callStatic.preSeizeHook(
          marketA.vToken.address,
          marketB.vToken.address,
          outsider.address,
          borrower.address,
        ),
      ).to.not.be.reverted;
    });

    it("still gates a forced liquidation, which also ends in a seizure", async () => {
      await comptroller.setForcedLiquidation(marketA.vToken.address, true);
      await comptroller.setLiquidationAllowlistEnabled(true);

      await expect(seize(outsider))
        .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
        .withArgs(outsider.address);
    });

    it("blocks both batch operations for a liquidator that is not on the allowlist", async () => {
      await comptroller.setLiquidationAllowlistEnabled(true);

      for (const call of [
        comptroller.connect(outsider).healAccount(borrower.address),
        comptroller.connect(outsider).liquidateAccount(borrower.address, []),
      ]) {
        await expect(call)
          .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
          .withArgs(outsider.address);
      }
    });

    // A borrower holding no vTokens at all can have its whole debt written off through `healBorrow` alone, and
    // `healBorrow` reaches no hook carrying the caller. The entry check on `healAccount` is the only thing standing
    // between an outsider and free bad debt, so these would fail if it were removed.
    describe("a borrower holding no collateral", () => {
      beforeEach(async () => {
        await givePosition(comptroller, borrower, [{ market: marketB, borrow: ONE }]);
        marketB.vToken.seize.reset();
        marketB.vToken.healBorrow.reset();
      });

      it("lets anyone write the debt off while the allowlist is disabled, at no cost", async () => {
        await comptroller.connect(outsider).healAccount(borrower.address);

        expect(marketB.vToken.seize).to.not.have.been.called;
        expect(marketB.vToken.healBorrow).to.have.been.calledOnceWith(outsider.address, borrower.address, 0);
      });

      it("blocks the same call once the allowlist is enabled", async () => {
        await comptroller.setLiquidationAllowlistEnabled(true);

        await expect(comptroller.connect(outsider).healAccount(borrower.address))
          .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
          .withArgs(outsider.address);
        expect(marketB.vToken.healBorrow).to.not.have.been.called;
      });

      it("still allows an allowlisted liquidator through", async () => {
        await comptroller.setLiquidationAllowlistEnabled(true);
        await comptroller.setAllowedLiquidator(outsider.address, true);

        await comptroller.connect(outsider).healAccount(borrower.address);

        expect(marketB.vToken.healBorrow).to.have.been.calledOnceWith(outsider.address, borrower.address, 0);
      });
    });
  });

  describe("setSupplyAllowlistEnabled", () => {
    it("reverts if access control denies the call", async () => {
      fixture.acm.isAllowedToCall
        .whenCalledWith(supplier.address, "setSupplyAllowlistEnabled(address,bool)")
        .returns(false);

      await expect(
        comptroller.connect(supplier).setSupplyAllowlistEnabled(marketA.vToken.address, true),
      ).to.be.revertedWithCustomError(comptroller, "Unauthorized");
    });

    it("reverts if the market is not listed", async () => {
      await expect(comptroller.setSupplyAllowlistEnabled(outsider.address, true))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(outsider.address);
    });

    it("stores the value and emits an event", async () => {
      await expect(comptroller.setSupplyAllowlistEnabled(marketA.vToken.address, true))
        .to.emit(comptroller, "SupplyAllowlistEnabledUpdated")
        .withArgs(marketA.vToken.address, true);
      expect(await comptroller.isSupplyAllowlistEnabled(marketA.vToken.address)).to.equal(true);
    });
  });

  describe("setAllowedSupplier", () => {
    it("reverts if access control denies the call", async () => {
      fixture.acm.isAllowedToCall
        .whenCalledWith(supplier.address, "setAllowedSupplier(address,address,bool)")
        .returns(false);

      await expect(
        comptroller.connect(supplier).setAllowedSupplier(marketA.vToken.address, supplier.address, true),
      ).to.be.revertedWithCustomError(comptroller, "Unauthorized");
    });

    it("reverts if the market is not listed", async () => {
      await expect(comptroller.setAllowedSupplier(outsider.address, supplier.address, true))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(outsider.address);
    });

    it("reverts if the supplier is the zero address", async () => {
      await expect(
        comptroller.setAllowedSupplier(marketA.vToken.address, constants.AddressZero, true),
      ).to.be.revertedWithCustomError(comptroller, "ZeroAddressNotAllowed");
    });

    it("stores the value and emits an event", async () => {
      await expect(comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true))
        .to.emit(comptroller, "AllowedSupplierUpdated")
        .withArgs(marketA.vToken.address, supplier.address, true);
      expect(await comptroller.isAllowedSupplier(marketA.vToken.address, supplier.address)).to.equal(true);
    });

    it("accepts a write that does not change the value, so overlapping governance actions still execute", async () => {
      await comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true);

      await expect(comptroller.setAllowedSupplier(marketA.vToken.address, supplier.address, true))
        .to.emit(comptroller, "AllowedSupplierUpdated")
        .withArgs(marketA.vToken.address, supplier.address, true);
    });
  });

  describe("setLiquidationAllowlistEnabled", () => {
    it("reverts if access control denies the call", async () => {
      fixture.acm.isAllowedToCall
        .whenCalledWith(supplier.address, "setLiquidationAllowlistEnabled(bool)")
        .returns(false);

      await expect(comptroller.connect(supplier).setLiquidationAllowlistEnabled(true)).to.be.revertedWithCustomError(
        comptroller,
        "Unauthorized",
      );
    });

    it("is disabled by default, and stores the value and emits an event", async () => {
      expect(await comptroller.isLiquidationAllowlistEnabled()).to.equal(false);

      await expect(comptroller.setLiquidationAllowlistEnabled(true))
        .to.emit(comptroller, "LiquidationAllowlistEnabledUpdated")
        .withArgs(true);
      expect(await comptroller.isLiquidationAllowlistEnabled()).to.equal(true);
    });
  });

  describe("setAllowedLiquidator", () => {
    it("reverts if access control denies the call", async () => {
      fixture.acm.isAllowedToCall.whenCalledWith(supplier.address, "setAllowedLiquidator(address,bool)").returns(false);

      await expect(
        comptroller.connect(supplier).setAllowedLiquidator(outsider.address, true),
      ).to.be.revertedWithCustomError(comptroller, "Unauthorized");
    });

    it("reverts if the liquidator is the zero address", async () => {
      await expect(comptroller.setAllowedLiquidator(constants.AddressZero, true)).to.be.revertedWithCustomError(
        comptroller,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the value and emits an event", async () => {
      await expect(comptroller.setAllowedLiquidator(outsider.address, true))
        .to.emit(comptroller, "AllowedLiquidatorUpdated")
        .withArgs(outsider.address, true);
      expect(await comptroller.isAllowedLiquidator(outsider.address)).to.equal(true);
    });
  });
});

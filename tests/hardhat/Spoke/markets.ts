import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { SpokeComptroller, VToken } from "../../../typechain";
import {
  Action,
  ONE,
  SpokeFixture,
  TestMarket,
  deploySpokeComptroller,
  givePosition,
  setRiskWeights,
  unlistMarket,
} from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const COLLATERAL = parseUnits("1000", 18);
const COLLATERAL_FACTOR = parseUnits("0.5", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);

/// Three markets, so the swap-and-pop removal below has a middle entry to remove.
const threeMarkets = () => deploySpokeComptroller({ marketCount: 3 });

describe("SpokeComptroller: market membership", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let marketA: TestMarket;
  let marketB: TestMarket;
  let marketC: TestMarket;
  let account: SignerWithAddress;
  let router: SignerWithAddress;

  const assetsIn = () => comptroller.getAssetsIn(account.address);
  const addresses = async () => (await assetsIn()).map(asset => asset.toString());

  beforeEach(async () => {
    [, account, router] = await ethers.getSigners();
    fixture = await loadFixture(threeMarkets);
    fixture.resetPrices();
    ({ comptroller } = fixture);
    [marketA, marketB, marketC] = fixture.markets;
  });

  describe("enterMarkets", () => {
    it("adds the caller to every market in the list", async () => {
      const tx = comptroller.connect(account).enterMarkets([marketA.vToken.address, marketB.vToken.address]);

      await expect(tx).to.emit(comptroller, "MarketEntered").withArgs(marketA.vToken.address, account.address);
      await expect(tx).to.emit(comptroller, "MarketEntered").withArgs(marketB.vToken.address, account.address);
      expect(await addresses()).to.deep.equal([marketA.vToken.address, marketB.vToken.address]);
    });

    it("returns NO_ERROR per market, which is what core tooling expects", async () => {
      const results = await comptroller
        .connect(account)
        .callStatic.enterMarkets([marketA.vToken.address, marketB.vToken.address]);

      expect(results.map(result => result.toNumber())).to.deep.equal([0, 0]);
    });

    it("accepts an empty list", async () => {
      await expect(comptroller.connect(account).enterMarkets([])).to.not.be.reverted;
      expect(await addresses()).to.deep.equal([]);
    });

    it("does not enter the same market twice", async () => {
      await comptroller.connect(account).enterMarkets([marketA.vToken.address]);

      // The second call is a no-op rather than an error, because the vToken hooks enter markets on the account's
      // behalf and cannot know whether it is already in.
      await expect(
        comptroller.connect(account).enterMarkets([marketA.vToken.address, marketA.vToken.address]),
      ).to.not.emit(comptroller, "MarketEntered");
      expect(await addresses()).to.deep.equal([marketA.vToken.address]);
    });

    it("rejects the whole list if any market is not listed, entering none of them", async () => {
      const unlisted = await smock.fake<VToken>("VToken");

      await expect(comptroller.connect(account).enterMarkets([marketA.vToken.address, unlisted.address]))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(unlisted.address);
      expect(await addresses()).to.deep.equal([]);
    });
  });

  describe("enterMarketBehalf", () => {
    it("enters the account rather than the caller", async () => {
      // The whole point of the function: a supply router mints with `mintBehalf` and collateralises in the same
      // transaction, so membership has to land on the supplier and not on the router that called it.
      await expect(comptroller.connect(router).enterMarketBehalf(marketA.vToken.address, account.address))
        .to.emit(comptroller, "MarketEntered")
        .withArgs(marketA.vToken.address, account.address);

      expect(await addresses()).to.deep.equal([marketA.vToken.address]);
      expect(await comptroller.getAssetsIn(router.address)).to.deep.equal([]);
    });

    it("is a no-op when the account is already in the market", async () => {
      await comptroller.connect(account).enterMarkets([marketA.vToken.address]);

      await expect(comptroller.connect(router).enterMarketBehalf(marketA.vToken.address, account.address)).to.not.emit(
        comptroller,
        "MarketEntered",
      );
      expect(await addresses()).to.deep.equal([marketA.vToken.address]);
    });

    it("rejects a market that is not listed", async () => {
      const unlisted = await smock.fake<VToken>("VToken");

      await expect(comptroller.connect(router).enterMarketBehalf(unlisted.address, account.address))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(unlisted.address);
    });

    it("rejects the zero account", async () => {
      await expect(
        comptroller.connect(router).enterMarketBehalf(marketA.vToken.address, ethers.constants.AddressZero),
      ).to.be.revertedWithCustomError(comptroller, "ZeroAddressNotAllowed");
    });

    it("respects the market's enter-market pause", async () => {
      await comptroller.setActionsPaused([marketA.vToken.address], [Action.ENTER_MARKET], true);

      await expect(comptroller.connect(router).enterMarketBehalf(marketA.vToken.address, account.address))
        .to.be.revertedWithCustomError(comptroller, "ActionPaused")
        .withArgs(marketA.vToken.address, Action.ENTER_MARKET);
    });
  });

  describe("exitMarket", () => {
    beforeEach(async () => {
      await setRiskWeights(comptroller, marketA, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await setRiskWeights(comptroller, marketB, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    });

    it("drops membership and the asset from the list", async () => {
      await givePosition(comptroller, account, [{ market: marketA, collateral: COLLATERAL }]);

      await expect(comptroller.connect(account).exitMarket(marketA.vToken.address))
        .to.emit(comptroller, "MarketExited")
        .withArgs(marketA.vToken.address, account.address);

      expect(await comptroller.checkMembership(account.address, marketA.vToken.address)).to.equal(false);
      expect(await addresses()).to.deep.equal([]);
    });

    it("does nothing for an account that was never in the market", async () => {
      await expect(comptroller.connect(account).exitMarket(marketA.vToken.address)).to.not.emit(
        comptroller,
        "MarketExited",
      );
    });

    it("refuses while the account still owes in that market", async () => {
      await givePosition(comptroller, account, [{ market: marketA, collateral: COLLATERAL, borrow: ONE }]);

      await expect(comptroller.connect(account).exitMarket(marketA.vToken.address)).to.be.revertedWithCustomError(
        comptroller,
        "NonzeroBorrowBalance",
      );
    });

    it("refuses to withdraw collateral another market's borrow depends on", async () => {
      // Exiting is a redeem of the whole balance as far as the liquidity check is concerned, so collateral backing
      // a live borrow cannot leave even though the borrow is in a different market.
      await givePosition(comptroller, account, [
        { market: marketA, collateral: COLLATERAL },
        { market: marketB, borrow: parseUnits("400", 18) },
      ]);

      await expect(comptroller.connect(account).exitMarket(marketA.vToken.address)).to.be.revertedWithCustomError(
        comptroller,
        "InsufficientLiquidity",
      );
    });

    it("allows the exit once the borrow is gone", async () => {
      await givePosition(comptroller, account, [
        { market: marketA, collateral: COLLATERAL },
        { market: marketB, borrow: parseUnits("400", 18) },
      ]);
      marketB.vToken.getAccountSnapshot.whenCalledWith(account.address).returns([0, 0, 0, ONE]);

      await expect(comptroller.connect(account).exitMarket(marketA.vToken.address)).to.emit(
        comptroller,
        "MarketExited",
      );
    });

    it("rejects a market this pool does not list", async () => {
      const unlisted = await smock.fake<VToken>("VToken");

      await expect(comptroller.connect(account).exitMarket(unlisted.address))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(unlisted.address);
    });

    it("surfaces a market that fails to report the account's position", async () => {
      // A nonzero error code from the vToken means the numbers behind it are meaningless, so nothing downstream is
      // allowed to use them.
      await givePosition(comptroller, account, [{ market: marketA, collateral: COLLATERAL }]);
      marketA.vToken.getAccountSnapshot.whenCalledWith(account.address).returns([1, 0, 0, ONE]);

      await expect(comptroller.connect(account).exitMarket(marketA.vToken.address))
        .to.be.revertedWithCustomError(comptroller, "SnapshotError")
        .withArgs(marketA.vToken.address, account.address);
    });
  });

  describe("the account's asset list", () => {
    beforeEach(async () => {
      await givePosition(comptroller, account, [{ market: marketA }, { market: marketB }, { market: marketC }]);
    });

    it("fills the hole left by an exit with the last entry", async () => {
      // Removal is a swap and pop, so the order after an exit is not the order the markets were entered in.
      // Nothing depends on that order, and this records it so a change to the removal is a deliberate one.
      await comptroller.connect(account).exitMarket(marketA.vToken.address);

      expect(await addresses()).to.deep.equal([marketC.vToken.address, marketB.vToken.address]);
    });

    it("leaves the remaining memberships intact", async () => {
      await comptroller.connect(account).exitMarket(marketB.vToken.address);

      expect(await comptroller.checkMembership(account.address, marketA.vToken.address)).to.equal(true);
      expect(await comptroller.checkMembership(account.address, marketB.vToken.address)).to.equal(false);
      expect(await comptroller.checkMembership(account.address, marketC.vToken.address)).to.equal(true);
    });

    it("appends a re-entered market at the end", async () => {
      await comptroller.connect(account).exitMarket(marketA.vToken.address);
      await comptroller.connect(account).enterMarkets([marketA.vToken.address]);

      expect(await addresses()).to.deep.equal([marketC.vToken.address, marketB.vToken.address, marketA.vToken.address]);
    });

    it("is empty for an account in no markets", async () => {
      const [, , stranger] = await ethers.getSigners();

      expect((await comptroller.getAssetsIn(stranger.address)).length).to.equal(0);
    });
  });

  describe("an unlisted market", () => {
    beforeEach(async () => {
      await givePosition(comptroller, account, [{ market: marketA }, { market: marketB }]);
      await unlistMarket(comptroller, marketA);
    });

    it("drops out of the account's assets, so no liquidity calculation reaches it", async () => {
      expect(await addresses()).to.deep.equal([marketB.vToken.address]);
    });

    it("stays in the stored list and keeps its membership flag", async () => {
      // Unlisting filters at the read rather than clearing state, so the account is still recorded as a member of a
      // market that no longer exists. Harmless while every path that matters reads through `getAssetsIn`, and the
      // reason a re-listed market does not need its holders to enter again.
      expect(await comptroller.accountAssets(account.address, 0)).to.equal(marketA.vToken.address);
      expect(await comptroller.checkMembership(account.address, marketA.vToken.address)).to.equal(true);
    });

    it("is still reported by getAllMarkets", async () => {
      // `allMarkets` is append-only: unlisting does not remove the entry, so consumers have to check `isListed`
      // themselves.
      const all = (await comptroller.getAllMarkets()).map(market => market.toString());

      expect(all).to.include(marketA.vToken.address);
      expect(await comptroller.isMarketListed(marketA.vToken.address)).to.equal(false);
    });
  });
});

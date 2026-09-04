import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { readFileSync } from "fs";
import { ethers } from "hardhat";
import { resolve } from "path";

import { SpokeComptroller } from "../../../typechain";
import { Action, ONE, SpokeFixture, TestMarket, deploySpokeComptroller } from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const MIN_CLOSE_FACTOR = parseUnits("0.05", 18);
const MAX_CLOSE_FACTOR = parseUnits("0.9", 18);
const MAX_COLLATERAL_FACTOR = parseUnits("0.95", 18);

describe("SpokeComptroller: errors, events and access control", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let marketA: TestMarket;
  let marketB: TestMarket;
  let stranger: SignerWithAddress;

  beforeEach(async () => {
    [, stranger] = await ethers.getSigners();
    fixture = await loadFixture(deploySpokeComptroller);
    fixture.resetPrices();
    ({ comptroller } = fixture);
    [marketA, marketB] = fixture.markets;
  });

  // Upstream `Comptroller` rejects each of these with a revert string. The fork replaced every one with a custom
  // error, which is both cheaper and smaller. These pin the replacement, so a re-sync against upstream cannot
  // quietly reintroduce a string or change which error a condition reports.
  describe("conditions upstream reported with revert strings", () => {
    it("rejects a close factor above the maximum", async () => {
      await expect(comptroller.setCloseFactor(MAX_CLOSE_FACTOR.add(1))).to.be.revertedWithCustomError(
        comptroller,
        "InvalidCloseFactor",
      );
    });

    it("rejects a close factor below the minimum with the same error", async () => {
      // Upstream distinguished the two bounds by message. The fork reports one error for both, so a caller learns
      // that the value is out of range but not which end it violated.
      await expect(comptroller.setCloseFactor(MIN_CLOSE_FACTOR.sub(1))).to.be.revertedWithCustomError(
        comptroller,
        "InvalidCloseFactor",
      );
    });

    it("accepts both bounds exactly", async () => {
      await comptroller.setCloseFactor(MIN_CLOSE_FACTOR);
      expect(await comptroller.closeFactorMantissa()).to.equal(MIN_CLOSE_FACTOR);

      await comptroller.setCloseFactor(MAX_CLOSE_FACTOR);
      expect(await comptroller.closeFactorMantissa()).to.equal(MAX_CLOSE_FACTOR);
    });

    it("rejects a market that does not identify itself as a vToken", async () => {
      marketB.vToken.isVToken.returns(false);
      const unlisted = await smock.fake("VToken");
      unlisted.isVToken.returns(false);

      await expect(
        comptroller.connect(fixture.poolRegistry.wallet).supportMarket(unlisted.address),
      ).to.be.revertedWithCustomError(comptroller, "InvalidVToken");
    });

    it("rejects a market that is already listed", async () => {
      await expect(comptroller.connect(fixture.poolRegistry.wallet).supportMarket(marketA.vToken.address))
        .to.be.revertedWithCustomError(comptroller, "MarketAlreadyListed")
        .withArgs(marketA.vToken.address);
    });

    it("rejects empty and mismatched arrays on both cap setters", async () => {
      for (const call of [
        comptroller.setMarketBorrowCaps([], []),
        comptroller.setMarketBorrowCaps([marketA.vToken.address], []),
        comptroller.setMarketSupplyCaps([], []),
        comptroller.setMarketSupplyCaps([marketA.vToken.address], []),
      ]) {
        await expect(call).to.be.revertedWithCustomError(comptroller, "InvalidArrayLength");
      }
    });

    it("rejects a rewards distributor the pool already has", async () => {
      const distributor = await smock.fake("RewardsDistributor");
      distributor.rewardToken.returns(marketA.underlying);
      await comptroller.addRewardsDistributor(distributor.address);

      await expect(comptroller.addRewardsDistributor(distributor.address)).to.be.revertedWithCustomError(
        comptroller,
        "RewardsDistributorAlreadyExists",
      );
    });

    it("refuses to pause an action on a market that is not listed", async () => {
      await expect(comptroller.setActionsPaused([stranger.address], [Action.MINT], true))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(stranger.address);
    });
  });

  describe("collateral factor and liquidation threshold bounds", () => {
    it("rejects a collateral factor above 0.95", async () => {
      await expect(
        comptroller.setCollateralFactor(marketA.vToken.address, MAX_COLLATERAL_FACTOR.add(1), ONE),
      ).to.be.revertedWithCustomError(comptroller, "InvalidCollateralFactor");
    });

    it("rejects a liquidation threshold above 1", async () => {
      await expect(
        comptroller.setCollateralFactor(marketA.vToken.address, parseUnits("0.5", 18), ONE.add(1)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationThreshold");
    });

    it("rejects a liquidation threshold below the collateral factor", async () => {
      await expect(
        comptroller.setCollateralFactor(marketA.vToken.address, parseUnits("0.5", 18), parseUnits("0.4", 18)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationThreshold");
    });

    it("rejects a nonzero collateral factor while the price is zero", async () => {
      fixture.setSpotPrice(marketA, 0);

      await expect(comptroller.setCollateralFactor(marketA.vToken.address, parseUnits("0.5", 18), ONE))
        .to.be.revertedWithCustomError(comptroller, "PriceError")
        .withArgs(marketA.vToken.address);
    });

    it("emits both events and stores both values", async () => {
      const collateralFactor = parseUnits("0.5", 18);
      const threshold = parseUnits("0.8", 18);

      const tx = comptroller.setCollateralFactor(marketA.vToken.address, collateralFactor, threshold);
      await expect(tx)
        .to.emit(comptroller, "NewCollateralFactor")
        .withArgs(marketA.vToken.address, 0, collateralFactor);
      await expect(tx).to.emit(comptroller, "NewLiquidationThreshold").withArgs(marketA.vToken.address, 0, threshold);

      const market = await comptroller.markets(marketA.vToken.address);
      expect(market.collateralFactorMantissa).to.equal(collateralFactor);
      expect(market.liquidationThresholdMantissa).to.equal(threshold);
    });
  });

  // A role string is hashed with the contract address into an ACM role, so it has to be exactly the string the
  // contract passes. A mismatch means the VIP that grants the permission never matches the call, and the only way
  // to catch that here is to deny the precise string and confirm the call is refused.
  describe("access control role strings", () => {
    const roles: { role: string; call: (c: MockContract<SpokeComptroller>, m: TestMarket) => Promise<unknown> }[] = [
      { role: "setCloseFactor(uint256)", call: c => c.setCloseFactor(parseUnits("0.5", 18)) },
      {
        role: "setCollateralFactor(address,uint256,uint256)",
        call: (c, m) => c.setCollateralFactor(m.vToken.address, parseUnits("0.5", 18), ONE),
      },
      { role: "setLiquidationIncentive(uint256)", call: c => c.setLiquidationIncentive(parseUnits("1.2", 18)) },
      {
        role: "setMarketBorrowCaps(address[],uint256[])",
        call: (c, m) => c.setMarketBorrowCaps([m.vToken.address], [ONE]),
      },
      {
        role: "setMarketSupplyCaps(address[],uint256[])",
        call: (c, m) => c.setMarketSupplyCaps([m.vToken.address], [ONE]),
      },
      {
        role: "setActionsPaused(address[],uint256[],bool)",
        call: (c, m) => c.setActionsPaused([m.vToken.address], [Action.MINT], true),
      },
      { role: "setMinLiquidatableCollateral(uint256)", call: c => c.setMinLiquidatableCollateral(ONE) },
      { role: "unlistMarket(address)", call: (c, m) => c.unlistMarket(m.vToken.address) },
      { role: "setForcedLiquidation(address,bool)", call: (c, m) => c.setForcedLiquidation(m.vToken.address, true) },
      {
        role: "setMarketLiquidationIncentive(address,uint256)",
        call: (c, m) => c.setMarketLiquidationIncentive(m.vToken.address, parseUnits("1.2", 18)),
      },
      {
        role: "setSupplyAllowlistEnabled(address,bool)",
        call: (c, m) => c.setSupplyAllowlistEnabled(m.vToken.address, true),
      },
      {
        role: "setAllowedSupplier(address,address,bool)",
        call: (c, m) => c.setAllowedSupplier(m.vToken.address, m.vToken.address, true),
      },
      { role: "setLiquidationAllowlistEnabled(bool)", call: c => c.setLiquidationAllowlistEnabled(true) },
      {
        role: "setAllowedLiquidator(address,bool)",
        call: (c, m) => c.setAllowedLiquidator(m.vToken.address, true),
      },
      {
        role: "enterMarketBehalf(address,address)",
        call: (c, m) => c.enterMarketBehalf(m.vToken.address, m.vToken.address),
      },
    ];

    for (const { role, call } of roles) {
      it(`gates ${role}`, async () => {
        fixture.acm.isAllowedToCall.whenCalledWith(stranger.address, role).returns(false);

        await expect(
          call(comptroller.connect(stranger) as MockContract<SpokeComptroller>, marketA),
        ).to.be.revertedWithCustomError(comptroller, "Unauthorized");
      });
    }

    it("covers every role string the contract checks", () => {
      // Read the strings straight out of the source rather than restating them, so adding an access-controlled
      // setter without a case above fails here instead of going untested.
      const source = readFileSync(resolve(__dirname, "../../../contracts/Spoke/SpokeComptroller.sol"), "utf8");
      const declared = new Set([...source.matchAll(/_checkAccessAllowed\("([^"]+)"\)/g)].map(m => m[1]));
      const covered = new Set(roles.map(r => r.role));

      expect([...declared].sort()).to.deep.equal([...covered].sort());
    });
  });

  // The vToken calls one of these as the last step of every successful operation. All seven are declared in
  // `ComptrollerInterface`, so none can be dropped, and all seven are no-ops here now that Prime is gone.
  describe("post-action verify hooks", () => {
    it("are all callable by anyone and change nothing", async () => {
      const calls = [
        comptroller.connect(stranger).mintVerify(marketA.vToken.address, stranger.address, ONE, ONE),
        comptroller.connect(stranger).redeemVerify(marketA.vToken.address, stranger.address, ONE, ONE),
        comptroller.connect(stranger).borrowVerify(marketA.vToken.address, stranger.address, ONE),
        comptroller
          .connect(stranger)
          .repayBorrowVerify(marketA.vToken.address, stranger.address, stranger.address, ONE, ONE),
        comptroller
          .connect(stranger)
          .liquidateBorrowVerify(
            marketA.vToken.address,
            marketB.vToken.address,
            stranger.address,
            stranger.address,
            ONE,
            ONE,
          ),
        comptroller
          .connect(stranger)
          .seizeVerify(marketA.vToken.address, marketB.vToken.address, stranger.address, stranger.address, ONE),
        comptroller.connect(stranger).transferVerify(marketA.vToken.address, stranger.address, stranger.address, ONE),
      ];

      for (const call of calls) {
        const receipt = await (await call).wait();
        // A no-op must not emit anything; an event here would mean a hook grew a side effect.
        expect(receipt.logs.length).to.equal(0);
      }
    });

    it("leaves the market state untouched", async () => {
      const before = await comptroller.markets(marketA.vToken.address);

      await comptroller.connect(stranger).mintVerify(marketA.vToken.address, stranger.address, ONE, ONE);
      await comptroller
        .connect(stranger)
        .seizeVerify(marketA.vToken.address, marketB.vToken.address, stranger.address, stranger.address, ONE);

      const after = await comptroller.markets(marketA.vToken.address);
      expect(after.isListed).to.equal(before.isListed);
      expect(after.collateralFactorMantissa).to.equal(before.collateralFactorMantissa);
      expect(after.liquidationThresholdMantissa).to.equal(before.liquidationThresholdMantissa);
    });
  });

  describe("Prime removal", () => {
    it("exposes no prime token surface", () => {
      // `setPrimeToken` and the `prime` getter existed upstream. Their absence from the ABI is what frees the
      // storage slot the gap reclaims, so a re-sync that reintroduced them would break the layout note.
      const names = Object.keys(comptroller.interface.functions).map(f => f.split("(")[0]);
      expect(names).to.not.include("setPrimeToken");
      expect(names).to.not.include("prime");
    });
  });

  describe("unlistMarket", () => {
    it("requires every action to be paused first", async () => {
      await expect(comptroller.unlistMarket(marketA.vToken.address)).to.be.revertedWithCustomError(
        comptroller,
        "BorrowActionNotPaused",
      );
    });

    it("requires the caps and collateral factor to be cleared", async () => {
      const actions = Object.values(Action);
      await comptroller.setActionsPaused([marketA.vToken.address], actions, true);

      // Supply and borrow caps are at max from the fixture.
      await expect(comptroller.unlistMarket(marketA.vToken.address)).to.be.revertedWithCustomError(
        comptroller,
        "BorrowCapIsNotZero",
      );

      await comptroller.setMarketBorrowCaps([marketA.vToken.address], [0]);
      await expect(comptroller.unlistMarket(marketA.vToken.address)).to.be.revertedWithCustomError(
        comptroller,
        "SupplyCapIsNotZero",
      );

      await comptroller.setMarketSupplyCaps([marketA.vToken.address], [0]);
      await comptroller.setCollateralFactor(marketA.vToken.address, parseUnits("0.5", 18), ONE);
      await expect(comptroller.unlistMarket(marketA.vToken.address)).to.be.revertedWithCustomError(
        comptroller,
        "CollateralFactorIsNotZero",
      );
    });

    it("unlists the market and emits the event once every precondition holds", async () => {
      await comptroller.setActionsPaused([marketA.vToken.address], Object.values(Action), true);
      await comptroller.setMarketBorrowCaps([marketA.vToken.address], [0]);
      await comptroller.setMarketSupplyCaps([marketA.vToken.address], [0]);

      await expect(comptroller.unlistMarket(marketA.vToken.address))
        .to.emit(comptroller, "MarketUnlisted")
        .withArgs(marketA.vToken.address);
      expect((await comptroller.markets(marketA.vToken.address)).isListed).to.equal(false);
    });
  });

  describe("updateDelegate", () => {
    it("rejects the zero address", async () => {
      await expect(comptroller.updateDelegate(constants.AddressZero, true)).to.be.revertedWithCustomError(
        comptroller,
        "ZeroAddressNotAllowed",
      );
    });

    it("rejects a write that does not change the value", async () => {
      await comptroller.updateDelegate(stranger.address, true);

      await expect(comptroller.updateDelegate(stranger.address, true)).to.be.revertedWithCustomError(
        comptroller,
        "DelegationStatusUnchanged",
      );
    });

    it("stores the value and emits an event", async () => {
      const [owner] = await ethers.getSigners();

      await expect(comptroller.updateDelegate(stranger.address, true))
        .to.emit(comptroller, "DelegateUpdated")
        .withArgs(owner.address, stranger.address, true);
      expect(await comptroller.approvedDelegates(owner.address, stranger.address)).to.equal(true);
    });
  });
});

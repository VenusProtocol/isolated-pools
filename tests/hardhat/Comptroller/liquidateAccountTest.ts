import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

interface AccountSnapshot {
  supply: BigNumberish;
  borrows: BigNumberish;
  exchangeRateMantissa?: BigNumberish;
}

const fakeUserSnapshot = (vToken: FakeContract<VToken>, user: string, snapshot: AccountSnapshot) => {
  const exchangeRateMantissa = snapshot.exchangeRateMantissa ?? parseUnits("1", 18);
  vToken.getAccountSnapshot.reset();
  vToken.getAccountSnapshot.whenCalledWith(user).returns([0, snapshot.supply, snapshot.borrows, exchangeRateMantissa]);
};

const fakeSnapshotsAtCalls = (vToken: FakeContract<VToken>, snapshots: AccountSnapshot[]) => {
  vToken.getAccountSnapshot.reset();
  snapshots.forEach((snapshot: AccountSnapshot, callIdx: number) => {
    const exchangeRateMantissa = snapshot.exchangeRateMantissa ?? parseUnits("1", 18);
    vToken.getAccountSnapshot.returnsAtCall(callIdx, [0, snapshot.supply, snapshot.borrows, exchangeRateMantissa]);
  });
};

const fakeSnaphotsForLiquidation = (
  vToken: FakeContract<VToken>,
  { beforeLiquidation, afterLiquidation }: { beforeLiquidation: AccountSnapshot; afterLiquidation: AccountSnapshot },
) => {
  fakeSnapshotsAtCalls(vToken, [beforeLiquidation, afterLiquidation]);
};

describe("liquidateAccount", () => {
  let liquidator: SignerWithAddress;
  let user: SignerWithAddress;

  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VToken>;
  let ZRX: FakeContract<VToken>;
  let BAT: FakeContract<VToken>;
  const maxLoopsLimit = 150;

  type LiquidateAccountFixture = {
    accessControl: FakeContract<AccessControlManager>;
    comptroller: MockContract<Comptroller>;
    oracle: FakeContract<PriceOracle>;
    OMG: FakeContract<VToken>;
    ZRX: FakeContract<VToken>;
    BAT: FakeContract<VToken>;
    allTokens: FakeContract<VToken>[];
    names: string[];
  };

  const liquidateAccountFixture = async (): Promise<LiquidateAccountFixture> => {
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
    await comptroller.setLiquidationIncentive(parseUnits("1.1", 18));
    await comptroller.setMinLiquidatableCollateral(parseUnits("100", 18));
    await setBalance(poolRegistry.address, parseEther("1"));
    const names = ["OMG", "ZRX", "BAT"];
    const [OMG, ZRX, BAT] = await Promise.all(
      names.map(async () => {
        const vToken = await smock.fake<VToken>("VToken");
        vToken.isVToken.returns(true);
        await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
        oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
        await comptroller
          .connect(poolRegistry.wallet)
          .setCollateralFactor(vToken.address, parseUnits("0.9", 18), parseUnits("0.9", 18));
        return vToken;
      }),
    );
    const allTokens = [OMG, ZRX, BAT];
    return { accessControl, comptroller, oracle, OMG, ZRX, BAT, allTokens, names };
  };

  const configure = ({ accessControl, oracle, allTokens, names }: LiquidateAccountFixture) => {
    accessControl.isAllowedToCall.returns(true);
    oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
    allTokens.map((vToken, i) => {
      vToken.isVToken.returns(true);
      vToken.symbol.returns(names[i]);
      vToken.name.returns(names[i]);
      vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
    });
  };

  beforeEach(async () => {
    [, liquidator, user] = await ethers.getSigners();
    const contracts = await loadFixture(liquidateAccountFixture);
    configure(contracts);
    ({ comptroller, OMG, ZRX, BAT } = contracts);
  });

  describe("collateral to borrows ratio requirements", async () => {
    it("fails if liquidation incentive * debt > collateral", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("1.05", 18), borrows: 0 });
      fakeUserSnapshot(ZRX, user.address, { supply: parseUnits("1.15", 18), borrows: parseUnits("5", 18) });
      fakeUserSnapshot(BAT, user.address, { supply: 0, borrows: parseUnits("1", 18) });

      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(parseUnits("6.6", 18), parseUnits("2.2", 18));
    });

    it("fails when liquidation incentive * debt == collateral", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("1.05", 18), borrows: 0 });
      fakeUserSnapshot(ZRX, user.address, { supply: parseUnits("1.15", 18), borrows: parseUnits("1", 18) });
      fakeUserSnapshot(BAT, user.address, { supply: 0, borrows: parseUnits("1", 18) });

      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(parseUnits("2.2", 18), parseUnits("2.2", 18));
    });

    it("fails if liquidation incentive * debt < collateral but there is no shortfall", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("50", 18), borrows: 0 });
      fakeUserSnapshot(ZRX, user.address, { supply: parseUnits("1.15", 18), borrows: parseUnits("1", 18) });
      fakeUserSnapshot(BAT, user.address, { supply: 0, borrows: parseUnits("1", 18) });

      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, [])).to.be.revertedWithCustomError(
        comptroller,
        "InsufficientShortfall",
      );
    });

    it("fails if collateral is larger than minLiquidatableCollateral", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("55", 18), borrows: 0 });
      fakeUserSnapshot(ZRX, user.address, { supply: parseUnits("55", 18), borrows: parseUnits("50", 18) });
      fakeUserSnapshot(BAT, user.address, { supply: 0, borrows: parseUnits("50", 18) });

      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, []))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs(parseUnits("100", 18), parseUnits("110", 18));
    });

    it("fails if the vToken account snapshot returns an error", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("1.11", 18), borrows: 0 });
      fakeUserSnapshot(BAT, user.address, { supply: 0, borrows: parseUnits("1", 18) });
      ZRX.getAccountSnapshot.reset();
      ZRX.getAccountSnapshot.whenCalledWith(user.address).returns([42, 0, 0, 0]);

      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, [])).to.be.revertedWithCustomError(
        comptroller,
        "SnapshotError",
      );
    });
  });

  describe("orders with unknown tokens", async () => {
    let unknownVToken: FakeContract<VToken>;

    beforeEach(async () => {
      await comptroller.connect(user).enterMarkets([OMG.address]);
      unknownVToken = await smock.fake<VToken>("VToken");
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("1.11", 18), borrows: parseUnits("1", 18) });
    });

    it("fails if collateral vToken is not listed", async () => {
      const ordersWithUnknownCollateral = [
        { vTokenCollateral: unknownVToken.address, vTokenBorrowed: ZRX.address, repayAmount: parseUnits("1", 18) },
        { vTokenCollateral: ZRX.address, vTokenBorrowed: BAT.address, repayAmount: parseUnits("1", 18) },
      ];
      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, ordersWithUnknownCollateral))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(unknownVToken.address);
    });

    it("fails if borrowed vToken is not listed", async () => {
      fakeUserSnapshot(OMG, user.address, { supply: parseUnits("1.11", 18), borrows: parseUnits("1", 18) });
      const ordersWithUnknownBorrow = [
        { vTokenCollateral: OMG.address, vTokenBorrowed: ZRX.address, repayAmount: parseUnits("1", 18) },
        { vTokenCollateral: ZRX.address, vTokenBorrowed: unknownVToken.address, repayAmount: parseUnits("1", 18) },
      ];
      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, ordersWithUnknownBorrow))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(unknownVToken.address);
    });
  });

  describe("liquidating in full", async () => {
    beforeEach(async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      for (const vToken of [OMG, ZRX, BAT]) {
        // We need to reset the call counts and arguments
        vToken.forceLiquidateBorrow.reset();
      }
    });

    it("succeeds and calls forceLiquidateBorrow for two orders", async () => {
      fakeSnaphotsForLiquidation(OMG, {
        beforeLiquidation: { supply: parseUnits("1.11", 18), borrows: 0 },
        afterLiquidation: { supply: parseUnits("0.01", 18), borrows: 0 },
      });
      fakeSnaphotsForLiquidation(ZRX, {
        beforeLiquidation: { supply: parseUnits("1.1", 18), borrows: parseUnits("1", 18) },
        afterLiquidation: { supply: 0, borrows: 0 },
      });
      fakeSnaphotsForLiquidation(BAT, {
        beforeLiquidation: { supply: 0, borrows: parseUnits("1", 18) },
        afterLiquidation: { supply: 0, borrows: 0 },
      });

      const liquidationOrders = [
        { vTokenCollateral: OMG.address, vTokenBorrowed: ZRX.address, repayAmount: parseUnits("1", 18) },
        { vTokenCollateral: ZRX.address, vTokenBorrowed: BAT.address, repayAmount: parseUnits("1", 18) },
      ];
      await comptroller.connect(liquidator).liquidateAccount(user.address, liquidationOrders);

      expect(ZRX.forceLiquidateBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        user.address,
        parseUnits("1", 18),
        OMG.address, // collateral
        true, // whether to skip liquidity check
      );
      expect(BAT.forceLiquidateBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        user.address,
        parseUnits("1", 18),
        ZRX.address, // collateral
        true, // whether to skip liquidity check
      );
      expect(OMG.getAccountSnapshot).to.have.been.calledTwice;
      expect(ZRX.getAccountSnapshot).to.have.been.calledTwice;
      expect(BAT.getAccountSnapshot).to.have.been.calledTwice;
    });

    it("succeeds and calls forceLiquidateBorrow for three orders, including in-kind liquidation", async () => {
      fakeSnaphotsForLiquidation(OMG, {
        beforeLiquidation: { supply: parseUnits("1.11", 18), borrows: 0 },
        afterLiquidation: { supply: parseUnits("0.021", 18), borrows: 0 },
      });
      fakeSnaphotsForLiquidation(ZRX, {
        beforeLiquidation: { supply: parseUnits("1.11", 18), borrows: parseUnits("1", 18) },
        afterLiquidation: { supply: 0, borrows: 0 },
      });
      fakeSnaphotsForLiquidation(BAT, {
        beforeLiquidation: { supply: 0, borrows: parseUnits("1", 18) },
        afterLiquidation: { supply: 0, borrows: 0 },
      });

      const liquidationOrders = [
        // Liquidate 1.0 ZRX, seizing ZRX. ZRX supply -> 0.011, ZRX borrows -> 0
        { vTokenCollateral: ZRX.address, vTokenBorrowed: ZRX.address, repayAmount: parseUnits("1", 18) },
        // Liquidate 0.01 BAT, seizing ZRX. ZRX supply -> 0, BAT borrows -> 0.99
        { vTokenCollateral: ZRX.address, vTokenBorrowed: BAT.address, repayAmount: parseUnits("0.01", 18) },
        // Liquidate 0.99 BAT, seizing OMG. OMG supply -> 0.021, BAT borrows -> 0
        { vTokenCollateral: OMG.address, vTokenBorrowed: BAT.address, repayAmount: parseUnits("0.99", 18) },
      ];
      await comptroller.connect(liquidator).liquidateAccount(user.address, liquidationOrders);

      // Liquidate ZRX seizing ZRX
      expect(ZRX.forceLiquidateBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        user.address,
        parseUnits("1", 18),
        ZRX.address, // collateral
        true, // whether to skip liquidity check
      );

      // Two liquidations for BAT borrows:
      // 1. Liquidate BAT seizing ZRX
      expect(BAT.forceLiquidateBorrow).to.have.been.calledTwice;
      expect(BAT.forceLiquidateBorrow.atCall(0)).to.have.been.calledWith(
        liquidator.address,
        user.address,
        parseUnits("0.01", 18),
        ZRX.address,
        true, // whether to skip liquidity check
      );
      // 2. Liquidate BAT seizing OMG
      expect(BAT.forceLiquidateBorrow.atCall(1)).to.have.been.calledWith(
        liquidator.address,
        user.address,
        parseUnits("0.99", 18),
        OMG.address, // collateral
        true, // whether to skip liquidity check
      );
      expect(OMG.getAccountSnapshot).to.have.been.calledTwice;
      expect(ZRX.getAccountSnapshot).to.have.been.calledTwice;
      expect(BAT.getAccountSnapshot).to.have.been.calledTwice;
    });
  });

  describe("post-liquidation check", async () => {
    it("fails if there's a borrow balance after liquidation", async () => {
      await comptroller.connect(user).enterMarkets([OMG.address, ZRX.address, BAT.address]);
      fakeSnaphotsForLiquidation(OMG, {
        beforeLiquidation: { supply: parseUnits("1.11", 18), borrows: 0 },
        afterLiquidation: { supply: parseUnits("0.01", 18), borrows: 0 },
      });
      fakeSnaphotsForLiquidation(ZRX, {
        beforeLiquidation: { supply: parseUnits("1.1", 18), borrows: parseUnits("1", 18) },
        afterLiquidation: { supply: 0, borrows: parseUnits("0.00000000000001", 18) },
      });
      fakeSnaphotsForLiquidation(BAT, {
        beforeLiquidation: { supply: 0, borrows: parseUnits("1", 18) },
        afterLiquidation: { supply: 0, borrows: 0 },
      });
      await expect(comptroller.connect(liquidator).liquidateAccount(user.address, [])).to.be.revertedWith(
        "Nonzero borrow balance after liquidation",
      );
    });
  });
});

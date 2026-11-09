import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { RewardsDistributor, SpokeComptroller, VToken } from "../../../typechain";
import {
  Action,
  ONE,
  SpokeFixture,
  TestMarket,
  deploySpokeComptroller,
  givePosition,
  setRiskWeights,
} from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const COLLATERAL = parseUnits("1000", 18);
const COLLATERAL_FACTOR = parseUnits("0.5", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);
const BORROW_INDEX = parseUnits("1.05", 18);
const SUPPLY_SPEED = parseUnits("3", 18);
const BORROW_SPEED = parseUnits("7", 18);

/// A distributor whose reward token address is distinguishable in assertions.
async function fakeDistributor(rewardToken: string): Promise<FakeContract<RewardsDistributor>> {
  const distributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
  distributor.rewardToken.returns(rewardToken);
  return distributor;
}

describe("SpokeComptroller: rewards distributors", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let collateral: TestMarket;
  let debt: TestMarket;
  let borrower: SignerWithAddress;
  let liquidator: SignerWithAddress;
  let distributor: FakeContract<RewardsDistributor>;

  beforeEach(async () => {
    [, borrower, liquidator] = await ethers.getSigners();
    fixture = await loadFixture(deploySpokeComptroller);
    fixture.resetPrices();
    ({ comptroller } = fixture);
    [collateral, debt] = fixture.markets;
    distributor = await fakeDistributor("0x000000000000000000000000000000000000dEaD");
  });

  describe("addRewardsDistributor", () => {
    it("initializes every listed market and reports the reward token", async () => {
      await expect(comptroller.addRewardsDistributor(distributor.address))
        .to.emit(comptroller, "NewRewardsDistributor")
        .withArgs(distributor.address, "0x000000000000000000000000000000000000dEaD");

      expect(distributor.initializeMarket).to.have.callCount(2);
      expect(distributor.initializeMarket).to.have.been.calledWith(collateral.vToken.address);
      expect(distributor.initializeMarket).to.have.been.calledWith(debt.vToken.address);
    });

    it("is restricted to the owner rather than to a role", async () => {
      // Every other setter on this contract goes through the AccessControlManager. This one is `onlyOwner`, which
      // on a live pool is the timelock rather than a role holder.
      await expect(comptroller.connect(borrower).addRewardsDistributor(distributor.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("records it in the pool's distributor list", async () => {
      await comptroller.addRewardsDistributor(distributor.address);
      const second = await fakeDistributor("0x000000000000000000000000000000000000bEEF");
      await comptroller.addRewardsDistributor(second.address);

      const listed = (await comptroller.getRewardDistributors()).map(address => address.toString());
      expect(listed).to.deep.equal([distributor.address, second.address]);
    });

    it("initializes a market listed after it was added", async () => {
      await comptroller.addRewardsDistributor(distributor.address);
      distributor.initializeMarket.reset();

      const late = await smock.fake<VToken>("VToken");
      late.isVToken.returns(true);
      await setBalance(fixture.poolRegistry.address, parseEther("1"));
      await comptroller.connect(fixture.poolRegistry.wallet).supportMarket(late.address);

      expect(distributor.initializeMarket).to.have.been.calledOnceWith(late.address);
    });
  });

  // Every hook that changes a balance has to move the flywheel for the accounts involved before the balance
  // changes, or the account accrues rewards at the wrong index. These pin which accounts each hook covers: the
  // hooks that move collateral cover both sides of the transfer, the borrow-side hooks cover the borrower only.
  describe("flywheel updates", () => {
    beforeEach(async () => {
      await comptroller.addRewardsDistributor(distributor.address);
      await setRiskWeights(comptroller, collateral, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await setRiskWeights(comptroller, debt, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      debt.vToken.borrowIndex.returns(BORROW_INDEX);
      await givePosition(comptroller, borrower, [
        { market: collateral, collateral: COLLATERAL },
        { market: debt, borrow: parseUnits("100", 18) },
      ]);
      distributor.updateRewardTokenSupplyIndex.reset();
      distributor.distributeSupplierRewardToken.reset();
      distributor.updateRewardTokenBorrowIndex.reset();
      distributor.distributeBorrowerRewardToken.reset();
    });

    it("credits the minter on the supply side", async () => {
      await comptroller.preMintHook(collateral.vToken.address, borrower.address, ONE);

      expect(distributor.updateRewardTokenSupplyIndex).to.have.been.calledOnceWith(collateral.vToken.address);
      expect(distributor.distributeSupplierRewardToken).to.have.been.calledOnceWith(
        collateral.vToken.address,
        borrower.address,
      );
    });

    it("credits the redeemer on the supply side", async () => {
      await comptroller.preRedeemHook(collateral.vToken.address, borrower.address, ONE);

      expect(distributor.updateRewardTokenSupplyIndex).to.have.been.calledOnceWith(collateral.vToken.address);
      expect(distributor.distributeSupplierRewardToken).to.have.been.calledOnceWith(
        collateral.vToken.address,
        borrower.address,
      );
    });

    it("credits the borrower at the market's current borrow index", async () => {
      await comptroller.connect(borrower).preBorrowHook(debt.vToken.address, borrower.address, ONE);

      expect(distributor.updateRewardTokenBorrowIndex).to.have.been.calledOnceWith(debt.vToken.address, [BORROW_INDEX]);
      expect(distributor.distributeBorrowerRewardToken).to.have.been.calledOnceWith(
        debt.vToken.address,
        borrower.address,
        [BORROW_INDEX],
      );
    });

    it("credits the borrower on a repayment too", async () => {
      await comptroller.preRepayHook(debt.vToken.address, borrower.address);

      expect(distributor.updateRewardTokenBorrowIndex).to.have.been.calledOnceWith(debt.vToken.address, [BORROW_INDEX]);
      expect(distributor.distributeBorrowerRewardToken).to.have.been.calledOnceWith(
        debt.vToken.address,
        borrower.address,
        [BORROW_INDEX],
      );
    });

    it("credits both sides of a seizure, since the collateral changes hands", async () => {
      await comptroller.preSeizeHook(
        collateral.vToken.address,
        debt.vToken.address,
        liquidator.address,
        borrower.address,
      );

      expect(distributor.updateRewardTokenSupplyIndex).to.have.been.calledOnceWith(collateral.vToken.address);
      expect(distributor.distributeSupplierRewardToken).to.have.callCount(2);
      expect(distributor.distributeSupplierRewardToken).to.have.been.calledWith(
        collateral.vToken.address,
        borrower.address,
      );
      expect(distributor.distributeSupplierRewardToken).to.have.been.calledWith(
        collateral.vToken.address,
        liquidator.address,
      );
    });

    it("credits both sides of a transfer", async () => {
      await comptroller.preTransferHook(collateral.vToken.address, borrower.address, liquidator.address, ONE);

      expect(distributor.updateRewardTokenSupplyIndex).to.have.been.calledOnceWith(collateral.vToken.address);
      expect(distributor.distributeSupplierRewardToken).to.have.callCount(2);
    });

    it("runs every distributor the pool has, not just the first", async () => {
      const second = await fakeDistributor("0x000000000000000000000000000000000000bEEF");
      await comptroller.addRewardsDistributor(second.address);

      await comptroller.preMintHook(collateral.vToken.address, borrower.address, ONE);

      expect(distributor.distributeSupplierRewardToken).to.have.callCount(1);
      expect(second.distributeSupplierRewardToken).to.have.callCount(1);
    });
  });

  describe("getRewardsByMarket", () => {
    it("is empty for a pool with no distributor", async () => {
      expect(await comptroller.getRewardsByMarket(collateral.vToken.address)).to.deep.equal([]);
      expect(await comptroller.getRewardDistributors()).to.deep.equal([]);
    });

    it("reports each distributor's token and both speeds for the market", async () => {
      distributor.rewardTokenSupplySpeeds.whenCalledWith(collateral.vToken.address).returns(SUPPLY_SPEED);
      distributor.rewardTokenBorrowSpeeds.whenCalledWith(collateral.vToken.address).returns(BORROW_SPEED);
      await comptroller.addRewardsDistributor(distributor.address);

      const [speeds] = await comptroller.getRewardsByMarket(collateral.vToken.address);

      expect(speeds.rewardToken).to.equal("0x000000000000000000000000000000000000dEaD");
      expect(speeds.supplySpeed).to.equal(SUPPLY_SPEED);
      expect(speeds.borrowSpeed).to.equal(BORROW_SPEED);
    });

    it("reports zero speeds for a market the distributor pays nothing on", async () => {
      await comptroller.addRewardsDistributor(distributor.address);

      const [speeds] = await comptroller.getRewardsByMarket(debt.vToken.address);

      expect(speeds.supplySpeed).to.equal(0);
      expect(speeds.borrowSpeed).to.equal(0);
    });
  });
});

/// Every unbounded loop in the contract is guarded by this limit. The pool it is set on has to start low for the
/// guard to be reachable at all, which is why these run against their own fixture.
describe("SpokeComptroller: max loops limit", () => {
  const LIMIT = 2;
  const tightLoops = () => deploySpokeComptroller({ maxLoopsLimit: LIMIT });

  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let marketA: TestMarket;
  let marketB: TestMarket;
  let stranger: SignerWithAddress;

  beforeEach(async () => {
    [, stranger] = await ethers.getSigners();
    fixture = await loadFixture(tightLoops);
    fixture.resetPrices();
    ({ comptroller } = fixture);
    [marketA, marketB] = fixture.markets;
  });

  it("can only be raised", async () => {
    // The setter refuses to lower it, so a pool that is given too high a limit cannot be walked back. Worth
    // knowing before a listing VIP picks the number.
    expect(await comptroller.maxLoopsLimit()).to.equal(LIMIT);

    await expect(comptroller.setMaxLoopsLimit(LIMIT)).to.be.revertedWith("Comptroller: Invalid maxLoopsLimit");
    await expect(comptroller.setMaxLoopsLimit(LIMIT - 1)).to.be.revertedWith("Comptroller: Invalid maxLoopsLimit");

    await expect(comptroller.setMaxLoopsLimit(LIMIT + 1))
      .to.emit(comptroller, "MaxLoopsLimitUpdated")
      .withArgs(LIMIT, LIMIT + 1);
  });

  it("is restricted to the owner", async () => {
    await expect(comptroller.connect(stranger).setMaxLoopsLimit(LIMIT + 1)).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });

  it("bounds the number of markets the pool can list", async () => {
    const third = await smock.fake<VToken>("VToken");
    third.isVToken.returns(true);
    await setBalance(fixture.poolRegistry.address, parseEther("1"));

    await expect(comptroller.connect(fixture.poolRegistry.wallet).supportMarket(third.address))
      .to.be.revertedWithCustomError(comptroller, "MaxLoopsLimitExceeded")
      .withArgs(LIMIT, LIMIT + 1);
  });

  it("bounds both cap setters by the number of markets in the call", async () => {
    const markets = [marketA.vToken.address, marketB.vToken.address, marketA.vToken.address];
    const values = [0, 0, 0];

    await expect(comptroller.setMarketBorrowCaps(markets, values))
      .to.be.revertedWithCustomError(comptroller, "MaxLoopsLimitExceeded")
      .withArgs(LIMIT, 3);
    await expect(comptroller.setMarketSupplyCaps(markets, values)).to.be.revertedWithCustomError(
      comptroller,
      "MaxLoopsLimitExceeded",
    );
  });

  it("bounds setActionsPaused by markets multiplied by actions", async () => {
    // Two markets against two actions is four iterations, so a limit of two rejects a call that looks small.
    await expect(
      comptroller.setActionsPaused(
        [marketA.vToken.address, marketB.vToken.address],
        [Action.MINT, Action.BORROW],
        true,
      ),
    )
      .to.be.revertedWithCustomError(comptroller, "MaxLoopsLimitExceeded")
      .withArgs(LIMIT, 4);
  });

  it("bounds the number of distributors the pool can hold", async () => {
    for (const token of ["0x000000000000000000000000000000000000dEaD", "0x000000000000000000000000000000000000bEEF"]) {
      await comptroller.addRewardsDistributor((await fakeDistributor(token)).address);
    }
    const third = await fakeDistributor("0x000000000000000000000000000000000000cAFE");

    await expect(comptroller.addRewardsDistributor(third.address))
      .to.be.revertedWithCustomError(comptroller, "MaxLoopsLimitExceeded")
      .withArgs(LIMIT, LIMIT + 1);
  });

  it("bounds a batch liquidation at half the number of orders", async () => {
    // The guard halves the count because a batch normally pairs each borrow with a collateral market, so the
    // effective limit is on markets touched rather than on orders placed.
    const order = {
      vTokenCollateral: marketA.vToken.address,
      vTokenBorrowed: marketB.vToken.address,
      repayAmount: ONE,
    };
    // Under water, below the collateral threshold, and still holding enough collateral to clear the debt at the
    // pool's incentive: the three checks the batch path runs before it reaches the loop guard.
    await setRiskWeights(comptroller, marketA, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    await givePosition(comptroller, stranger, [
      { market: marketA, collateral: parseUnits("10", 18) },
      { market: marketB, borrow: parseUnits("9", 18) },
    ]);

    await expect(comptroller.liquidateAccount(stranger.address, Array(6).fill(order)))
      .to.be.revertedWithCustomError(comptroller, "MaxLoopsLimitExceeded")
      .withArgs(LIMIT, 3);
  });
});

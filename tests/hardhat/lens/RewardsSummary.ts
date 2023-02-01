import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mineUpTo } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { Comptroller, MockToken, PoolLens, PoolLens__factory, RewardsDistributor, VToken } from "../../../typechain";

let comptroller: FakeContract<Comptroller>;
let vBUSD: FakeContract<VToken>;
let vWBTC: FakeContract<VToken>;
let rewardDistributor1: FakeContract<RewardsDistributor>;
let rewardToken1: FakeContract<MockToken>;
let rewardDistributor2: FakeContract<RewardsDistributor>;
let rewardToken2: FakeContract<MockToken>;
let rewardDistributor3: FakeContract<RewardsDistributor>;
let rewardToken3: FakeContract<MockToken>;
let poolLens: MockContract<PoolLens>;
let account: Signer;

type RewardsFixtire = {
  comptroller: FakeContract<Comptroller>;
  vBUSD: FakeContract<VToken>;
  vWBTC: FakeContract<VToken>;
  rewardDistributor1: FakeContract<RewardsDistributor>;
  rewardToken1: FakeContract<MockToken>;
  rewardDistributor2: FakeContract<RewardsDistributor>;
  rewardToken2: FakeContract<MockToken>;
  rewardDistributor3: FakeContract<RewardsDistributor>;
  rewardToken3: FakeContract<MockToken>;
  poolLens: MockContract<PoolLens>;
};

const rewardsFixture = async (): Promise<RewardsFixtire> => {
  comptroller = await smock.fake<Comptroller>("Comptroller");
  vBUSD = await smock.fake<VToken>("VToken");
  vWBTC = await smock.fake<VToken>("VToken");
  rewardDistributor1 = await smock.fake<RewardsDistributor>("RewardsDistributor");
  rewardDistributor2 = await smock.fake<RewardsDistributor>("RewardsDistributor");
  rewardDistributor3 = await smock.fake<RewardsDistributor>("RewardsDistributor");
  rewardToken1 = await smock.fake<MockToken>("MockToken");
  rewardToken2 = await smock.fake<MockToken>("MockToken");
  rewardToken3 = await smock.fake<MockToken>("MockToken");
  const poolLensFactory = await smock.mock<PoolLens__factory>("PoolLens");
  poolLens = await poolLensFactory.deploy();

  // Fake return values
  comptroller.getAllMarkets.returns([vBUSD.address, vWBTC.address]);
  comptroller.getRewardDistributors.returns([
    rewardDistributor1.address,
    rewardDistributor2.address,
    rewardDistributor3.address,
  ]);

  rewardDistributor1.rewardToken.returns(rewardToken1.address);
  rewardDistributor1.rewardTokenBorrowerIndex.returns(convertToUnit(1, 18));
  rewardDistributor1.rewardTokenSupplierIndex.returns(convertToUnit(1, 18));
  rewardDistributor1.rewardTokenAccrued.returns(convertToUnit(50, 18));
  rewardDistributor1.rewardTokenSupplySpeeds.whenCalledWith(vBUSD.address).returns(convertToUnit(0.5, 18));
  rewardDistributor1.rewardTokenSupplySpeeds.whenCalledWith(vWBTC.address).returns(convertToUnit(0.5, 18));
  rewardDistributor1.rewardTokenBorrowSpeeds.whenCalledWith(vBUSD.address).returns(convertToUnit(0.5, 18));
  rewardDistributor1.rewardTokenBorrowSpeeds.whenCalledWith(vWBTC.address).returns(convertToUnit(0.5, 18));
  rewardDistributor1.rewardTokenBorrowState.returns({
    index: convertToUnit(1, 18),
    block: 1,
  });
  rewardDistributor1.rewardTokenSupplyState.returns({
    index: convertToUnit(1, 18),
    block: 1,
  });

  rewardDistributor2.rewardToken.returns(rewardToken2.address);
  rewardDistributor2.rewardTokenBorrowerIndex.returns(convertToUnit(1, 18));
  rewardDistributor2.rewardTokenSupplierIndex.returns(convertToUnit(1, 18));
  rewardDistributor2.rewardTokenAccrued.returns(convertToUnit(50, 18));
  rewardDistributor2.rewardTokenSupplySpeeds.whenCalledWith(vBUSD.address).returns(convertToUnit(0.5, 18));
  rewardDistributor2.rewardTokenSupplySpeeds.whenCalledWith(vWBTC.address).returns(convertToUnit(0.5, 18));
  rewardDistributor2.rewardTokenBorrowSpeeds.whenCalledWith(vBUSD.address).returns(convertToUnit(0.5, 18));
  rewardDistributor2.rewardTokenBorrowSpeeds.whenCalledWith(vWBTC.address).returns(convertToUnit(0.5, 18));
  rewardDistributor2.rewardTokenBorrowState.returns({
    index: convertToUnit(1, 18),
    block: 1,
  });
  rewardDistributor2.rewardTokenSupplyState.returns({
    index: convertToUnit(1, 18),
    block: 1,
  });

  rewardDistributor3.rewardToken.returns(rewardToken3.address);
  rewardDistributor3.rewardTokenBorrowerIndex.returns(convertToUnit(1, 18));
  rewardDistributor3.rewardTokenSupplierIndex.returns(convertToUnit(1, 18));
  rewardDistributor3.rewardTokenAccrued.returns(convertToUnit(50, 18));
  rewardDistributor3.rewardTokenSupplySpeeds.whenCalledWith(vBUSD.address).returns(convertToUnit(0.5, 18));
  rewardDistributor3.rewardTokenSupplySpeeds.whenCalledWith(vWBTC.address).returns(convertToUnit(0.5, 18));
  rewardDistributor3.rewardTokenBorrowSpeeds.whenCalledWith(vBUSD.address).returns(convertToUnit(0.5, 18));
  rewardDistributor3.rewardTokenBorrowSpeeds.whenCalledWith(vWBTC.address).returns(convertToUnit(0.5, 18));
  rewardDistributor3.rewardTokenBorrowState.returns({
    index: convertToUnit(1, 18),
    block: 1,
  });
  rewardDistributor3.rewardTokenSupplyState.returns({
    index: convertToUnit(1, 18),
    block: 1,
  });

  vBUSD.borrowIndex.returns(convertToUnit(1, 18));
  vBUSD.totalBorrows.returns(convertToUnit(10000, 8));
  vBUSD.totalSupply.returns(convertToUnit(10000, 8));
  vBUSD.balanceOf.returns(convertToUnit(100, 8));
  vBUSD.borrowBalanceStored.returns(convertToUnit(100, 8));

  vWBTC.borrowIndex.returns(convertToUnit(1, 18));
  vWBTC.totalBorrows.returns(convertToUnit(100, 18));
  vWBTC.totalSupply.returns(convertToUnit(100, 18));
  vWBTC.balanceOf.returns(convertToUnit(100, 8));
  vWBTC.borrowBalanceStored.returns(convertToUnit(100, 8));

  return {
    comptroller,
    vBUSD,
    vWBTC,
    rewardDistributor1,
    rewardToken1,
    rewardDistributor2,
    rewardToken2,
    rewardDistributor3,
    rewardToken3,
    poolLens,
  };
};

describe("PoolLens: Rewards Summary", () => {
  beforeEach(async () => {
    [account] = await ethers.getSigners();
    ({
      comptroller,
      vBUSD,
      vWBTC,
      rewardDistributor1,
      rewardToken1,
      rewardDistributor2,
      rewardToken2,
      rewardDistributor3,
      rewardToken3,
      poolLens,
    } = await loadFixture(rewardsFixture));
  });
  it("Should get summary for all markets", async () => {
    // Mine some blocks so deltaBlocks != 0
    await mineUpTo(1000);

    const accountAddress = await account.getAddress();

    const pendingRewards = await poolLens.getPendingRewards(accountAddress, comptroller.address);
    expect(comptroller.getAllMarkets).to.have.been.calledOnce;
    expect(comptroller.getRewardDistributors).to.have.been.calledOnce;

    expect(rewardDistributor1.rewardToken).to.have.been.calledOnce;
    expect(rewardDistributor2.rewardToken).to.have.been.calledOnce;
    expect(rewardDistributor3.rewardToken).to.have.been.calledOnce;

    expect(rewardDistributor1.rewardTokenAccrued).to.have.been.calledOnce;
    expect(rewardDistributor2.rewardTokenAccrued).to.have.been.calledOnce;
    expect(rewardDistributor3.rewardTokenAccrued).to.have.been.calledOnce;

    // Should be called once per market
    expect(rewardDistributor1.rewardTokenBorrowState).to.have.been.callCount(2);
    expect(rewardDistributor2.rewardTokenBorrowState).to.have.been.callCount(2);
    expect(rewardDistributor3.rewardTokenBorrowState).to.have.been.callCount(2);

    expect(rewardDistributor1.rewardTokenSupplyState).to.have.been.callCount(2);
    expect(rewardDistributor2.rewardTokenSupplyState).to.have.been.callCount(2);
    expect(rewardDistributor3.rewardTokenSupplyState).to.have.been.callCount(2);

    // Should be called once per reward token configured
    expect(vBUSD.borrowIndex).to.have.been.callCount(3);
    expect(vWBTC.borrowIndex).to.have.been.callCount(3);

    // Should be called once per reward token configured
    expect(vBUSD.totalBorrows).to.have.been.callCount(3);
    expect(vWBTC.totalSupply).to.have.been.callCount(3);

    const EXPECTED_OUTPUT = [
      [
        rewardDistributor1.address,
        rewardToken1.address,
        BigNumber.from(convertToUnit(50, 18)),
        [
          [vBUSD.address, BigNumber.from(convertToUnit(9.99, 18))],
          [vWBTC.address, BigNumber.from(convertToUnit(0.0000000999, 18))],
        ],
      ],
      [
        rewardDistributor2.address,
        rewardToken2.address,
        BigNumber.from(convertToUnit(50, 18)),
        [
          [vBUSD.address, BigNumber.from(convertToUnit(9.99, 18))],
          [vWBTC.address, BigNumber.from(convertToUnit(0.0000000999, 18))],
        ],
      ],
      [
        rewardDistributor3.address,
        rewardToken3.address,
        BigNumber.from(convertToUnit(50, 18)),
        [
          [vBUSD.address, BigNumber.from(convertToUnit(9.99, 18))],
          [vWBTC.address, BigNumber.from(convertToUnit(0.0000000999, 18))],
        ],
      ],
    ];
    expect(pendingRewards).to.have.deep.members(EXPECTED_OUTPUT);
  });
});

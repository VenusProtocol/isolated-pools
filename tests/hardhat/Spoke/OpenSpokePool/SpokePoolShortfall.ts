import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, ContractTransaction, constants } from "ethers";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  FaucetTokenReEntrantHarness__factory,
  IBondAccount,
  MockDeflatingToken__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  SpokeBondManager,
  SpokeComptroller,
  SpokePoolManager,
  SpokePoolShortfall,
  SpokePoolShortfall__factory,
  VToken,
} from "../../../../typechain";
import { NO_ESTIMATE, deployProxy, e18, resetFakes } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const BAD_DEBT = e18("100");
/// 100 repaid at $2 is $200, paid as 50 of the bond asset at $4
const SEIZED = e18("50");

/// Transactions whose fake calls a test counts are sent with NO_ESTIMATE, so gas estimation does not record them too
describe("SpokePoolShortfall", () => {
  let owner: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let bondAsset: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let manager: FakeContract<SpokePoolManager>;
  let bondManager: FakeContract<SpokeBondManager>;
  let bondAccount: FakeContract<IBondAccount>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let comptroller: FakeContract<SpokeComptroller>;
  let vToken: FakeContract<VToken>;
  let underlying: MockToken;
  let shortfall: SpokePoolShortfall;

  /// The fakes' default behaviour, reapplied before every test
  const programFakes = () => {
    acm.isAllowedToCall.returns(true);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    manager.bondManager.returns(bondManager.address);
    bondManager.bondAccounts.whenCalledWith(comptroller.address).returns(bondAccount.address);
    bondAccount.asset.returns(bondAsset.address);
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(e18("2"));
    oracle.getPrice.whenCalledWith(bondAsset.address).returns(e18("4"));
    comptroller.isMarketListed.whenCalledWith(vToken.address).returns(true);
    vToken.comptroller.returns(comptroller.address);
    vToken.underlying.returns(underlying.address);
    vToken.badDebt.returns(BAD_DEBT);
  };

  const deployFixture = async () => {
    [owner, recoverer, bondAsset] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    bondManager = await smock.fake<SpokeBondManager>("SpokeBondManager");
    bondAccount = await smock.fake<IBondAccount>("IBondAccount");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
    vToken = await smock.fake<VToken>("VToken");
    underlying = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    programFakes();

    shortfall = await deployProxy(await new SpokePoolShortfall__factory(owner).deploy(manager.address), acm.address);
    await underlying.connect(recoverer).faucet(BAD_DEBT.mul(2));
    await underlying.connect(recoverer).approve(shortfall.address, constants.MaxUint256);
  };

  beforeEach(async () => {
    await loadFixture(deployFixture);
    resetFakes(acm, manager, bondManager, bondAccount, oracle, comptroller, vToken);
    programFakes();
  });

  /// Denies `signature` to `caller` and expects `call` to revert with Unauthorized.
  const expectUnauthorized = async (caller: SignerWithAddress, signature: string, call: () => Promise<unknown>) => {
    acm.isAllowedToCall.whenCalledWith(caller.address, signature).returns(false);
    await expect(call())
      .to.be.revertedWithCustomError(shortfall, "Unauthorized")
      .withArgs(caller.address, shortfall.address, signature);
  };

  /// Expects `tx` to have moved `amount` of the underlying from the recoverer to the market and told the market once.
  const expectRepaid = async (tx: ContractTransaction, amount: BigNumber) => {
    await expect(tx).to.changeTokenBalances(underlying, [recoverer, vToken], [amount.mul(-1), amount]);
    expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(amount);
  };

  /// Makes the market's underlying a token that delivers less than it is sent, funded and approved like `underlying`.
  const useDeflatingUnderlying = async () => {
    const deflating = await new MockDeflatingToken__factory(owner).deploy(BAD_DEBT.mul(2));
    await deflating.transfer(recoverer.address, BAD_DEBT.mul(2));
    await deflating.connect(recoverer).approve(shortfall.address, constants.MaxUint256);
    vToken.underlying.returns(deflating.address);
    return deflating;
  };

  describe("constructor and initialize", () => {
    it("reverts when the manager is the zero address", async () => {
      const factory = await ethers.getContractFactory<SpokePoolShortfall__factory>("SpokePoolShortfall");
      await expect(factory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the manager, owner and access control manager", async () => {
      expect(await shortfall.SPOKE_POOL_MANAGER()).to.equal(manager.address);
      expect(await shortfall.owner()).to.equal(owner.address);
      expect(await shortfall.accessControlManager()).to.equal(acm.address);
    });

    it("cannot be initialized twice", async () => {
      await expect(shortfall.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("cannot initialize the implementation", async () => {
      const implementation = await new SpokePoolShortfall__factory(owner).deploy(manager.address);
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("recoverBadDebt", () => {
    it("reverts unless the caller is allowed", async () => {
      await expectUnauthorized(recoverer, "recoverBadDebt(address,uint256)", () =>
        shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT),
      );
    });

    it("reverts on a market its comptroller does not list", async () => {
      comptroller.isMarketListed.whenCalledWith(vToken.address).returns(false);
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT))
        .to.be.revertedWithCustomError(shortfall, "MarketNotListed")
        .withArgs(vToken.address);
    });

    it("repays the bad debt, then pays the recoverer its worth from the bond and returns the amount paid", async () => {
      const tx = await shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, SEIZED);
      await expectRepaid(tx, BAD_DEBT);
      expect(manager.seizeBond).to.have.been.calledOnceWith(comptroller.address, SEIZED, recoverer.address);
      expect(vToken.badDebtRecovered).to.have.been.calledBefore(manager.seizeBond);

      expect(await shortfall.connect(recoverer).callStatic.recoverBadDebt(vToken.address, BAD_DEBT)).to.equal(SEIZED);
    });

    it("caps the amount at the market's bad debt", async () => {
      const tx = await shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT.mul(2), NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, SEIZED);
      await expectRepaid(tx, BAD_DEBT);
      expect(manager.seizeBond).to.have.been.calledOnceWith(comptroller.address, SEIZED, recoverer.address);
    });

    it("pays one for one when the bond is in the market's asset", async () => {
      bondAccount.asset.returns(underlying.address);
      oracle.getPrice.whenCalledWith(underlying.address).returns(e18("2"));

      const tx = await shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, BAD_DEBT);
      await expectRepaid(tx, BAD_DEBT);
      expect(manager.seizeBond).to.have.been.calledOnceWith(comptroller.address, BAD_DEBT, recoverer.address);
    });

    it("skips the bond when the payout rounds to zero", async () => {
      const tx = await shortfall.connect(recoverer).recoverBadDebt(vToken.address, 1, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, 1, 0);
      await expectRepaid(tx, BigNumber.from(1));
      expect(manager.seizeBond).to.not.have.been.called;
    });

    it("repays and seizes nothing when the market has no bad debt", async () => {
      vToken.badDebt.returns(0);

      const tx = await shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, 0, 0);
      await expectRepaid(tx, constants.Zero);
      expect(manager.seizeBond).to.not.have.been.called;
    });

    it("reverts without data when the pool has no live bond", async () => {
      // `asset()` on the zero address returns no data, which fails to decode
      bondManager.bondAccounts.whenCalledWith(comptroller.address).returns(constants.AddressZero);
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWithoutReason();
    });

    it("reverts with a division by zero when the bond asset's price is zero", async () => {
      oracle.getPrice.whenCalledWith(bondAsset.address).returns(0);
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWithPanic(0x12);
    });

    it("reverts when the oracle cannot price the debt", async () => {
      oracle.getUnderlyingPrice.whenCalledWith(vToken.address).reverts("invalid resilient oracle price");
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
        "invalid resilient oracle price",
      );
    });

    it("reverts when the oracle cannot price the bond asset", async () => {
      oracle.getPrice.whenCalledWith(bondAsset.address).reverts("invalid resilient oracle price");
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
        "invalid resilient oracle price",
      );
    });

    it("reverts when the manager cannot seize the payout", async () => {
      manager.seizeBond.reverts("bond too small");
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
        "bond too small",
      );
    });

    it("reverts when the market receives less than the amount", async () => {
      const deflating = await useDeflatingUnderlying();
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT))
        .to.be.revertedWithCustomError(shortfall, "TransferAmountMismatch")
        .withArgs(deflating.address);
    });

    it("reverts when the market rejects the repayment", async () => {
      vToken.badDebtRecovered.reverts("amount exceeds bad debt");
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
        "amount exceeds bad debt",
      );
    });
  });

  describe("repayBadDebt", () => {
    it("reverts unless the caller is allowed", async () => {
      await expectUnauthorized(recoverer, "repayBadDebt(address,uint256)", () =>
        shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT),
      );
    });

    it("repays the bad debt with the caller's funds, on any market, leaving the bond untouched", async () => {
      const tx = await shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT);
      await expectRepaid(tx, BAD_DEBT);
      expect(comptroller.isMarketListed).to.not.have.been.called;
      expect(bondManager.bondAccounts).to.not.have.been.called;
      expect(oracle.getUnderlyingPrice).to.not.have.been.called;
      expect(manager.seizeBond).to.not.have.been.called;
    });

    it("caps the amount at the market's bad debt", async () => {
      const tx = await shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT.mul(2), NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT);
      await expectRepaid(tx, BAD_DEBT);
    });

    it("repays nothing when the market has no bad debt", async () => {
      vToken.badDebt.returns(0);

      const tx = await shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vToken.address, recoverer.address, 0);
      await expectRepaid(tx, constants.Zero);
    });

    it("reverts when the market receives less than the amount", async () => {
      const deflating = await useDeflatingUnderlying();
      await expect(shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT))
        .to.be.revertedWithCustomError(shortfall, "TransferAmountMismatch")
        .withArgs(deflating.address);
    });

    it("reverts when the market rejects the repayment", async () => {
      vToken.badDebtRecovered.reverts("amount exceeds bad debt");
      await expect(shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
        "amount exceeds bad debt",
      );
    });
  });

  describe("reentrancy", () => {
    const functions = ["recoverBadDebt", "repayBadDebt"] as const;
    for (const outer of functions) {
      for (const inner of functions) {
        it(`rejects re-entry from ${outer} into ${inner}`, async () => {
          // An underlying that calls back into the shortfall while the shortfall pulls it
          const token = await new FaucetTokenReEntrantHarness__factory(owner).deploy(
            0,
            "Re-entrant",
            18,
            "RE",
            shortfall.interface.encodeFunctionData(inner, [vToken.address, BAD_DEBT]),
            "transferFrom",
          );
          vToken.underlying.returns(token.address);

          await expect(shortfall.connect(recoverer)[outer](vToken.address, BAD_DEBT)).to.be.revertedWith(
            "ReentrancyGuard: reentrant call",
          );
        });
      }
    }
  });
});

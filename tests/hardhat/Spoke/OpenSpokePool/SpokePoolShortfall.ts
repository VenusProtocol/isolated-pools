import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";

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
import { NO_ESTIMATE, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const BAD_DEBT = e18("100");
/// 100 repaid at $2 is $200, paid as 50 of the bond asset at $4
const SEIZED = e18("50");
const PAID_NOW = e18("30");

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

  beforeEach(async () => {
    [owner, recoverer, bondAsset] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    bondManager = await smock.fake<SpokeBondManager>("SpokeBondManager");
    bondAccount = await smock.fake<IBondAccount>("IBondAccount");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
    vToken = await smock.fake<VToken>("VToken");
    underlying = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);

    acm.isAllowedToCall.returns(true);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    manager.bondManager.returns(bondManager.address);
    manager.seizeBond.returns(PAID_NOW);
    bondManager.bondAccounts.whenCalledWith(comptroller.address).returns(bondAccount.address);
    bondAccount.asset.returns(bondAsset.address);
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(e18("2"));
    oracle.getPrice.whenCalledWith(bondAsset.address).returns(e18("4"));
    comptroller.isMarketListed.whenCalledWith(vToken.address).returns(true);
    vToken.comptroller.returns(comptroller.address);
    vToken.underlying.returns(underlying.address);
    vToken.badDebt.returns(BAD_DEBT);

    shortfall = (await upgrades.deployProxy(await ethers.getContractFactory("SpokePoolShortfall"), [acm.address], {
      constructorArgs: [manager.address],
    })) as SpokePoolShortfall;
    await underlying.connect(recoverer).faucet(BAD_DEBT.mul(2));
    await underlying.connect(recoverer).approve(shortfall.address, constants.MaxUint256);
  });

  /// Denies `signature` to `caller` and expects `call` to revert with Unauthorized.
  const expectUnauthorized = async (caller: SignerWithAddress, signature: string, call: () => Promise<unknown>) => {
    acm.isAllowedToCall.whenCalledWith(caller.address, signature).returns(false);
    await expect(call())
      .to.be.revertedWithCustomError(shortfall, "Unauthorized")
      .withArgs(caller.address, shortfall.address, signature);
  };

  /// Makes the market's underlying a token that delivers less than it is sent.
  const useDeflatingUnderlying = async () => {
    const deflating = await new MockDeflatingToken__factory(owner).deploy(BAD_DEBT.mul(2));
    await deflating.transfer(recoverer.address, BAD_DEBT.mul(2));
    await deflating.connect(recoverer).approve(shortfall.address, BAD_DEBT);
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

    it("returns the bond asset paid now", async () => {
      expect(await shortfall.connect(recoverer).callStatic.recoverBadDebt(vToken.address, BAD_DEBT)).to.equal(PAID_NOW);
    });

    it("repays the bad debt, then pays the recoverer its worth from the bond", async () => {
      const tx = shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, SEIZED, PAID_NOW);
      await expect(tx).to.changeTokenBalances(underlying, [recoverer, vToken], [BAD_DEBT.mul(-1), BAD_DEBT]);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(BAD_DEBT);
      expect(manager.seizeBond).to.have.been.calledOnceWith(comptroller.address, SEIZED, recoverer.address);
      expect(vToken.badDebtRecovered).to.have.been.calledBefore(manager.seizeBond);
    });

    it("caps the amount at the market's bad debt", async () => {
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT.mul(2), NO_ESTIMATE))
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, SEIZED, PAID_NOW);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(BAD_DEBT);
      expect(manager.seizeBond).to.have.been.calledOnceWith(comptroller.address, SEIZED, recoverer.address);
    });

    it("pays one for one when the bond is in the market's asset", async () => {
      bondAccount.asset.returns(underlying.address);
      oracle.getPrice.whenCalledWith(underlying.address).returns(e18("2"));

      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE))
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, BAD_DEBT, PAID_NOW);
      expect(manager.seizeBond).to.have.been.calledOnceWith(comptroller.address, BAD_DEBT, recoverer.address);
    });

    it("skips the bond when the payout rounds to zero", async () => {
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, 1, NO_ESTIMATE))
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, 1, 0, 0);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(1);
      expect(manager.seizeBond).to.not.have.been.called;
    });

    it("repays and seizes nothing when the market has no bad debt", async () => {
      vToken.badDebt.returns(0);

      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE))
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, 0, 0, 0);
      expect(manager.seizeBond).to.not.have.been.called;
    });

    it("reverts without data when the pool has no live bond", async () => {
      bondManager.bondAccounts.whenCalledWith(comptroller.address).returns(constants.AddressZero);
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWithoutReason();
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

    it("reverts on a market its comptroller does not list", async () => {
      comptroller.isMarketListed.whenCalledWith(vToken.address).returns(false);
      await expect(shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT))
        .to.be.revertedWithCustomError(shortfall, "MarketNotListed")
        .withArgs(vToken.address);
    });

    it("repays the bad debt with the caller's funds, leaving the bond untouched", async () => {
      const tx = shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT);
      await expect(tx).to.changeTokenBalances(underlying, [recoverer, vToken], [BAD_DEBT.mul(-1), BAD_DEBT]);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(BAD_DEBT);
      expect(manager.seizeBond).to.not.have.been.called;
      expect(oracle.getUnderlyingPrice).to.not.have.been.called;
    });

    it("caps the amount at the market's bad debt", async () => {
      const tx = shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT.mul(2), NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT);
      await expect(tx).to.changeTokenBalances(underlying, [recoverer, vToken], [BAD_DEBT.mul(-1), BAD_DEBT]);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(BAD_DEBT);
    });

    it("reverts when the market receives less than the amount", async () => {
      const deflating = await useDeflatingUnderlying();
      await expect(shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT))
        .to.be.revertedWithCustomError(shortfall, "TransferAmountMismatch")
        .withArgs(deflating.address);
    });
  });

  describe("reentrancy", () => {
    for (const name of ["recoverBadDebt", "repayBadDebt"] as const) {
      it(`rejects re-entry into ${name}`, async () => {
        // An underlying that calls back into the shortfall while the shortfall pulls it
        const token = await new FaucetTokenReEntrantHarness__factory(owner).deploy(
          0,
          "Re-entrant",
          18,
          "RE",
          shortfall.interface.encodeFunctionData(name, [vToken.address, BAD_DEBT]),
          "transferFrom",
        );
        vToken.underlying.returns(token.address);

        await expect(shortfall.connect(recoverer)[name](vToken.address, BAD_DEBT)).to.be.revertedWith(
          "ReentrancyGuard: reentrant call",
        );
      });
    }
  });
});

import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  FaucetTokenReEntrantHarness__factory,
  MockDeflatingToken__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokePoolManager,
  SpokePoolShortfall,
  SpokePoolShortfall__factory,
  VToken,
} from "../../../../typechain";
import { NO_ESTIMATE, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const INCENTIVE = e18("1.1");
const BAD_DEBT = e18("100");
/// 100 repaid at $2 with a 1.1 incentive is $220, paid as 55 XVS at $4
const PAYOUT = e18("55");

describe("SpokePoolShortfall", () => {
  let owner: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let xvs: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let manager: FakeContract<SpokePoolManager>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let comptroller: FakeContract<SpokeComptroller>;
  let vToken: FakeContract<VToken>;
  let underlying: MockToken;
  let shortfall: SpokePoolShortfall;

  const deployShortfall = async () =>
    (await upgrades.deployProxy(await ethers.getContractFactory("SpokePoolShortfall"), [acm.address], {
      constructorArgs: [manager.address, xvs.address],
    })) as SpokePoolShortfall;

  beforeEach(async () => {
    [owner, recoverer, xvs] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
    vToken = await smock.fake<VToken>("VToken");
    underlying = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);

    acm.isAllowedToCall.returns(true);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(e18("2"));
    oracle.getPrice.whenCalledWith(xvs.address).returns(e18("4"));
    comptroller.isMarketListed.whenCalledWith(vToken.address).returns(true);
    vToken.comptroller.returns(comptroller.address);
    vToken.underlying.returns(underlying.address);

    shortfall = await deployShortfall();
    await underlying.connect(recoverer).faucet(BAD_DEBT);
    await underlying.connect(recoverer).approve(shortfall.address, BAD_DEBT);
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
      await expect(factory.deploy(constants.AddressZero, xvs.address)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("reverts when XVS is the zero address", async () => {
      const factory = await ethers.getContractFactory<SpokePoolShortfall__factory>("SpokePoolShortfall");
      await expect(factory.deploy(manager.address, constants.AddressZero)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the manager, XVS, owner and access control manager", async () => {
      expect(await shortfall.SPOKE_POOL_MANAGER()).to.equal(manager.address);
      expect(await shortfall.XVS()).to.equal(xvs.address);
      expect(await shortfall.owner()).to.equal(owner.address);
      expect(await shortfall.accessControlManager()).to.equal(acm.address);
      expect(await shortfall.badDebtRecoveryIncentiveMantissa()).to.equal(0);
    });

    it("cannot be initialized twice", async () => {
      await expect(shortfall.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("cannot initialize the implementation", async () => {
      const implementation = await new SpokePoolShortfall__factory(owner).deploy(manager.address, xvs.address);
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("recoverBadDebt", () => {
    beforeEach(async () => {
      await shortfall.setBadDebtRecoveryIncentive(INCENTIVE);
    });

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

    it("returns the XVS paid", async () => {
      expect(await shortfall.connect(recoverer).callStatic.recoverBadDebt(vToken.address, BAD_DEBT)).to.equal(PAYOUT);
    });

    it("repays the bad debt and pays the recoverer from the pool's stake", async () => {
      const tx = shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, PAYOUT);
      await expect(tx).to.changeTokenBalances(underlying, [recoverer, vToken], [BAD_DEBT.mul(-1), BAD_DEBT]);
      expect(manager.seizeStake).to.have.been.calledOnceWith(comptroller.address, PAYOUT, recoverer.address);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(BAD_DEBT);
    });

    it("rounds the payout down", async () => {
      // 3 repaid at $2 with a 1.1 incentive is $6.6, or 1.65 XVS wei at $4
      expect(await shortfall.connect(recoverer).callStatic.recoverBadDebt(vToken.address, 3)).to.equal(1);
    });

    it("takes nothing from the stake when the payout rounds to zero", async () => {
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, 1, NO_ESTIMATE))
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, 1, 0);
      expect(manager.seizeStake).to.not.have.been.called;
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(1);
    });

    it("pays nothing before the incentive is set", async () => {
      shortfall = await deployShortfall();
      await underlying.connect(recoverer).approve(shortfall.address, BAD_DEBT);

      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT))
        .to.emit(shortfall, "BadDebtRecovered")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT, 0);
      expect(manager.seizeStake).to.not.have.been.called;
    });

    it("reverts when the manager cannot seize the payout", async () => {
      manager.seizeStake.reverts("stake too low");
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
        "stake too low",
      );
    });

    it("reverts when the market receives less than the amount", async () => {
      const deflating = await useDeflatingUnderlying();
      await expect(shortfall.connect(recoverer).recoverBadDebt(vToken.address, BAD_DEBT))
        .to.be.revertedWithCustomError(shortfall, "TransferAmountMismatch")
        .withArgs(deflating.address);
    });

    it("reverts when the market rejects the amount", async () => {
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

    it("repays the bad debt with the caller's funds, taking nothing from the stake", async () => {
      const tx = shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT, NO_ESTIMATE);

      await expect(tx)
        .to.emit(shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vToken.address, recoverer.address, BAD_DEBT);
      await expect(tx).to.changeTokenBalances(underlying, [recoverer, vToken], [BAD_DEBT.mul(-1), BAD_DEBT]);
      expect(vToken.badDebtRecovered).to.have.been.calledOnceWith(BAD_DEBT);
      expect(manager.seizeStake).to.not.have.been.called;
      expect(oracle.getUnderlyingPrice).to.not.have.been.called;
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

        await expect(shortfall.connect(recoverer).repayBadDebt(vToken.address, BAD_DEBT)).to.be.revertedWith(
          "ReentrancyGuard: reentrant call",
        );
      });
    }
  });

  describe("setBadDebtRecoveryIncentive", () => {
    it("reverts unless the caller is allowed", async () => {
      await expectUnauthorized(recoverer, "setBadDebtRecoveryIncentive(uint256)", () =>
        shortfall.connect(recoverer).setBadDebtRecoveryIncentive(INCENTIVE),
      );
    });

    it("reverts below 100%", async () => {
      await expect(shortfall.setBadDebtRecoveryIncentive(e18("1").sub(1))).to.be.revertedWithCustomError(
        shortfall,
        "InvalidBadDebtRecoveryIncentive",
      );
    });

    it("reverts above the maximum", async () => {
      await expect(shortfall.setBadDebtRecoveryIncentive(e18("1.5").add(1))).to.be.revertedWithCustomError(
        shortfall,
        "InvalidBadDebtRecoveryIncentive",
      );
    });

    it("sets incentives at both bounds", async () => {
      await expect(shortfall.setBadDebtRecoveryIncentive(e18("1")))
        .to.emit(shortfall, "BadDebtRecoveryIncentiveUpdated")
        .withArgs(0, e18("1"));
      await expect(shortfall.setBadDebtRecoveryIncentive(e18("1.5")))
        .to.emit(shortfall, "BadDebtRecoveryIncentiveUpdated")
        .withArgs(e18("1"), e18("1.5"));
      expect(await shortfall.badDebtRecoveryIncentiveMantissa()).to.equal(e18("1.5"));
      expect(await shortfall.MAX_BAD_DEBT_RECOVERY_INCENTIVE_MANTISSA()).to.equal(e18("1.5"));
    });
  });
});

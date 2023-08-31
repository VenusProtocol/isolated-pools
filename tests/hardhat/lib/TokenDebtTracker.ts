import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ERC20Harness,
  ERC20Harness__factory,
  FaucetNonStandardToken__factory,
  TokenDebtTrackerHarness,
  TokenDebtTrackerHarness__factory,
} from "../../../typechain";

const { expect } = chai;

const INITIAL_SUPPLY = parseUnits("1000000", 18);

interface Fixture {
  tokenDebtTracker: TokenDebtTrackerHarness;
  token: ERC20Harness;
}

const fixture = async (): Promise<Fixture> => {
  const factory: TokenDebtTrackerHarness__factory = await ethers.getContractFactory("TokenDebtTrackerHarness");
  const tokenDebtTracker: TokenDebtTrackerHarness = await upgrades.deployProxy(factory, [], {
    initializer: "initialize()",
  });
  const tokenFactory: ERC20Harness__factory = await ethers.getContractFactory("ERC20Harness");
  const token = await tokenFactory.deploy(INITIAL_SUPPLY, "Test", 18, "TST");
  return { tokenDebtTracker, token };
};

describe("Token debt tracker", () => {
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let tokenDebtTracker: TokenDebtTrackerHarness;
  let token: ERC20Harness;

  beforeEach(async () => {
    ({ tokenDebtTracker, token } = await loadFixture(fixture));
    [, user, user2] = await ethers.getSigners();
    await token.transfer(tokenDebtTracker.address, parseUnits("100", 18));
  });

  describe("_transferOutOrTrackDebtSkippingBalanceCheck", () => {
    describe("ERC20 tokens", () => {
      it("transfers out the specified amount", async () => {
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user.address,
          parseUnits("44", 18),
        );
        expect(await token.balanceOf(tokenDebtTracker.address)).to.equal(parseUnits("56", 18));
        expect(await token.balanceOf(user.address)).to.equal(parseUnits("44", 18));
      });

      it("does not emit TokenDebtAdded event upon successful transfer", async () => {
        const tx = await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user.address,
          parseUnits("44", 18),
        );
        await expect(tx).to.not.emit(tokenDebtTracker, "TokenDebtAdded");
      });

      it("records the debt if requested amount can't be transferred", async () => {
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user.address,
          parseUnits("101", 18),
        );
        expect(await token.balanceOf(tokenDebtTracker.address)).to.equal(parseUnits("100", 18));
        expect(await token.balanceOf(user.address)).to.equal(parseUnits("0", 18));
        expect(await tokenDebtTracker.tokenDebt(token.address, user.address)).to.equal(parseUnits("101", 18));
        expect(await tokenDebtTracker.totalTokenDebt(token.address)).to.equal(parseUnits("101", 18));
      });

      it("tracks total debt amount", async () => {
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user.address,
          parseUnits("111", 18),
        );
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user2.address,
          parseUnits("444", 18),
        );
        expect(await tokenDebtTracker.totalTokenDebt(token.address)).to.equal(parseUnits("555", 18));
      });

      it("tracks individual debt amounts", async () => {
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user.address,
          parseUnits("111", 18),
        );
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user2.address,
          parseUnits("444", 18),
        );
        expect(await tokenDebtTracker.tokenDebt(token.address, user.address)).to.equal(parseUnits("111", 18));
        expect(await tokenDebtTracker.tokenDebt(token.address, user2.address)).to.equal(parseUnits("444", 18));
      });

      it("emits TokenDebtAdded event upon failed transfer", async () => {
        const tx = await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          token.address,
          user.address,
          parseUnits("101", 18),
        );
        await expect(tx)
          .to.emit(tokenDebtTracker, "TokenDebtAdded")
          .withArgs(token.address, user.address, parseUnits("101", 18));
      });

      it("tracks debt if the token contract returns false on transfer()", async () => {
        const tokenReturningFalse = await smock.fake<ERC20Harness>("ERC20Harness");
        tokenReturningFalse.transfer.returns(false);
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          tokenReturningFalse.address,
          user.address,
          parseUnits("1", 18),
        );
        expect(await tokenDebtTracker.tokenDebt(tokenReturningFalse.address, user.address)).to.equal(
          parseUnits("1", 18),
        );
        expect(await tokenDebtTracker.totalTokenDebt(tokenReturningFalse.address)).to.equal(parseUnits("1", 18));
      });

      it("tracks debt if the token contract reverts on transfer()", async () => {
        const revertingTokenContract = await smock.fake<ERC20Harness>("ERC20Harness");
        revertingTokenContract.transfer.reverts();
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          revertingTokenContract.address,
          user.address,
          parseUnits("100", 18),
        );
        expect(await tokenDebtTracker.tokenDebt(revertingTokenContract.address, user.address)).to.equal(
          parseUnits("100", 18),
        );
        expect(await tokenDebtTracker.totalTokenDebt(revertingTokenContract.address)).to.equal(parseUnits("100", 18));
      });
    });

    describe("Non-conforming tokens", async () => {
      // We must handle non-ERC20 tokens gracefully. The only non-conforming scenario we can handle is
      // transfer(...) not returning any value. In other scenarios (e.g. token contract is an EOA, so the
      // internal tx doesn't fail but no tokens get transferred) we can't reliably check what's going on,
      // so the only sensible thing to do is to track debt.

      it("transfers tokens even if the token contract does not return a value on transfer()", async () => {
        const NonCompliantToken: FaucetNonStandardToken__factory = await ethers.getContractFactory(
          "FaucetNonStandardToken",
        );
        const nonCompliantToken = await NonCompliantToken.deploy(INITIAL_SUPPLY, "Test", 18, "TST");
        await nonCompliantToken.transfer(tokenDebtTracker.address, parseUnits("100", 18));
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          nonCompliantToken.address,
          user.address,
          parseUnits("100", 18),
        );
        expect(await nonCompliantToken.balanceOf(tokenDebtTracker.address)).to.equal(0);
        expect(await nonCompliantToken.balanceOf(user.address)).to.equal(parseUnits("100", 18));
      });

      it("tracks debt if the token contract is an EOA", async () => {
        await tokenDebtTracker.transferOutOrTrackDebtSkippingBalanceCheck(
          user.address,
          user.address,
          parseUnits("100", 18),
        );
        expect(await tokenDebtTracker.tokenDebt(user.address, user.address)).to.equal(parseUnits("100", 18));
        expect(await tokenDebtTracker.totalTokenDebt(user.address)).to.equal(parseUnits("100", 18));
      });
    });
  });

  describe("_transferOutOrTrackDebt", () => {
    it("transfers out the specified amount", async () => {
      await tokenDebtTracker.transferOutOrTrackDebt(token.address, user.address, parseUnits("44", 18));
      expect(await token.balanceOf(tokenDebtTracker.address)).to.equal(parseUnits("56", 18));
      expect(await token.balanceOf(user.address)).to.equal(parseUnits("44", 18));
    });

    it("fails if the balance is not enough for the transfer", async () => {
      await expect(tokenDebtTracker.transferOutOrTrackDebt(token.address, user.address, parseUnits("101", 18)))
        .to.be.revertedWithCustomError(tokenDebtTracker, "InsufficientBalance")
        .withArgs(token.address, tokenDebtTracker.address, parseUnits("101", 18), parseUnits("100", 18));
    });
  });

  describe("claimTokenDebt", () => {
    const DEBT = parseUnits("100", 18);

    beforeEach(async () => {
      await tokenDebtTracker.addTokenDebt(token.address, user.address, DEBT);
    });

    it("transfers out the specified amount if amount < debt", async () => {
      await tokenDebtTracker.connect(user).claimTokenDebt(token.address, DEBT.sub(1));
      expect(await token.balanceOf(tokenDebtTracker.address)).to.equal(1);
      expect(await token.balanceOf(user.address)).to.equal(DEBT.sub(1));
    });

    it("updates the individual debt value", async () => {
      await tokenDebtTracker.connect(user).claimTokenDebt(token.address, DEBT.sub(1));
      expect(await tokenDebtTracker.tokenDebt(token.address, user.address)).to.equal(1);
    });

    it("updates the total debt value", async () => {
      await tokenDebtTracker.connect(user).claimTokenDebt(token.address, DEBT.sub(1));
      expect(await tokenDebtTracker.totalTokenDebt(token.address)).to.equal(1);
    });

    it("emits TokenDebtClaimed event", async () => {
      const tx = await tokenDebtTracker.connect(user).claimTokenDebt(token.address, DEBT.sub(1));
      await expect(tx).to.emit(tokenDebtTracker, "TokenDebtClaimed").withArgs(token.address, user.address, DEBT.sub(1));
    });

    it("reverts if amount > debt and amount != type(uint256).max", async () => {
      await expect(tokenDebtTracker.connect(user).claimTokenDebt(token.address, DEBT.add(1)))
        .to.be.revertedWithCustomError(tokenDebtTracker, "InsufficientDebt")
        .withArgs(token.address, user.address, DEBT, DEBT.add(1));
    });

    it("transfers the full debt amount if amount == debt", async () => {
      await tokenDebtTracker.connect(user).claimTokenDebt(token.address, DEBT);
      expect(await token.balanceOf(tokenDebtTracker.address)).to.equal(0);
      expect(await token.balanceOf(user.address)).to.equal(DEBT);
    });

    it("transfers the full debt amount if amount == type(uint256).max", async () => {
      await tokenDebtTracker.connect(user).claimTokenDebt(token.address, ethers.constants.MaxUint256);
      expect(await token.balanceOf(tokenDebtTracker.address)).to.equal(0);
      expect(await token.balanceOf(user.address)).to.equal(DEBT);
    });
  });
});

import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ApproveOrRevertHarness,
  ApproveOrRevertHarness__factory,
  ERC20Harness,
  FaucetNonStandardToken__factory,
} from "../../../typechain";

const { expect } = chai;

const INITIAL_SUPPLY = parseUnits("1000000", 18);

interface Fixture {
  approver: ApproveOrRevertHarness;
}

const fixture = async (): Promise<Fixture> => {
  const approverFactory: ApproveOrRevertHarness__factory = await ethers.getContractFactory("ApproveOrRevertHarness");
  const approver: ApproveOrRevertHarness = await approverFactory.deploy();
  return { approver };
};

describe("Approve or revert", () => {
  const amount = parseUnits("100", 18);
  let user: SignerWithAddress;
  let approver: ApproveOrRevertHarness;

  beforeEach(async () => {
    ({ approver } = await loadFixture(fixture));
    [, user] = await ethers.getSigners();
  });

  describe("approveOrRevert", () => {
    it("reverts if the token reverts", async () => {
      const token = await smock.fake<ERC20Harness>("ERC20Harness");
      token.approve.reverts();
      await expect(approver.approve(token.address, user.address, amount)).to.be.revertedWithCustomError(
        approver,
        "ApproveFailed",
      );
    });

    it("reverts if the token returns false", async () => {
      const token = await smock.fake<ERC20Harness>("ERC20Harness");
      token.approve.returns(false);
      await expect(approver.approve(token.address, user.address, amount)).to.be.revertedWithCustomError(
        approver,
        "ApproveFailed",
      );
    });

    it("succeeds if the token returns true", async () => {
      const tokenFactory = await ethers.getContractFactory("ERC20Harness");
      const token = await tokenFactory.deploy(INITIAL_SUPPLY, "Test", 18, "TST");
      await approver.approve(token.address, user.address, amount);
      expect(await token.allowance(approver.address, user.address)).to.be.equal(amount);
    });

    it("succeeds if the approval is successful but the token does not return any value", async () => {
      const NonCompliantToken: FaucetNonStandardToken__factory = await ethers.getContractFactory(
        "FaucetNonStandardToken",
      );
      const token = await NonCompliantToken.deploy(INITIAL_SUPPLY, "Test", 18, "TST");
      await approver.approve(token.address, user.address, amount);
      expect(await token.allowance(approver.address, user.address)).to.be.equal(amount);
    });
  });
});

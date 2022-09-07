import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { CErc20Harness, ERC20Harness, Comptroller, InterestRateModel, AccessControlManager } from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";
import {
  getBalances, adjustBalances, preApprove,
  cTokenTestFixture, CTokenTestFixture
} from "../util/TokenTestHelpers";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";

describe('CToken', function () {
  let root: Signer;
  let guy: Signer;
  let rootAddress: string;
  let guyAddress: string;
  let accounts: Signer[];
  let cToken: MockContract<CErc20Harness>;
  let comptroller: FakeContract<Comptroller>;

  beforeEach(async () => {
    [root, guy, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    guyAddress = await guy.getAddress();
    ({ cToken, comptroller } = await loadFixture(cTokenTestFixture));
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      expect(await cToken.balanceOf(rootAddress)).to.equal(0);
      await expect(cToken.transfer(guyAddress, 100))
        .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("transfers 50 tokens", async () => {
      await cToken.harnessSetBalance(rootAddress, 100);
      expect(await cToken.balanceOf(rootAddress)).to.equal(100);
      await cToken.transfer(guyAddress, 50);
      expect(await cToken.balanceOf(rootAddress)).to.equal(50);
      expect(await cToken.balanceOf(guyAddress)).to.equal(50);
    });

    it("doesn't transfer when src == dst", async () => {
      await cToken.harnessSetBalance(rootAddress, 100);
      expect(await cToken.balanceOf(rootAddress)).to.equal(100);
      await expect(cToken.transfer(rootAddress, 50))
        .to.be.revertedWithCustomError(cToken, 'TransferNotAllowed');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      await cToken.harnessSetBalance(rootAddress, 100);
      expect(await cToken.balanceOf(rootAddress)).to.equal(100);

      comptroller.transferAllowed.returns(11);
      await expect(cToken.transfer(rootAddress, 50))
        .to.be.revertedWithCustomError(cToken, 'TransferComptrollerRejection')
        .withArgs(11);

      //comptroller.transferAllowed.returns(Error.NO_ERROR);
      //await send(cToken.comptroller, 'setTransferVerify', [false])
      // no longer support verifyTransfer on cToken end
      // await expect(send(cToken, 'transfer', [guyAddress, 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });
  });
});

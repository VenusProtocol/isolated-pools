import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AbstractSwapper,
  AbstractSwapper__factory,
  AccessControlManager,
  ResilientOracleInterface,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let accessControl: FakeContract<AccessControlManager>;
let swapper: MockContract<AbstractSwapper>;
let tokenIn: FakeContract<VToken>;
let tokenOut: FakeContract<VToken>;
let oracle: FakeContract<ResilientOracleInterface>;
let swapPairConfig: {
  tokenAddressIn: string;
  tokenAddressOut: string;
  incentive: string;
  enabled: boolean;
};

const INCENTIVE = convertToUnit("1", 17);
const AMOUNT_IN = convertToUnit("1.5", 18);
const TOKEN_IN_PRICE = convertToUnit("1", 18);
const TOKEN_OUT_PRICE = convertToUnit("0.5", 18);
const AMOUNT_IN_UNDER = convertToUnit("5", 17);
const AMOUNT_IN_OVER = convertToUnit("1", 18);
const MANTISSA_ONE = convertToUnit("1", 18);

async function fixture(): Promise<void> {
  const Swapper = await smock.mock<AbstractSwapper__factory>("AbstractSwapper");
  accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  tokenIn = await smock.fake<VToken>("VToken");
  tokenOut = await smock.fake<VToken>("VToken");
  swapper = await Swapper.deploy();
  await swapper.initialize(accessControl.address, oracle.address);
  accessControl.isAllowedToCall.returns(true);

  swapPairConfig = {
    tokenAddressIn: tokenIn.address,
    tokenAddressOut: tokenOut.address,
    incentive: INCENTIVE,
    enabled: true,
  };
}

describe("AbstractSwapper: tests", () => {
  beforeEach(async () => {
    await loadFixture(fixture);
  });

  describe("Set swap configurations", () => {
    beforeEach(async () => {
      accessControl.isAllowedToCall.returns(true);
    });

    it("Revert on not access to set swap configurations", async () => {
      accessControl.isAllowedToCall.reset;
      accessControl.isAllowedToCall.returns(false);

      await expect(swapper.setSwapConfiguration(swapPairConfig)).to.be.revertedWithCustomError(swapper, "Unauthorized");
    });

    it("Revert on invalid tokenIn address", async () => {
      const swapConfig = {
        ...swapPairConfig,
        tokenAddressIn: ethers.constants.AddressZero,
      };

      await expect(swapper.setSwapConfiguration(swapConfig)).to.be.revertedWithCustomError(
        swapper,
        "ZeroAddressNotAllowed",
      );
    });

    it("Revert on invalid tokenOut address", async () => {
      const swapConfig = {
        ...swapPairConfig,
        tokenAddressOut: ethers.constants.AddressZero,
      };

      await expect(swapper.setSwapConfiguration(swapConfig)).to.be.revertedWithCustomError(
        swapper,
        "ZeroAddressNotAllowed",
      );
    });

    it("Set swap config for first time", async () => {
      let isExist = await swapper.swapConfigurations(tokenIn.address, tokenOut.address);

      expect(isExist[0]).to.equal(ethers.constants.AddressZero);
      expect(isExist[1]).to.equal(ethers.constants.AddressZero);
      expect(isExist[2]).to.equal(0);
      expect(isExist[3]).to.equal(false);

      await expect(swapper.setSwapConfiguration(swapPairConfig))
        .to.emit(swapper, "SwapConfigurationUpdated")
        .withArgs(tokenIn.address, tokenOut.address, 0, INCENTIVE, false, true);

      isExist = await swapper.swapConfigurations(tokenIn.address, tokenOut.address);

      expect(isExist[0]).to.equal(tokenIn.address);
      expect(isExist[1]).to.equal(tokenOut.address);
      expect(isExist[2]).to.equal(INCENTIVE);
      expect(isExist[3]).to.equal(true);
    });

    it("Update the incentive", async () => {
      const NEW_INCENTIVE = convertToUnit("2", 17);

      await swapper.setSwapConfiguration(swapPairConfig);

      const swapConfig = {
        ...swapPairConfig,
        incentive: NEW_INCENTIVE,
      };

      await expect(swapper.setSwapConfiguration(swapConfig))
        .to.emit(swapper, "SwapConfigurationUpdated")
        .withArgs(tokenIn.address, tokenOut.address, INCENTIVE, NEW_INCENTIVE, true, true);

      const isExist = await swapper.swapConfigurations(tokenIn.address, tokenOut.address);
      expect(isExist[2]).to.equal(NEW_INCENTIVE);
    });
  });

  describe("Get amount out", () => {
    const setSwapperConfig = async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await tokenOut.balanceOf.returns(AMOUNT_IN);
    };

    it("Revert on zero amountIn value", async () => {
      await expect(swapper.getAmountOut(0, tokenIn.address, tokenOut.address)).to.be.revertedWithCustomError(
        swapper,
        "InsufficientInputAmount",
      );
    });

    it("Revert on no config or disabled swap for tokens pair", async () => {
      await expect(swapper.getAmountOut(AMOUNT_IN, tokenIn.address, tokenOut.address)).to.be.revertedWithCustomError(
        swapper,
        "SwapConfigurationNotEnabled",
      );
    });

    it("Success on swapping tokenIn to tokenOut for under tokenOut liquidity", async () => {
      await setSwapperConfig();
      await oracle.getUnderlyingPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getUnderlyingPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
      const results = await swapper.getAmountOut(AMOUNT_IN_UNDER, tokenIn.address, tokenOut.address);
      const conversionRatio = new BigNumber(TOKEN_IN_PRICE).dividedBy(TOKEN_OUT_PRICE);
      const conversionWithIncentive = Number(MANTISSA_ONE) + Number(INCENTIVE);
      const amountOut = new BigNumber(AMOUNT_IN_UNDER)
        .multipliedBy(conversionRatio)
        .multipliedBy(conversionWithIncentive)
        .dividedBy(MANTISSA_ONE)
        .toFixed(0);

      expect(results[0]).to.equal(AMOUNT_IN_UNDER);
      expect(results[1]).to.equal(amountOut);
    });

    it("Success on swapping tokenIn to tokenOut for over tokenOut liquidity", async () => {
      await setSwapperConfig();
      await oracle.getUnderlyingPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getUnderlyingPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
      const results = await swapper.getAmountOut(AMOUNT_IN_OVER, tokenIn.address, tokenOut.address);
      const conversionWithIncentive = Number(MANTISSA_ONE) + Number(INCENTIVE);
      const conversionRatio = new BigNumber(TOKEN_IN_PRICE).dividedBy(TOKEN_OUT_PRICE);
      const amountIn = new BigNumber(AMOUNT_IN)
        .multipliedBy(MANTISSA_ONE)
        .dividedBy(conversionRatio)
        .dividedBy(conversionWithIncentive)
        .toFixed(0);

      expect(results[0]).to.equal(amountIn);
      expect(results[1]).to.equal(AMOUNT_IN);
    });
  });
});

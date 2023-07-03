import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AbstractSwapper,
  AbstractSwapper__factory,
  AccessControlManager,
  MockDeflatingToken,
  MockDeflatingToken__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let accessControl: FakeContract<AccessControlManager>;
let swapper: MockContract<AbstractSwapper>;
let tokenIn: MockContract<MockToken>;
let tokenOut: MockContract<MockToken>;
let oracle: FakeContract<ResilientOracleInterface>;
let tokenInDeflationary: MockContract<MockDeflatingToken>;
let to: Signer;
let destination: Signer;
let owner: Signer;
let swapPairConfig: {
  tokenAddressIn: string;
  tokenAddressOut: string;
  incentive: string;
  enabled: boolean;
};

const INCENTIVE = convertToUnit("1", 17);
const TOKEN_OUT_MAX = convertToUnit("1.5", 18);
const TOKEN_IN_PRICE = convertToUnit("1", 18);
const TOKEN_OUT_PRICE = convertToUnit("0.5", 18);
const MANTISSA_ONE = convertToUnit("1", 18);

async function fixture(): Promise<void> {
  [owner, destination, to] = await ethers.getSigners();
  const Swapper = await smock.mock<AbstractSwapper__factory>("AbstractSwapper");

  accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");

  const MockToken = await smock.mock<MockToken__factory>("MockToken");
  const MockTokenDeflationary = await smock.mock<MockDeflatingToken__factory>("MockDeflatingToken");
  tokenIn = await MockToken.deploy("TokenIn", "tokenIn", 18);
  await tokenIn.faucet(parseUnits("1000", 18));

  tokenInDeflationary = await MockTokenDeflationary.deploy(parseUnits("1000", 18));

  tokenOut = await MockToken.deploy("TokenOut", "tokenOut", 18);
  await tokenOut.faucet(parseUnits("1000", 18));

  swapper = await Swapper.deploy();
  await swapper.initialize(accessControl.address, oracle.address, destination.address);
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

    it("Revert on high incentive percentage", async () => {
      const swapConfig = {
        ...swapPairConfig,
        incentive: convertToUnit("6", 18), // more than MAX_INCENTIVE = 5e18
      };

      await expect(swapper.setSwapConfiguration(swapConfig)).to.be.revertedWithCustomError(swapper, "IncentiveTooHigh");
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
    const AMOUNT_IN_UNDER = convertToUnit("5", 17);
    const AMOUNT_IN_OVER = convertToUnit("1", 18);

    beforeEach(async () => {
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));
    });

    const setSwapperConfig = async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await tokenOut.balanceOf.returns(TOKEN_OUT_MAX);
    };

    it("Revert on zero amountIn value", async () => {
      await expect(swapper.getAmountOut(0, tokenIn.address, tokenOut.address)).to.be.revertedWithCustomError(
        swapper,
        "InsufficientInputAmount",
      );
    });

    it("Revert on no config or disabled swap for tokens pair", async () => {
      await expect(
        swapper.getAmountOut(TOKEN_OUT_MAX, tokenIn.address, tokenOut.address),
      ).to.be.revertedWithCustomError(swapper, "SwapConfigurationNotEnabled");
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
      const amountIn = new BigNumber(TOKEN_OUT_MAX)
        .multipliedBy(MANTISSA_ONE)
        .dividedBy(conversionRatio)
        .dividedBy(conversionWithIncentive)
        .toFixed(0);

      expect(results[0]).to.equal(amountIn);
      expect(results[1]).to.equal(TOKEN_OUT_MAX);
    });
  });

  describe("Get amount in", () => {
    const AMOUNT_IN_UNDER = convertToUnit("1", 18);
    const AMOUNT_IN_OVER = convertToUnit("2", 18);

    beforeEach(async () => {
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));
    });

    const setSwapperConfig = async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await tokenOut.balanceOf.returns(TOKEN_OUT_MAX);
    };

    it("Revert on zero amountIn value", async () => {
      await expect(swapper.getAmountIn(0, tokenIn.address, tokenOut.address)).to.be.revertedWithCustomError(
        swapper,
        "InsufficientInputAmount",
      );
    });

    it("Revert on no config or disabled swap for tokens pair", async () => {
      await expect(
        swapper.getAmountIn(AMOUNT_IN_UNDER, tokenIn.address, tokenOut.address),
      ).to.be.revertedWithCustomError(swapper, "SwapConfigurationNotEnabled");
    });

    it("Success on swapping tokenIn to tokenOut for under tokenOut liquidity", async () => {
      await setSwapperConfig();
      await oracle.getUnderlyingPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getUnderlyingPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
      const results = await swapper.getAmountIn(AMOUNT_IN_UNDER, tokenIn.address, tokenOut.address);
      const conversionRatio = new BigNumber(TOKEN_IN_PRICE).dividedBy(TOKEN_OUT_PRICE);
      const conversionWithIncentive = Number(MANTISSA_ONE) + Number(INCENTIVE);
      const amountIn = new BigNumber(AMOUNT_IN_UNDER)
        .multipliedBy(MANTISSA_ONE)
        .dividedBy(conversionRatio)
        .dividedBy(conversionWithIncentive)
        .toFixed(0);

      expect(results[0]).to.equal(AMOUNT_IN_UNDER);
      expect(results[1]).to.equal(amountIn);
    });

    it("Success on swapping tokenIn to tokenOut for over tokenOut liquidity", async () => {
      await setSwapperConfig();
      await oracle.getUnderlyingPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getUnderlyingPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
      const results = await swapper.getAmountIn(AMOUNT_IN_OVER, tokenIn.address, tokenOut.address);
      const conversionWithIncentive = Number(MANTISSA_ONE) + Number(INCENTIVE);
      const conversionRatio = new BigNumber(TOKEN_IN_PRICE).dividedBy(TOKEN_OUT_PRICE);
      const amountIn = new BigNumber(TOKEN_OUT_MAX)
        .multipliedBy(MANTISSA_ONE)
        .dividedBy(conversionRatio)
        .dividedBy(conversionWithIncentive)
        .toFixed(0);

      expect(results[0]).to.equal(TOKEN_OUT_MAX);
      expect(results[1]).to.equal(amountIn);
    });
  });

  describe("Swap exact tokens for tokens", async () => {
    beforeEach(async () => {
      await tokenInDeflationary.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));

      await oracle.getUnderlyingPrice.whenCalledWith(tokenInDeflationary.address).returns(TOKEN_IN_PRICE);
      await oracle.getUnderlyingPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getUnderlyingPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
    });

    it("Revert on lower amount out than expected", async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await expect(
        swapper.swapExactTokensForTokens(
          convertToUnit(".5", 18),
          convertToUnit("1.5", 18),
          tokenIn.address,
          tokenOut.address,
          to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountOutLowerThanMinRequired");
    });

    it("Revert on deflationary token transfer", async () => {
      const swapPairConfig = {
        tokenAddressIn: tokenInDeflationary.address,
        tokenAddressOut: tokenOut.address,
        incentive: INCENTIVE,
        enabled: true,
      };

      await swapper.setSwapConfiguration(swapPairConfig);

      await expect(
        swapper.swapExactTokensForTokens(
          convertToUnit(".25", 18),
          convertToUnit(".5", 18),
          tokenInDeflationary.address,
          tokenOut.address,
          to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountInOrAmountOutMismatched");
    });

    it("Success on swap exact tokens", async () => {
      const AMOUNT_IN = convertToUnit(".25", 18);
      const MIN_AMOUNT_OUT = convertToUnit(".5", 18);
      await swapper.setSwapConfiguration(swapPairConfig);

      const expectedResults = await swapper.getAmountOut(AMOUNT_IN, tokenIn.address, tokenOut.address);

      const tx = await swapper.swapExactTokensForTokens(
        AMOUNT_IN,
        MIN_AMOUNT_OUT,
        tokenIn.address,
        tokenOut.address,
        to.getAddress(),
      );

      tx.wait();

      await expect(tx).to.emit(swapper, "SwapExactTokensForTokens").withArgs(expectedResults[0], expectedResults[1]);
    });
  });

  describe("Set price oracle", () => {
    let newOracle: FakeContract<ResilientOracleInterface>;

    before(async () => {
      newOracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    });

    it("Revert on non-owner call", async () => {
      const [, nonOwner] = await ethers.getSigners();

      await expect(swapper.connect(nonOwner).setPriceOracle(newOracle.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("Revert on invalid oracle address", async () => {
      await expect(swapper.setPriceOracle(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        swapper,
        "ZeroAddressNotAllowed",
      );
    });

    it("Success on new price oracle update", async () => {
      await expect(swapper.setPriceOracle(newOracle.address))
        .to.emit(swapper, "PriceOracleUpdated")
        .withArgs(oracle.address, newOracle.address);
    });
  });
});

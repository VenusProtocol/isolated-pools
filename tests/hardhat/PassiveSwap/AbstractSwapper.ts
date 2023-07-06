import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  MockDeflatingToken,
  MockDeflatingToken__factory,
  MockSwapper,
  MockSwapper__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let accessControl: FakeContract<AccessControlManager>;
let swapper: MockContract<MockSwapper>;
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
  const Swapper = await smock.mock<MockSwapper__factory>("MockSwapper");

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
  await swapper.initialize(accessControl.address, oracle.address, await destination.getAddress());
  accessControl.isAllowedToCall.returns(true);

  swapPairConfig = {
    tokenAddressIn: tokenIn.address,
    tokenAddressOut: tokenOut.address,
    incentive: INCENTIVE,
    enabled: true,
  };
}

describe("MockSwapper: tests", () => {
  beforeEach(async () => {
    await loadFixture(fixture);
  });
  describe("Swap tokens for exact tokens", async () => {
    beforeEach(async () => {
      await tokenInDeflationary.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));

      await oracle.getPrice.whenCalledWith(tokenInDeflationary.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
    });
    it("Success on swap exact tokens", async () => {
      const MAX_AMOUNT_IN = convertToUnit(".25", 18);
      const AMOUNT_OUT = convertToUnit(".5", 18);
      await swapper.setSwapConfiguration(swapPairConfig);

      const expectedResults = await swapper.getAmountIn(AMOUNT_OUT, tokenIn.address, tokenOut.address);

      const tx = await swapper.swapTokensForExactTokens(
        MAX_AMOUNT_IN,
        AMOUNT_OUT,
        tokenIn.address,
        tokenOut.address,
        await to.getAddress(),
      );

      await tx.wait();

      await expect(tx).to.emit(swapper, "SwapTokensForExactTokens").withArgs(expectedResults[1], expectedResults[0]);
    });
    it("Revert on lower amount out than expected", async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await expect(
        swapper.swapTokensForExactTokens(
          convertToUnit(".5", 18),
          convertToUnit("1.5", 18),
          tokenIn.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountInHigherThanMax");
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
        swapper.swapTokensForExactTokens(
          convertToUnit(".25", 18),
          convertToUnit(".5", 18),
          tokenInDeflationary.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountInOrAmountOutMismatched");
    });
  });
  describe("Swap exact tokens for tokens", async () => {
    beforeEach(async () => {
      await tokenInDeflationary.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));

      await oracle.getPrice.whenCalledWith(tokenInDeflationary.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
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
        await to.getAddress(),
      );

      await tx.wait();

      await expect(tx).to.emit(swapper, "SwapExactTokensForTokens").withArgs(expectedResults[0], expectedResults[1]);
    });

    it("Revert on lower amount out than expected", async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await expect(
        swapper.swapExactTokensForTokens(
          convertToUnit(".5", 18),
          convertToUnit("1.5", 18),
          tokenIn.address,
          tokenOut.address,
          await to.getAddress(),
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
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountInOrAmountOutMismatched");
    });
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
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
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
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
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
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
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
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
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

  describe("Swap exact tokens for tokens with supporting fee", async () => {
    beforeEach(async () => {
      await tokenInDeflationary.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));

      await oracle.getPrice.whenCalledWith(tokenInDeflationary.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
    });

    it("Revert on lower amount out than expected", async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await expect(
        swapper.swapExactTokensForTokens(
          convertToUnit(".5", 18),
          convertToUnit("1.5", 18),
          tokenIn.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountOutLowerThanMinRequired");
    });

    it("Success on swap exact tokens with supporting fee", async () => {
      const swapPairConfig = {
        tokenAddressIn: tokenInDeflationary.address,
        tokenAddressOut: tokenOut.address,
        incentive: INCENTIVE,
        enabled: true,
      };

      await swapper.setSwapConfiguration(swapPairConfig);

      await expect(
        swapper.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          convertToUnit(".25", 18),
          convertToUnit(".5", 18),
          tokenInDeflationary.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.emit(swapper, "SwapExactTokensForTokensSupportingFeeOnTransferTokens");
    });
  });

  describe("Swap tokens for exact tokens", async () => {
    beforeEach(async () => {
      await tokenInDeflationary.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenIn.connect(owner).approve(swapper.address, convertToUnit("1", 18));
      await tokenOut.transfer(swapper.address, convertToUnit("1.5", 18));

      await oracle.getPrice.whenCalledWith(tokenInDeflationary.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenIn.address).returns(TOKEN_IN_PRICE);
      await oracle.getPrice.whenCalledWith(tokenOut.address).returns(TOKEN_OUT_PRICE);
    });

    it("Revert on lower amount out than expected", async () => {
      await swapper.setSwapConfiguration(swapPairConfig);
      await expect(
        swapper.swapTokensForExactTokens(
          convertToUnit(".5", 18),
          convertToUnit("1.5", 18),
          tokenIn.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "AmountInHigherThanMax");
    });

    it("Success on swap exact tokens with supporting fee", async () => {
      const swapPairConfig = {
        tokenAddressIn: tokenInDeflationary.address,
        tokenAddressOut: tokenOut.address,
        incentive: INCENTIVE,
        enabled: true,
      };

      await swapper.setSwapConfiguration(swapPairConfig);

      await expect(
        swapper.swapTokensForExactTokensSupportingFeeOnTransferTokens(
          convertToUnit(".25", 18),
          convertToUnit(".5", 18),
          tokenInDeflationary.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.emit(swapper, "SwapTokensForExactTokensSupportingFeeOnTransferTokens");
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

  describe("Pause/Resume functionality", () => {
    beforeEach(async () => {
      accessControl.isAllowedToCall.reset;
      accessControl.isAllowedToCall.returns(true);
    });

    it("Revert on pauseSwap for non owner call", async () => {
      accessControl.isAllowedToCall.reset;
      accessControl.isAllowedToCall.returns(false);

      await expect(swapper.connect(to).pauseSwap()).to.be.revertedWithCustomError(swapper, "Unauthorized");
    });

    it("Success on pauseSwap", async () => {
      await expect(swapper.pauseSwap()).to.emit(swapper, "SwapPaused");
    });

    it("Revert on when swap is already paused", async () => {
      await swapper.pauseSwap();
      await expect(swapper.pauseSwap()).to.be.revertedWithCustomError(swapper, "SwapTokensPaused");
    });

    it("Swap methods should revert on swap pause", async () => {
      const Value_1 = convertToUnit(".25", 18);
      const VALUE_2 = convertToUnit(".5", 18);
      await swapper.pauseSwap();

      await expect(
        swapper.swapExactTokensForTokens(Value_1, VALUE_2, tokenIn.address, tokenOut.address, await to.getAddress()),
      ).to.be.revertedWithCustomError(swapper, "SwapTokensPaused");

      await expect(
        swapper.swapTokensForExactTokens(Value_1, VALUE_2, tokenIn.address, tokenOut.address, await to.getAddress()),
      ).to.be.revertedWithCustomError(swapper, "SwapTokensPaused");

      await expect(
        swapper.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          Value_1,
          VALUE_2,
          tokenIn.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "SwapTokensPaused");

      await expect(
        swapper.swapTokensForExactTokensSupportingFeeOnTransferTokens(
          Value_1,
          VALUE_2,
          tokenIn.address,
          tokenOut.address,
          await to.getAddress(),
        ),
      ).to.be.revertedWithCustomError(swapper, "SwapTokensPaused");
    });

    it("Revert on resumeSwap for non owner call", async () => {
      accessControl.isAllowedToCall.reset;
      accessControl.isAllowedToCall.returns(false);

      await expect(swapper.connect(to).resumeSwap()).to.be.revertedWithCustomError(swapper, "Unauthorized");
    });

    it("Success on resumeSwap", async () => {
      await swapper.pauseSwap();
      await expect(swapper.resumeSwap()).to.emit(swapper, "SwapResumed");
    });

    it("Revert on when swap is already active", async () => {
      await expect(swapper.resumeSwap()).to.be.revertedWithCustomError(swapper, "SwapTokensActive");
    });
  });

  describe("SweepTokens abstract swapper", () => {
    it("Transfer sweep tokens", async () => {
      expect(await tokenIn.balanceOf(swapper.address)).to.equals(0);
      await expect(tokenIn.transfer(swapper.address, 1000)).to.changeTokenBalances(
        tokenIn,
        [await owner.getAddress(), swapper.address],
        [-1000, 1000],
      );
      await expect(swapper.sweepToken(tokenIn.address)).to.changeTokenBalances(
        tokenIn,
        [await owner.getAddress(), swapper.address],
        [1000, -1000],
      );
    });
  });
});

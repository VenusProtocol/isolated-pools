import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  VToken,
} from "../../../typechain";
import { Error } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

interface AccountLiquidityTestFixture {
  accessControl: FakeContract<AccessControlManager>;
  comptroller: MockContract<Comptroller>;
  oracle: FakeContract<PriceOracle>;
  poolRegistry: FakeContract<PoolRegistry>;
}

async function makeComptroller(): Promise<AccountLiquidityTestFixture> {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
  const maxLoopsLimit = 150;
  const comptroller = await upgrades.deployProxy(Comptroller, [maxLoopsLimit, accessControl.address], {
    constructorArgs: [poolRegistry.address],
    initializer: "initialize(uint256,address)",
  });
  const oracle = await smock.fake<PriceOracle>("PriceOracle");

  accessControl.isAllowedToCall.returns(true);
  await comptroller.setPriceOracle(oracle.address);
  return { accessControl, comptroller, oracle, poolRegistry };
}

async function makeVToken({
  accessControl,
  comptroller,
  oracle,
  supportMarket,
  exchangeRate,
  collateralFactor,
  underlyingPrice,
  poolRegistry,
  maxLoopsLimit,
}: {
  accessControl: FakeContract<AccessControlManager>;
  comptroller: MockContract<Comptroller>;
  oracle: FakeContract<PriceOracle>;
  supportMarket?: boolean;
  exchangeRate?: BigNumberish;
  collateralFactor?: string | number;
  underlyingPrice?: string | number;
  poolRegistry: FakeContract<PoolRegistry>;
  maxLoopsLimit: string | number;
}): Promise<FakeContract<VToken>> {
  accessControl.isAllowedToCall.returns(true);
  const vToken = await smock.fake<VToken>("VToken");
  configureVToken({ vToken, comptroller, exchangeRate });
  await comptroller.setMaxLoopsLimit(maxLoopsLimit);
  if (supportMarket) {
    const poolRegistrySigner = await ethers.getSigner(poolRegistry.address);
    await comptroller.connect(poolRegistrySigner).supportMarket(vToken.address);
  }
  if (underlyingPrice) {
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(convertToUnit(underlyingPrice, 18));
  }
  if (collateralFactor) {
    await comptroller.setCollateralFactor(
      vToken.address,
      convertToUnit(collateralFactor, 18),
      convertToUnit(collateralFactor, 18),
    );
  }
  await comptroller.setMarketSupplyCaps([vToken.address], [100000000000]);

  return vToken;
}

function configureVToken({
  vToken,
  comptroller,
  exchangeRate,
}: {
  vToken: FakeContract<VToken>;
  comptroller: MockContract<Comptroller>;
  exchangeRate?: BigNumberish;
}) {
  vToken.comptroller.returns(comptroller.address);
  vToken.isVToken.returns(true);
  if (exchangeRate) {
    vToken.exchangeRateStored.returns(exchangeRate);
  }
  vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
}

describe("Comptroller", () => {
  let root: Signer;
  let accounts: Signer[];
  let accessControl: FakeContract<AccessControlManager>;
  let comptroller: MockContract<Comptroller>;
  let oracle: FakeContract<PriceOracle>;
  let poolRegistry: FakeContract<PoolRegistry>;

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners();
    ({ accessControl, comptroller, oracle, poolRegistry } = await loadFixture(makeComptroller));
    const poolRegistryBalance = await poolRegistry.provider.getBalance(poolRegistry.address);
    if (poolRegistryBalance.isZero()) {
      await setBalance(await root.getAddress(), 100n ** 18n);
      await root.sendTransaction({
        to: poolRegistry.address,
        value: ethers.utils.parseEther("1"),
      });
    }
  });

  describe("liquidity", () => {
    it("Fails if set the lesser then or equal value to previous maxLoopLimit", async () => {
      await expect(comptroller.setMaxLoopsLimit(150)).to.be.revertedWith("Comptroller: Invalid maxLoopsLimit");
    });

    it("fails if a price has not been set", async () => {
      const vToken = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        poolRegistry,
        maxLoopsLimit: 151,
      });
      await comptroller.connect(accounts[1]).enterMarkets([vToken.address]);
      await expect(comptroller.getAccountLiquidity(await accounts[1].getAddress())).to.be.revertedWithCustomError(
        comptroller,
        "PriceError",
      );
    });

    it("allows a borrow up to collateralFactor, but not more", async () => {
      const collateralFactor = 0.5,
        underlyingPrice = 1,
        user = accounts[1],
        amount = 1e6;
      const vToken = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        collateralFactor,
        underlyingPrice,
        poolRegistry,
        maxLoopsLimit: 151,
      });

      let error: BigNumber;
      let liquidity: BigNumber;
      let shortfall: BigNumber;

      // not in market yet, hypothetical borrow should have no effect
      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        await user.getAddress(),
        vToken.address,
        0,
        amount,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);

      await comptroller.connect(user).enterMarkets([vToken.address]);
      // await quickMint(vToken, user, amount);
      vToken.getAccountSnapshot.whenCalledWith(await user.getAddress()).returns([0, amount, 0, convertToUnit("1", 18)]);

      // total account liquidity after supplying `amount`
      [error, liquidity, shortfall] = await comptroller.getAccountLiquidity(await user.getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(amount * collateralFactor);
      expect(shortfall).to.equal(0);

      // hypothetically borrow `amount`, should shortfall over collateralFactor
      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        await user.getAddress(),
        vToken.address,
        0,
        amount,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(amount * (1 - collateralFactor));

      // hypothetically redeem `amount`, should be back to even
      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        await user.getAddress(),
        vToken.address,
        amount,
        0,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });

    it("allows entering 3 markets, supplying to 2 and borrowing up to collateralFactor in the 3rd", async () => {
      const amount1 = 1e6;
      const amount2 = 1e3;
      const user = accounts[1];
      const userAddress = await user.getAddress();

      const cf1 = 0.5;
      const cf2 = 0.666;
      const cf3 = 0;
      const up1 = 3;
      const up2 = 2.718;
      const up3 = 1;
      const c1 = amount1 * cf1 * up1;
      const c2 = amount2 * cf2 * up2;
      const collateral = Math.floor(c1 + c2);

      const vToken1 = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        collateralFactor: cf1,
        underlyingPrice: up1,
        poolRegistry,
        maxLoopsLimit: 151,
      });
      const vToken2 = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        collateralFactor: cf2,
        underlyingPrice: up2,
        poolRegistry,
        maxLoopsLimit: 152,
      });
      const vToken3 = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        collateralFactor: cf3,
        underlyingPrice: up3,
        poolRegistry,
        maxLoopsLimit: 153,
      });

      await comptroller.connect(user).enterMarkets([vToken1.address, vToken2.address, vToken3.address]);
      // pretend user mints amount1 of vToken1
      vToken1.getAccountSnapshot.whenCalledWith(userAddress).returns([0, amount1, 0, convertToUnit("1", 18)]);
      // pretend user mints amount2 of vToken2
      vToken2.getAccountSnapshot.whenCalledWith(userAddress).returns([0, amount2, 0, convertToUnit("1", 18)]);

      let error, liquidity, shortfall;

      [error, liquidity, shortfall] = await comptroller.getAccountLiquidity(userAddress);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(collateral);
      expect(shortfall).to.equal(0);

      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddress,
        vToken3.address,
        Math.floor(c2),
        0,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(collateral);
      expect(shortfall).to.equal(0);

      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddress,
        vToken3.address,
        0,
        Math.floor(c2),
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(c1);
      expect(shortfall).to.equal(0);

      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddress,
        vToken3.address,
        0,
        collateral + c1,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(c1);

      [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddress,
        vToken1.address,
        amount1,
        0,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(Math.floor(c2));
      expect(shortfall).to.equal(0);
    });
  });

  describe("getAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const [error, liquidity, shortfall] = await comptroller.getAccountLiquidity(await accounts[0].getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });

    it("reverts if market already listed", async () => {
      const vToken = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        collateralFactor: 0.7,
        underlyingPrice: 2.12,
        poolRegistry,
        maxLoopsLimit: 151,
      });
      const poolRegistrySigner = await ethers.getSigner(poolRegistry.address);
      await expect(comptroller.connect(poolRegistrySigner).supportMarket(vToken.address))
        .to.be.revertedWithCustomError(comptroller, "MarketAlreadyListed")
        .withArgs(vToken.address);
    });
  });

  describe("getHypotheticalAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const vToken = await makeVToken({ accessControl, comptroller, oracle, poolRegistry, maxLoopsLimit: 151 });
      const [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        await accounts[0].getAddress(),
        vToken.address,
        0,
        0,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });

    it("returns collateral factor times dollar amount of tokens minted in a single market", async () => {
      const collateralFactor = 0.5;
      const exchangeRate = 1;
      const underlyingPrice = 1;
      const vToken = await makeVToken({
        accessControl,
        comptroller,
        oracle,
        supportMarket: true,
        collateralFactor,
        underlyingPrice,
        poolRegistry,
        maxLoopsLimit: 151,
      });
      const from = accounts[0];
      const amount = 1e6;
      await comptroller.connect(from).enterMarkets([vToken.address]);
      vToken.getAccountSnapshot
        .whenCalledWith(await from.getAddress())
        .returns([0, amount, 0, convertToUnit(exchangeRate, 18)]);
      const [error, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        await from.getAddress(),
        vToken.address,
        0,
        0,
      );
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(amount * collateralFactor * exchangeRate * underlyingPrice);
      expect(shortfall).to.equal(0);
    });
  });
});

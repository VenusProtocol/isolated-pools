import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  Comptroller,
  IAccessControlManagerV5,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  NativeTokenGateway,
  PoolRegistry,
  PoolRegistry__factory,
  ResilientOracleInterface,
  VToken,
  VTokenHarness,
  VTokenHarness__factory,
  WNative,
} from "../../../typechain";
import { makeVToken } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

type GatewayFixture = {
  oracle: FakeContract<ResilientOracleInterface>;
  accessControl: FakeContract<IAccessControlManagerV5>;
  comptroller: Comptroller;
  usdt: MockContract<MockToken>;
  vusdt: VTokenHarness;
  weth: WNative;
  vweth: VTokenHarness;
  nativeTokenGateway: NativeTokenGateway;
};

async function deployGateway(): Promise<GatewayFixture> {
  const [wallet, , user2] = await ethers.getSigners();

  const MockToken = await smock.mock<MockToken__factory>("MockToken");
  const usdt = await MockToken.deploy("USDT", "USDT", 18);

  const accessControl = await smock.fake<IAccessControlManagerV5>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);

  const closeFactor = parseUnits("6", 17);
  const liquidationIncentive = parseUnits("1", 18);
  const minLiquidatableCollateral = parseUnits("100", 18);

  const PoolRegistry = await ethers.getContractFactory<PoolRegistry__factory>("PoolRegistry");
  const poolRegistry = (await upgrades.deployProxy(PoolRegistry, [accessControl.address])) as PoolRegistry;

  const Comptroller = await ethers.getContractFactory("Comptroller");
  const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

  const maxLoopsLimit = 150;
  const fakePriceOracle = await smock.fake<ResilientOracleInterface>(MockPriceOracle__factory.abi);

  const comptrollerProxy = (await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
    maxLoopsLimit,
    accessControl.address,
  ])) as Comptroller;

  await comptrollerProxy.setPriceOracle(fakePriceOracle.address);

  // Registering the pool
  await poolRegistry.addPool(
    "Pool 1",
    comptrollerProxy.address,
    closeFactor,
    liquidationIncentive,
    minLiquidatableCollateral,
  );

  await comptrollerProxy.setPriceOracle(fakePriceOracle.address);

  const wethFactory = await ethers.getContractFactory("WNative");
  const weth = await wethFactory.deploy();
  weth.mint(parseUnits("100000000", 18));

  const vusdt = await makeVToken<VTokenHarness__factory>(
    {
      underlying: usdt,
      comptroller: comptrollerProxy,
      accessControlManager: accessControl,
      admin: wallet,
      initialExchangeRateMantissa: parseUnits("1", 28),
    },
    { kind: "VTokenHarness" },
  );

  const vweth = await makeVToken<VTokenHarness__factory>(
    {
      underlying: weth,
      comptroller: comptrollerProxy,
      accessControlManager: accessControl,
      admin: wallet,
      initialExchangeRateMantissa: parseUnits("1", 28),
    },
    { kind: "VTokenHarness" },
  );

  const nativeTokenGatewayFactory = await ethers.getContractFactory("NativeTokenGateway");
  const nativeTokenGateway = await nativeTokenGatewayFactory.deploy(weth.address, vweth.address);

  fakePriceOracle.getUnderlyingPrice.whenCalledWith(vusdt.address).returns(parseUnits("1", 18));
  fakePriceOracle.getUnderlyingPrice.whenCalledWith(vweth.address).returns(parseUnits("1000", 18));

  const usdtInitialSupply = parseUnits("10", 18);
  await usdt.faucet(usdtInitialSupply);
  await usdt.approve(poolRegistry.address, usdtInitialSupply);
  await poolRegistry.addMarket({
    vToken: vusdt.address,
    collateralFactor: parseUnits("5", 17),
    liquidationThreshold: parseUnits("5", 17),
    initialSupply: usdtInitialSupply,
    vTokenReceiver: wallet.address,
    supplyCap: parseUnits("10000", 18),
    borrowCap: parseUnits("10000", 18),
  });

  const wethInitialSupply = parseUnits("10", 18);
  await weth.approve(poolRegistry.address, usdtInitialSupply);
  await poolRegistry.addMarket({
    vToken: vweth.address,
    collateralFactor: parseUnits("5", 17),
    liquidationThreshold: parseUnits("5", 17),
    initialSupply: wethInitialSupply,
    vTokenReceiver: wallet.address,
    supplyCap: parseUnits("10000", 18),
    borrowCap: parseUnits("10000", 18),
  });

  await usdt.faucet(parseUnits("100000", 18));
  await usdt.transfer(user2.address, parseUnits("10000", 18));

  return {
    oracle: fakePriceOracle,
    comptroller: comptrollerProxy,
    accessControl,
    usdt,
    vusdt,
    weth,
    vweth,
    nativeTokenGateway,
  };
}

describe("NativeTokenGateway", () => {
  let deployer: Signer;
  let user1: Signer;
  let user2: Signer;
  let comptroller: Comptroller;
  let vusdt: VToken;
  let vweth: VToken;
  let usdt: MockContract<MockToken>;
  let weth: WNative;
  let nativeTokenGateway: NativeTokenGateway;
  const supplyAmount = parseUnits("10", 18);

  beforeEach(async () => {
    ({ comptroller, vusdt, vweth, weth, usdt, nativeTokenGateway } = await loadFixture(deployGateway));
    [deployer, user1, user2] = await ethers.getSigners();

    await comptroller.connect(user1).enterMarkets([vusdt.address, vweth.address]);
    await comptroller.connect(user2).enterMarkets([vusdt.address, vweth.address]);
  });

  describe("wrapAndSupply", () => {
    it("should revert when zero amount is provided to mint", async () => {
      await expect(
        nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: 0 }),
      ).to.be.revertedWithCustomError(nativeTokenGateway, "ZeroValueNotAllowed");
    });

    it("should wrap and supply eth", async () => {
      await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      const balanceAfterSupplying = await vweth.balanceOf(await user1.getAddress());
      await expect(balanceAfterSupplying.toString()).to.eq(parseUnits("10", 8));
    });
  });

  describe("redeemUnderlyingAndUnwrap", () => {
    beforeEach(async () => {
      await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
    });

    it("should revert when sender is not approved to redeem on behalf", async () => {
      const tx = nativeTokenGateway.connect(user1).redeemUnderlyingAndUnwrap(parseUnits("10", 18));
      await expect(tx).to.be.revertedWithCustomError(vweth, "DelegateNotApproved");
    });

    it("should redeem underlying tokens and unwrap and sent it to the user", async () => {
      const redeemAmount = parseUnits("10", 18);
      await comptroller.connect(user1).updateDelegate(nativeTokenGateway.address, true);

      await nativeTokenGateway.connect(user1).redeemUnderlyingAndUnwrap(redeemAmount);
      expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
    });
  });

  describe("borrowAndUnwrap", () => {
    beforeEach(async () => {
      await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
    });

    it("should revert when sender is not approved to borrow on behalf", async () => {
      const tx = nativeTokenGateway.connect(user2).borrowAndUnwrap(parseUnits("1", 18));
      await expect(tx).to.be.revertedWithCustomError(vweth, "DelegateNotApproved");
    });

    it("should borrow and unwrap weth and sent it to borrower", async () => {
      await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      await usdt.connect(user2).approve(vusdt.address, parseUnits("5000", 18));
      await vusdt.connect(user2).mint(parseUnits("5000", 18));

      await comptroller.connect(user2).updateDelegate(nativeTokenGateway.address, true);

      const borrowAmount = parseUnits("2", 18);
      const user2BalancePrevious = await user2.getBalance();
      await nativeTokenGateway.connect(user2).borrowAndUnwrap(borrowAmount);

      expect(await user2.getBalance()).to.closeTo(user2BalancePrevious.add(borrowAmount), parseUnits("1", 15));
    });
  });

  describe("wrapAndRepay", () => {
    it("should wrap and repay", async () => {
      await usdt.connect(user2).approve(vusdt.address, parseUnits("5000", 18));
      await vusdt.connect(user2).mint(parseUnits("5000", 18));
      await vweth.connect(user2).borrow(parseUnits("2", 18));

      const userBalancePrevious = await user2.getBalance();
      await nativeTokenGateway.connect(user2).wrapAndRepay({ value: parseUnits("10", 18) });

      expect(await user2.getBalance()).to.closeTo(userBalancePrevious.sub(parseUnits("2", 18)), parseUnits("1", 16));
      expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
    });
  });

  describe("sweepNative", () => {
    it("should revert when called by non owener", async () => {
      await expect(nativeTokenGateway.connect(user1).sweepNative()).to.be.rejectedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("should execute successfully", async () => {
      await user1.sendTransaction({ to: nativeTokenGateway.address, value: ethers.utils.parseEther("10") });

      const previousBalance = await deployer.getBalance();
      await nativeTokenGateway.sweepNative();

      expect(await deployer.getBalance()).to.be.greaterThan(previousBalance);
    });
  });

  describe("SweepToken", () => {
    it("should revert when called by non owener", async () => {
      await expect(nativeTokenGateway.connect(user1).sweepToken()).to.be.rejectedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("should sweep all tokens", async () => {
      await weth.transfer(nativeTokenGateway.address, parseUnits("2", 18));

      const ownerPreviousBalance = await weth.balanceOf(await deployer.getAddress());
      await nativeTokenGateway.sweepToken();

      expect(await weth.balanceOf(nativeTokenGateway.address)).to.be.eq(0);
      expect(await weth.balanceOf(await deployer.getAddress())).to.be.greaterThan(ownerPreviousBalance);
    });
  });
});

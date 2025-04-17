import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network, upgrades } from "hardhat";

import { BSC_BLOCKS_PER_YEAR } from "../../helpers/deploymentConfig";
import { convertToUnit } from "../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  PoolRegistry__factory,
  ResilientOracleInterface,
  RewardsDistributor,
  VToken,
} from "../../typechain";
import { deployVTokenBeacon, makeVToken } from "./util/TokenTestHelpers";
import { getDescription } from "./util/descriptionHelpers";

// Disable a warning about mixing beacons and transparent proxies
upgrades.silenceWarnings();

let root: SignerWithAddress;
let poolRegistry: PoolRegistry;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let vDAI: VToken;
let vWBTC: VToken;
let comptrollerProxy: Comptroller;
let rewardsDistributor: RewardsDistributor;
let xvs: MockToken;
let fakePriceOracle: FakeContract<ResilientOracleInterface>;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
const maxLoopsLimit = 150;
let blocksPerYear = BSC_BLOCKS_PER_YEAR; // for block based contracts

async function rewardsFixture(isTimeBased: boolean) {
  [root] = await ethers.getSigners();

  fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  fakeAccessControlManager.isAllowedToCall.returns(true);

  const PoolRegistry = await ethers.getContractFactory<PoolRegistry__factory>("PoolRegistry");
  poolRegistry = (await upgrades.deployProxy(PoolRegistry, [fakeAccessControlManager.address])) as PoolRegistry;

  // Deploy Mock Tokens
  const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
  mockDAI = await MockToken.deploy("MakerDAO", "DAI", 18);
  await mockDAI.faucet(convertToUnit(1000, 18));

  mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
  await mockWBTC.deployed();
  await mockWBTC.faucet(convertToUnit(1000, 8));

  // Deploy Mock Price Oracle
  fakePriceOracle = await smock.fake<ResilientOracleInterface>(MockPriceOracle__factory.abi);

  const btcPrice = "21000.34";
  const daiPrice = "1";

  const maxBorrowRateMantissa = ethers.BigNumber.from(0.0005e16);

  fakePriceOracle.getUnderlyingPrice.returns((args: any) => {
    if (vDAI && vWBTC) {
      if (args[0] === vDAI.address) {
        return convertToUnit(daiPrice, 18);
      } else {
        return convertToUnit(btcPrice, 28);
      }
    }

    return 1;
  });

  // Register Pools to the protocol
  const _closeFactor = convertToUnit(0.05, 18);
  const _liquidationIncentive = convertToUnit(1, 18);
  const _minLiquidatableCollateral = convertToUnit(100, 18);

  const Comptroller = await ethers.getContractFactory("Comptroller");
  const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

  comptrollerProxy = (await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
    maxLoopsLimit,
    fakeAccessControlManager.address,
  ])) as Comptroller;
  await comptrollerProxy.setPriceOracle(fakePriceOracle.address);

  // Registering the first pool
  await poolRegistry.addPool(
    "Pool 1",
    comptrollerProxy.address,
    _closeFactor,
    _liquidationIncentive,
    _minLiquidatableCollateral,
  );

  if (isTimeBased) {
    blocksPerYear = 0;
  }

  // Deploy VTokens
  const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
  const vTokenBeacon = await deployVTokenBeacon(undefined, maxBorrowRateMantissa, isTimeBased, blocksPerYear);
  vWBTC = await makeVToken({
    underlying: mockWBTC,
    comptroller: comptrollerProxy,
    accessControlManager: fakeAccessControlManager,
    admin: root,
    beacon: vTokenBeacon,
    isTimeBased: isTimeBased,
    blocksPerYear: blocksPerYear,
  });

  vDAI = await makeVToken({
    underlying: mockDAI,
    comptroller: comptrollerProxy,
    accessControlManager: fakeAccessControlManager,
    admin: root,
    beacon: vTokenBeacon,
    isTimeBased: isTimeBased,
    blocksPerYear: blocksPerYear,
  });

  const wbtcInitialSupply = parseUnits("10", 8);
  await mockWBTC.faucet(wbtcInitialSupply);
  await mockWBTC.approve(poolRegistry.address, wbtcInitialSupply);
  await poolRegistry.addMarket({
    vToken: vWBTC.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply: wbtcInitialSupply,
    vTokenReceiver: root.address,
    supplyCap: parseUnits("1000", 8),
    borrowCap: parseUnits("1000", 8),
  });

  vDAI = await makeVToken({
    underlying: mockDAI,
    comptroller: comptrollerProxy,
    accessControlManager: fakeAccessControlManager,
    admin: root,
    beacon: vTokenBeacon,
  });

  const daiInitialSupply = parseUnits("1000", 18);
  await mockDAI.faucet(daiInitialSupply);
  await mockDAI.approve(poolRegistry.address, daiInitialSupply);
  await poolRegistry.addMarket({
    vToken: vDAI.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply: daiInitialSupply,
    vTokenReceiver: root.address,
    supplyCap: parseUnits("1000000", 18),
    borrowCap: parseUnits("1000000", 18),
  });

  const [, , user] = await ethers.getSigners();

  // Enter Markets
  await comptrollerProxy.enterMarkets([vDAI.address, vWBTC.address]);
  await comptrollerProxy.enterMarkets([vDAI.address, vWBTC.address]);
  await comptrollerProxy.connect(user).enterMarkets([vDAI.address, vWBTC.address]);

  xvs = await MockToken.deploy("Venus Token", "XVS", 18);

  // Configure rewards for pool
  rewardsDistributor = (await upgrades.deployProxy(
    RewardsDistributor,
    [comptrollerProxy.address, xvs.address, maxLoopsLimit, fakeAccessControlManager.address],
    { constructorArgs: [isTimeBased, blocksPerYear], unsafeAllow: ["internal-function-storage"] },
  )) as RewardsDistributor;

  const rewardsDistributor2 = await upgrades.deployProxy(
    RewardsDistributor,
    [comptrollerProxy.address, mockDAI.address, maxLoopsLimit, fakeAccessControlManager.address],
    { constructorArgs: [isTimeBased, blocksPerYear], unsafeAllow: ["internal-function-storage"] },
  );
  const initialXvs = convertToUnit(1000000, 18);
  await xvs.faucet(initialXvs);
  await xvs.transfer(rewardsDistributor.address, initialXvs);

  await comptrollerProxy.addRewardsDistributor(rewardsDistributor.address);
  await comptrollerProxy.addRewardsDistributor(rewardsDistributor2.address);

  fakeAccessControlManager.isAllowedToCall.returns(true);

  await rewardsDistributor.setRewardTokenSpeeds(
    [vWBTC.address, vDAI.address],
    [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
    [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
  );

  await rewardsDistributor2.setRewardTokenSpeeds(
    [vWBTC.address, vDAI.address],
    [convertToUnit(0.4, 18), convertToUnit(0.3, 18)],
    [convertToUnit(0.2, 18), convertToUnit(0.1, 18)],
  );
}

for (const isTimeBased of [false, true]) {
  const description: string = getDescription(isTimeBased);

  describe(`${description}Rewards: Tests`, async function () {
    /**
     * Deploying required contracts along with the poolRegistry.
     */
    beforeEach(async function () {
      await rewardsFixture(isTimeBased);
      fakeAccessControlManager.isAllowedToCall.reset();
      fakeAccessControlManager.isAllowedToCall.returns(true);
    });

    it("should revert when setting LastRewarding block or timestamp on invalid operation", async () => {
      let lastRewardingBlockOrTimestamp;
      if (!isTimeBased) {
        lastRewardingBlockOrTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 2;

        await expect(
          rewardsDistributor.setLastRewardingBlockTimestamps(
            [vWBTC.address, vDAI.address],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
          ),
        ).to.be.revertedWith("Time-based operation only");
      } else {
        lastRewardingBlockOrTimestamp = (await ethers.provider.getBlock("latest")).number + 2;

        await expect(
          rewardsDistributor.setLastRewardingBlocks(
            [vWBTC.address, vDAI.address],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
          ),
        ).to.be.revertedWith("Block-based operation only");
      }
    });

    it("Reverts if setting the speed is prohibited by ACM", async () => {
      fakeAccessControlManager.isAllowedToCall
        .whenCalledWith(root.address, "setRewardTokenSpeeds(address[],uint256[],uint256[])")
        .returns(false);
      await expect(
        rewardsDistributor.setRewardTokenSpeeds(
          [vWBTC.address, vDAI.address],
          [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
          [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
        ),
      ).to.be.revertedWithCustomError(rewardsDistributor, "Unauthorized");
    });

    it("Should have correct btc balance", async function () {
      const [owner] = await ethers.getSigners();

      const btcBalance = await mockWBTC.balanceOf(owner.address);

      expect(btcBalance).equal(convertToUnit(1000, 8));
    });

    it("Pool should have correct name", async function () {
      // Get all pools list.
      const pools = await poolRegistry.callStatic.getAllPools();
      expect(pools[0].name).equal("Pool 1");
    });

    it("Rewards distributor should have correct balance", async function () {
      expect(await xvs.balanceOf(rewardsDistributor.address)).equal(convertToUnit(1000000, 18));
    });

    it("Should have correct market addresses", async function () {
      const [owner] = await ethers.getSigners();

      const res = await comptrollerProxy.getAssetsIn(owner.address);
      expect(res[0]).equal(vDAI.address);
      expect(res[1]).equal(vWBTC.address);
    });

    it("Comptroller returns correct reward speeds", async function () {
      const res = await comptrollerProxy.getRewardsByMarket(vDAI.address);
      expect(res[0][0]).equal(xvs.address);
      expect(res[0][1].toString()).equal(convertToUnit(0.5, 18));
      expect(res[0][2].toString()).equal(convertToUnit(0.5, 18));
      expect(res[1][0]).equal(mockDAI.address);
      expect(res[1][1].toString()).equal(convertToUnit(0.3, 18));
      expect(res[1][2].toString()).equal(convertToUnit(0.1, 18));
    });

    it("Can add reward distributors with duplicate reward tokens", async function () {
      const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
      rewardsDistributor = (await upgrades.deployProxy(
        RewardsDistributor,
        [comptrollerProxy.address, xvs.address, maxLoopsLimit, fakeAccessControlManager.address],
        { constructorArgs: [isTimeBased, blocksPerYear], unsafeAllow: ["internal-function-storage"] },
      )) as RewardsDistributor;

      await expect(comptrollerProxy.addRewardsDistributor(rewardsDistributor.address))
        .to.emit(comptrollerProxy, "NewRewardsDistributor")
        .withArgs(rewardsDistributor.address, xvs.address);
    });

    it("Emits event correctly", async () => {
      const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
      rewardsDistributor = (await upgrades.deployProxy(
        RewardsDistributor,
        [comptrollerProxy.address, mockWBTC.address, maxLoopsLimit, fakeAccessControlManager.address],
        { constructorArgs: [isTimeBased, blocksPerYear], unsafeAllow: ["internal-function-storage"] },
      )) as RewardsDistributor;

      await expect(comptrollerProxy.addRewardsDistributor(rewardsDistributor.address))
        .to.emit(comptrollerProxy, "NewRewardsDistributor")
        .withArgs(rewardsDistributor.address, mockWBTC.address);
    });

    const printNow = async (label: string) => {
      const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const blockNumber = (await ethers.provider.getBlock("latest")).number;
      console.log(label, { blockTimestamp, blockNumber });
    };

    it("Claim XVS", async () => {
      await network.provider.send("evm_setAutomine", [false]);
      const [, user1, user2] = await ethers.getSigners();

      await printNow("1");

      const startBalanceUser2 = await xvs.balanceOf(user2.address);

      await mockWBTC.connect(user1).faucet(convertToUnit(100, 8));
      await mockDAI.connect(user2).faucet(convertToUnit(10000, 18));
      await mine();

      await mockWBTC.connect(user1).approve(vWBTC.address, convertToUnit(10, 8));
      await mine();
      await printNow("2");
      await vWBTC.connect(user1).mint(convertToUnit(10, 8));
      await mine();
      await printNow("3");

      await rewardsDistributor.functions["claimRewardToken(address,address[])"](user1.address, [
        vWBTC.address,
        vDAI.address,
      ]);
      await mine();
      await printNow("4");

      /*
        Formula: (supplyIndex * supplyTokens * blocksDelta) + (borrowIndex * borrowTokens * blocksDelta)
        0.5 * 10 * 5 = 25
      */
      expect((await xvs.balanceOf(user1.address)).toString()).to.be.equal(convertToUnit(0.25, 18));
      await printNow("5");

      await mockDAI.connect(user2).approve(vDAI.address, convertToUnit(10000, 18));
      await mine();
      await vDAI.connect(user2).mint(convertToUnit(10000, 18));
      await mine();
      await vWBTC.connect(user2).borrow(convertToUnit(0.01, 8));
      await mine();
      await printNow("6");

      await rewardsDistributor["claimRewardToken(address,address[])"](user2.address, [vWBTC.address, vDAI.address]);
      await mine();
      await printNow("7");

      const endBalanceUser2 = await xvs.balanceOf(user2.address);
      console.log({
        startBalanceUser2: startBalanceUser2.toString(),
        endBalanceUser2: endBalanceUser2.toString(),
        diff: endBalanceUser2.sub(startBalanceUser2).toString(),
      });
      expect((await xvs.balanceOf(user2.address)).toString()).to.be.equal(convertToUnit("1.40909090909090909", 18));
      await network.provider.send("evm_setAutomine", [true]);
    });

    it("Contributor Rewards", async () => {
      const [, user1] = await ethers.getSigners();

      expect((await xvs.balanceOf(user1.address)).toString()).to.be.equal("0");

      await rewardsDistributor.setContributorRewardTokenSpeed(user1.address, convertToUnit(0.5, 18));

      await mine(1000);
      await rewardsDistributor.updateContributorRewards(user1.address);

      await rewardsDistributor["claimRewardToken(address,address[])"](user1.address, [vWBTC.address, vDAI.address]);

      /*
        Formula: speed * blocks
        0.5 * 1001 = 500.5
      */
      expect((await xvs.balanceOf(user1.address)).toString()).be.equal(convertToUnit(500.5, 18));
    });

    it("Multiple reward distributors with same reward token", async () => {
      const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
      const newRewardsDistributor = (await upgrades.deployProxy(
        RewardsDistributor,
        [comptrollerProxy.address, xvs.address, maxLoopsLimit, fakeAccessControlManager.address],
        { constructorArgs: [isTimeBased, blocksPerYear], unsafeAllow: ["internal-function-storage"] },
      )) as RewardsDistributor;

      await comptrollerProxy.addRewardsDistributor(newRewardsDistributor.address);

      const initialXvs = convertToUnit(1000000, 18);
      await xvs.faucet(initialXvs);
      await xvs.transfer(newRewardsDistributor.address, initialXvs);

      const [, user1] = await ethers.getSigners();

      expect((await xvs.balanceOf(user1.address)).toString()).to.be.equal("0");

      await rewardsDistributor.setContributorRewardTokenSpeed(user1.address, convertToUnit(0.5, 18));
      await newRewardsDistributor.setContributorRewardTokenSpeed(user1.address, convertToUnit(0.5, 18));

      await mine(1000);
      await rewardsDistributor.updateContributorRewards(user1.address);
      await newRewardsDistributor.updateContributorRewards(user1.address);

      await rewardsDistributor["claimRewardToken(address,address[])"](user1.address, [vWBTC.address, vDAI.address]);
      await newRewardsDistributor["claimRewardToken(address,address[])"](user1.address, [vWBTC.address, vDAI.address]);

      /*
        Reward Distributor 1
        Formula: speed * blocks
        0.5 * 1001 = 500.5
  
        Reward Distributor 2
        Formula: speed * blocks
        0.5 * 1003 = 501.5
  
        Total xvs reward = 500.5 + 501.5 = 1002
      */
      expect((await xvs.balanceOf(user1.address)).toString()).be.equal(convertToUnit(1002, 18));
    });

    it("pause rewards", async () => {
      const [, user1, user2] = await ethers.getSigners();

      await mockWBTC.connect(user1).faucet(convertToUnit(100, 8));
      await mockDAI.connect(user2).faucet(convertToUnit(10000, 18));

      await mockWBTC.connect(user1).approve(vWBTC.address, convertToUnit(10, 8));
      await vWBTC.connect(user1).mint(convertToUnit(10, 8));

      let lastRewardingBlockOrTimestamp = (await ethers.provider.getBlock("latest")).number + 2;
      if (isTimeBased) {
        lastRewardingBlockOrTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 2;
      }

      if (!isTimeBased) {
        await rewardsDistributor.setLastRewardingBlocks(
          [vWBTC.address, vDAI.address],
          [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
          [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
        );
      } else {
        await rewardsDistributor.setLastRewardingBlockTimestamps(
          [vWBTC.address, vDAI.address],
          [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
          [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
        );
      }

      await mine(100);

      await rewardsDistributor.functions["claimRewardToken(address,address[])"](user1.address, [
        vWBTC.address,
        vDAI.address,
      ]);

      expect((await xvs.balanceOf(user1.address)).toString()).to.be.equal(convertToUnit(0.5, 18));

      if (!isTimeBased) {
        await expect(
          rewardsDistributor.setLastRewardingBlocks(
            [vWBTC.address, vDAI.address],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
          ),
        ).to.be.revertedWith("setting last rewarding block in the past is not allowed");
      } else {
        await expect(
          rewardsDistributor.setLastRewardingBlockTimestamps(
            [vWBTC.address, vDAI.address],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
            [lastRewardingBlockOrTimestamp - 10, lastRewardingBlockOrTimestamp - 10],
          ),
        ).to.be.revertedWith("setting last rewarding timestamp in the past is not allowed");
      }

      if (!isTimeBased) {
        lastRewardingBlockOrTimestamp = (await ethers.provider.getBlock("latest")).number + 2;
        await expect(
          rewardsDistributor.setLastRewardingBlocks(
            [vWBTC.address, vDAI.address],
            [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
            [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
          ),
        ).to.be.revertedWith("this RewardsDistributor is already locked");
      } else {
        lastRewardingBlockOrTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 2;
        await expect(
          rewardsDistributor.setLastRewardingBlockTimestamps(
            [vWBTC.address, vDAI.address],
            [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
            [lastRewardingBlockOrTimestamp, lastRewardingBlockOrTimestamp],
          ),
        ).to.be.revertedWith("this RewardsDistributor is already locked");
      }
    });
  });
}

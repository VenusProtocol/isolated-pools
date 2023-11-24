import { FakeContract, smock } from "@defi-wonderland/smock";
import { expect } from "chai";
import { Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  Beacon,
  Comptroller,
  MockToken,
  MockToken__factory,
  PoolRegistry,
} from "../../../typechain";
import { makeVToken } from "../util/TokenTestHelpers";

describe("VenusLens", () => {
  let VenusLens: Contract;
  const maxLoopsLimit = 150;
  let mockWBTC: MockToken;
  let comptrollerProxy: Comptroller;
  let vTokenBeacon: Beacon;
  let poolRegistry: PoolRegistry;
  let comptrollerBeacon: Beacon;
  let fakeAccessControlManager: FakeContract<AccessControlManager>;

  beforeEach(async () => {
    const VenusLensFactory = await ethers.getContractFactory("VenusLens");
    VenusLens = await VenusLensFactory.deploy();
  });

  describe("vTokenBalances", () => {
    it("is correct for vToken", async () => {
      const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
      mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
      fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
      fakeAccessControlManager.isAllowedToCall.returns(true);
      const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
      poolRegistry = (await upgrades.deployProxy(PoolRegistry, [fakeAccessControlManager.address])) as PoolRegistry;
      const Comptroller = await ethers.getContractFactory("Comptroller");
      comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });
      const [owner] = await ethers.getSigners();

      comptrollerProxy = await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
        maxLoopsLimit,
        fakeAccessControlManager.address,
      ]);

      const vToken = await makeVToken({
        underlying: mockWBTC,
        comptroller: comptrollerProxy,
        accessControlManager: fakeAccessControlManager,
        decimals: 8,
        initialExchangeRateMantissa: parseUnits("1", 18),
        admin: owner.address,
        beacon: vTokenBeacon,
      });
      const res = await VenusLens.callStatic.vTokenBalances(vToken.address, owner.address);
      expect(res.vToken).equal(vToken.address);
      expect(res.balanceOf).equal(0);
      expect(res.borrowBalanceCurrent).equal(0);
      expect(res.balanceOfUnderlying).equal(0);
      expect(res.tokenBalance).equal(0);
      expect(res.tokenAllowance).equal(0);
    });
  });

  describe("vTokenBalancesAll", () => {
    let mockDAI: MockToken;

    it("is correct for all vTokens", async () => {
      const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
      mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
      mockDAI = await MockToken.deploy("MakerDAO", "DAI", 18);
      await mockDAI.faucet(parseUnits("1000", 18));

      fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
      fakeAccessControlManager.isAllowedToCall.returns(true);
      const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
      poolRegistry = (await upgrades.deployProxy(PoolRegistry, [fakeAccessControlManager.address])) as PoolRegistry;
      const Comptroller = await ethers.getContractFactory("Comptroller");
      comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });
      const [owner] = await ethers.getSigners();

      comptrollerProxy = await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
        maxLoopsLimit,
        fakeAccessControlManager.address,
      ]);

      const vToken1 = await makeVToken({
        underlying: mockWBTC,
        comptroller: comptrollerProxy,
        accessControlManager: fakeAccessControlManager,
        decimals: 8,
        initialExchangeRateMantissa: parseUnits("1", 18),
        admin: owner.address,
        beacon: vTokenBeacon,
      });

      const vToken2 = await makeVToken({
        underlying: mockDAI,
        comptroller: comptrollerProxy,
        accessControlManager: fakeAccessControlManager,
        decimals: 8,
        initialExchangeRateMantissa: parseUnits("1", 18),
        admin: owner.address,
        beacon: vTokenBeacon,
      });

      const res = await VenusLens.callStatic.vTokenBalancesAll([vToken1.address, vToken2.address], owner.address);

      expect(res[0].vToken).equal(vToken1.address);
      expect(res[0].balanceOf).equal(0);
      expect(res[0].borrowBalanceCurrent).equal(0);
      expect(res[0].balanceOfUnderlying).equal(0);
      expect(res[0].tokenBalance).equal(0);
      expect(res[0].tokenAllowance).equal(0);

      expect(res[1].vToken).equal(vToken2.address);
      expect(res[1].balanceOf).equal(0);
      expect(res[1].borrowBalanceCurrent).equal(0);
      expect(res[1].balanceOfUnderlying).equal(0);
      expect(res[1].tokenBalance).equal(parseUnits("1000", 18));
      expect(res[1].tokenAllowance).equal(0);
    });
  });
});

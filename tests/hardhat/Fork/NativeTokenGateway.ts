import { expect } from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  AccessControlManager__factory,
  Comptroller,
  ERC20,
  NativeTokenGateway,
  VToken,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const ACM = "0x230058da2D23eb8836EC5DB7037ef7250c56E25E";
const ADMIN = "0x285960C5B22fD66A736C7136967A3eB15e93CC67";
const ORACLE = "0xd2ce3fb018805ef92b8C5976cb31F84b4E295F94";
const COMPTROLLER_BEACON = "0xAE2C3F21896c02510aA187BdA0791cDA77083708";
const VTOKEN_BEACON = "0xfc08aADC7a1A93857f6296C3fb78aBA1d286533a";
const COMPTROLLER_ADDRESS = "0x687a01ecF6d3907658f7A7c714749fAC32336D1B";
const POOL_REGISTRY = "0x61CAff113CCaf05FFc6540302c37adcf077C5179";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const VWETH = "0x7c8ff7d2A1372433726f879BD945fFb250B94c65";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const VUSDT = "0x8C3e3821259B82fFb32B2450A95d2dcbf161C24E";

const USER1 = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
const USER2 = "0x974CaA59e49682CdA0AD2bbe82983419A2ECC400";
const BLOCK_NUMBER = 19139865;

async function configureTimeLock() {
  impersonatedTimeLock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK;

let user1: Signer;
let user2: Signer;
let impersonatedTimeLock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vweth: VToken;
let usdt: ERC20;
let vusdt: VToken;
let nativeTokenGateway: NativeTokenGateway;

async function setup() {
  await configureTimeLock();

  user1 = await initMainnetUser(USER1, ethers.utils.parseEther("100"));
  user2 = await initMainnetUser(USER2, ethers.utils.parseEther("100"));

  usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", USDT);
  usdt = await ethers.getContractAt("WNative", USDT);
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimeLock);

  const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER_ADDRESS);
  const newComptrollerFactory = await ethers.getContractFactory("Comptroller");
  const newComptrollerImplementation = await newComptrollerFactory.deploy(POOL_REGISTRY);
  const beaconContract = await ethers.getContractAt("UpgradeableBeacon", COMPTROLLER_BEACON);

  const newVToken = await ethers.getContractFactory("VToken");
  const newVTokenImplementation = await newVToken.deploy();
  const vTokenBeaconContract = await ethers.getContractAt("UpgradeableBeacon", VTOKEN_BEACON);

  await beaconContract.connect(impersonatedTimeLock).upgradeTo(newComptrollerImplementation.address);
  await vTokenBeaconContract.connect(impersonatedTimeLock).upgradeTo(newVTokenImplementation.address);

  const oracle = await ethers.getContractAt("ResilientOracle", ORACLE);

  vusdt = await ethers.getContractAt("VToken", VUSDT);
  vweth = await ethers.getContractAt("VToken", VWETH);

  await comptroller
    .connect(impersonatedTimeLock)
    .setMarketSupplyCaps([VUSDT, VWETH], [parseUnits("10000", 18), parseUnits("10000", 18)]);

  await comptroller.connect(user1).enterMarkets([vusdt.address, vweth.address]);
  await comptroller.connect(user2).enterMarkets([vusdt.address, vweth.address]);

  const nativeTokenGatewayFactory = await ethers.getContractFactory("NativeTokenGateway");
  const nativeTokenGateway = await nativeTokenGatewayFactory.deploy(WETH, VWETH);

  return {
    oracle,
    usdt,
    accessControlManager,
    comptroller,
    vusdt,
    vweth,
    nativeTokenGateway,
  };
}

if (FORK && FORKED_NETWORK === "ethereum") {
  describe("NativeTokenGateway", async () => {
    const supplyAmount = parseUnits("10", 18);
    beforeEach("setup", async () => {
      await setForkBlock(BLOCK_NUMBER);
      ({ usdt, accessControlManager, comptroller, vusdt, nativeTokenGateway } = await setup());
    });

    describe("wrapAndSupply", () => {
      it("should wrap and supply eth", async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
        const balanceAfterSupplying = await vweth.balanceOf(await user1.getAddress());
        await expect(balanceAfterSupplying.toString()).to.closeTo(parseUnits("10", 8), parseUnits("1", 5));
      });
    });

    describe("redeemUnderlyingAndUnwrap", () => {
      beforeEach(async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      });

      it("should redeem underlying tokens and unwrap and send it to the user", async () => {
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

      it("should borrow and unwrap weth and send it to borrower", async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
        await usdt.connect(user2).approve(vusdt.address, parseUnits("5000", 6));

        await vusdt.connect(user2).mint(parseUnits("5000", 6));

        await comptroller.connect(user2).updateDelegate(nativeTokenGateway.address, true);

        const borrowAmount = parseUnits("2", 6);
        const user2BalancePrevious = await user2.getBalance();
        await nativeTokenGateway.connect(user2).borrowAndUnwrap(borrowAmount);

        expect(await user2.getBalance()).to.closeTo(user2BalancePrevious.add(borrowAmount), parseUnits("1", 16));
      });
    });

    describe("wrapAndRepay", () => {
      it("should wrap and repay", async () => {
        await usdt.connect(user2).approve(vusdt.address, parseUnits("5000", 6));
        await vusdt.connect(user2).mint(parseUnits("5000", 6));
        await vweth.connect(user2).borrow(parseUnits("1", 18));

        const userBalancePrevious = await user2.getBalance();
        await nativeTokenGateway.connect(user2).wrapAndRepay({ value: parseUnits("10", 18) });

        expect(await user2.getBalance()).to.closeTo(userBalancePrevious.sub(parseUnits("1", 18)), parseUnits("1", 18));
        expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
      });
    });
  });
}

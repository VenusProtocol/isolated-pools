import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  Comptroller,
  ERC20,
  VAI,
  VAIController,
  VToken,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const USER1 = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
const USER2 = "0xe2fc31F816A9b94326492132018C3aEcC4a93aE1";
const ADMIN = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const VUSDT = "0x5e3072305F9caE1c7A82F6Fe9E38811c74922c3B";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const VAI_ADDRESS = "0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd7";
const TREASURY = "0xf322942f644a996a617bd29c16bd7d231d9f35e9";
const ORACLE = "0x6592b5DE802159F3E74B2486b091D11a8256ab8A";
const POOL_REGISTRY = "0x9F7b01A536aFA00EF10310A162877fd792cD0666";
const COMPTROLLER_BEACON = "0x38B4Efab9ea1bAcD19dC81f19c4D1C2F9DeAe1B2";
const COMPTROLLER_ADDRESS = "0x94c1495cD4c557f1560Cbd68EAB0d197e6291571";
const BLOCK_NUMBER = 30245720;

async function configureTimeLock() {
  impersonatedTimeLock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

const FORK = process.env.FORK === "true";

let user1: Signer;
let user2: Signer;
let impersonatedTimeLock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vai: VAI;
let vaiController: VAIController;
let usdt: ERC20;
let vusdt: VToken;

async function setup() {
  await configureTimeLock();

  user1 = await initMainnetUser(USER1, ethers.utils.parseUnits("2"));
  user2 = await initMainnetUser(USER2, ethers.utils.parseUnits("2"));

  usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", USDT);
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimeLock);
  const vai = await ethers.getContractAt("VAI", VAI_ADDRESS);

  const vaiControllerFactory = await ethers.getContractFactory("VAIController");
  const vaiControllerBeacon = await upgrades.deployBeacon(vaiControllerFactory, { constructorArgs: [] });

  const vaiControllerProxy = (await upgrades.deployBeaconProxy(vaiControllerBeacon, vaiControllerFactory, [
    accessControlManager.address,
  ])) as VAIController;

  await vaiControllerProxy.transferOwnership(ADMIN);
  await vaiControllerProxy.connect(impersonatedTimeLock).acceptOwnership();

  const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER_ADDRESS);
  const newComptrollerFactory = await ethers.getContractFactory("Comptroller");
  const newComptrollerImplementation = await newComptrollerFactory.deploy(POOL_REGISTRY);
  const beaconContract = await ethers.getContractAt("UpgradeableBeacon", COMPTROLLER_BEACON);

  await beaconContract.connect(impersonatedTimeLock).upgradeTo(newComptrollerImplementation.address);
  const oracle = await ethers.getContractAt("ResilientOracle", ORACLE);

  vusdt = await ethers.getContractAt("VToken", VUSDT);

  await accessControlManager.giveCallPermission(vaiControllerProxy.address, "setVAIMintRate(uint256)", ADMIN);
  await accessControlManager.giveCallPermission(vaiControllerProxy.address, "setMintCap(uint256)", ADMIN);
  await accessControlManager.giveCallPermission(vaiControllerProxy.address, "setBaseRate(uint256)", ADMIN);
  await accessControlManager.giveCallPermission(vaiControllerProxy.address, "setFloatRate(uint256)", ADMIN);

  await comptroller.connect(impersonatedTimeLock).setVAIController(vaiControllerProxy.address);

  await vaiControllerProxy.connect(impersonatedTimeLock).setComptroller(comptroller.address);
  await vaiControllerProxy.connect(impersonatedTimeLock).setAccessControlManager(accessControlManager.address);
  await vaiControllerProxy.connect(impersonatedTimeLock).setVAIToken(vai.address);
  await vaiControllerProxy.connect(impersonatedTimeLock).setVAIMintRate(BigNumber.from(10000));
  await vaiControllerProxy.connect(impersonatedTimeLock).setReceiver(TREASURY);
  await vaiControllerProxy.connect(impersonatedTimeLock).setMintCap(BigNumber.from(10000));

  await vai.connect(impersonatedTimeLock).rely(vaiControllerProxy.address);

  return {
    usdt,
    accessControlManager,
    comptroller,
    oracle,
    vai,
    vaiController: vaiControllerProxy,
    vusdt,
  };
}

if (FORK) {
  describe("VAIController", async () => {
    beforeEach("setup", async () => {
      await setForkBlock(BLOCK_NUMBER);

      ({ usdt, accessControlManager, comptroller, vai, vaiController, vusdt } = await setup());
      await comptroller.connect(user1).enterMarkets([vusdt.address]);
      await usdt.connect(user1).approve(vusdt.address, convertToUnit(200, 18));
      await vusdt.connect(user1).mint(convertToUnit(200, 18));
    });

    describe("getMintableVAI", async () => {
      it("success", async () => {
        const res = await vaiController.getMintableVAI(await user1.getAddress());

        // As collateral factor is 75% and we minted 200 USDT so mintable VAI amount would be around 150 VAI Tokens
        expect(res).to.closeTo(convertToUnit(150, 18), convertToUnit(1, 18));
      });
    });

    describe("mintVAI", async () => {
      it("success", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));

        expect(await vai.balanceOf(await user1.getAddress())).to.eq(convertToUnit(100, 18));
        expect(await vaiController.mintedVAIs(await user1.getAddress())).to.eq(convertToUnit(100, 18));
      });
    });

    describe("repayVAI", async () => {
      beforeEach("mintVAI", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
        expect(await vai.balanceOf(await user1.getAddress())).to.eq(convertToUnit(100, 18));
        await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
      });

      it("success for zero rate", async () => {
        await vaiController.connect(user1).repayVAI(convertToUnit(100, 18));

        expect(await vai.balanceOf(await user1.getAddress())).to.eq(0);
        expect(await vaiController.mintedVAIs(await user1.getAddress())).to.eq(0);
      });

      it("success for 0.2 rate repay all", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(2, 17));
        const oldTreasuryBalance = await vai.balanceOf(TREASURY);
        await vaiController.connect(user1).repayVAI(convertToUnit(100, 18));

        expect(await vai.balanceOf(TREASURY)).to.be.greaterThan(oldTreasuryBalance);
        expect(await vai.balanceOf(await user1.getAddress())).to.be.greaterThan(0);

        // When repaying VAI the current interest after burning the minted amount and the past interest is stored in the minted vai mapping
        expect(await vaiController.mintedVAIs(await user1.getAddress())).to.closeTo(0, convertToUnit(1, 13));
      });

      it("success for 0.2 rate repay half", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(2, 17));
        const oldTreasuryBalance = await vai.balanceOf(TREASURY);
        await vaiController.connect(user1).repayVAI(convertToUnit(50, 18));

        expect(await vai.balanceOf(TREASURY)).to.be.greaterThan(oldTreasuryBalance);
        expect(await vai.balanceOf(await user1.getAddress())).to.closeTo(convertToUnit(50, 18), convertToUnit(1, 5));
        // When repaying VAI the current interest after burning the minted amount and the past interest is stored in the minted vai mapping
        expect(await vaiController.mintedVAIs(await user1.getAddress())).to.closeTo(
          convertToUnit(50, 18),
          convertToUnit(1, 13),
        );
      });
    });

    describe("liquidateVAI", async () => {
      beforeEach("user1 borrow", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
        await comptroller.connect(impersonatedTimeLock).setCloseFactor(convertToUnit(6, 17));
      });

      it("success for zero rate 0.1 vusdt collateralFactor", async () => {
        await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);
        await comptroller
          .connect(impersonatedTimeLock)
          .setCollateralFactor(vusdt.address, convertToUnit(1, 17), convertToUnit(1, 17));

        const user2VaiBalancePrevious = await vai.balanceOf(await user2.getAddress());
        await vaiController.connect(user2).liquidateVAI(await user1.getAddress(), convertToUnit(60, 18), vusdt.address);
        const user2VaiBalanceCurrent = await vai.balanceOf(await user2.getAddress());

        expect(user2VaiBalanceCurrent).to.eq(user2VaiBalancePrevious.sub(convertToUnit(60, 18)));
      });

      it("success for 0.2 base rate 0.3 vusdt collateralFactor", async () => {
        await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(2, 17));

        await mine(1000);

        await comptroller
          .connect(impersonatedTimeLock)
          .setCollateralFactor(vusdt.address, convertToUnit(3, 17), convertToUnit(3, 17));

        const user2VaiBalancePrevious = await vai.balanceOf(await user2.getAddress());
        const treasuryVaiBalancePrevious = await vai.balanceOf(TREASURY);
        await vaiController.connect(user2).liquidateVAI(await user1.getAddress(), convertToUnit(50, 18), vusdt.address);
        const user2VaiBalanceCurrent = await vai.balanceOf(await user2.getAddress());
        const treasuryVaiBalanceCurrent = await vai.balanceOf(TREASURY);

        expect(user2VaiBalanceCurrent).to.closeTo(user2VaiBalancePrevious.sub(convertToUnit(50, 18)), 100);
        expect(treasuryVaiBalanceCurrent).to.be.greaterThan(treasuryVaiBalancePrevious);
        expect(await vaiController.mintedVAIs(await user1.getAddress())).to.closeTo(
          convertToUnit(50, 18),
          convertToUnit(1, 15),
        );
      });
    });

    describe("getHypotheticalAccountLiquidity", async () => {
      beforeEach("user1 borrow", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
        expect(await vaiController.mintedVAIs(await user1.getAddress())).to.eq(convertToUnit(100, 18));
        expect(await vai.balanceOf(await user1.getAddress())).to.eq(convertToUnit(100, 18));
      });

      it("success for zero rate 0.9 vusdt collateralFactor", async () => {
        await comptroller
          .connect(impersonatedTimeLock)
          .setCollateralFactor(vusdt.address, convertToUnit(9, 17), convertToUnit(9, 17));
        const res = await comptroller.getHypotheticalAccountLiquidity(
          await user1.getAddress(),
          ethers.constants.AddressZero,
          BigNumber.from(0),
          BigNumber.from(0),
        );
        expect(res[1]).to.closeTo(convertToUnit(799489, 14), convertToUnit(1, 16));
        expect(res[2]).to.equal(convertToUnit(0, 18));
      });

      it("success for 0.2 rate 0.9 vusdt collateralFactor", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(2, 17));
        await mine(10000);
        await vaiController.accrueVAIInterest();
        await comptroller
          .connect(impersonatedTimeLock)
          .setCollateralFactor(vusdt.address, convertToUnit(9, 17), convertToUnit(9, 17));

        const res = await comptroller.getHypotheticalAccountLiquidity(
          await user1.getAddress(),
          ethers.constants.AddressZero,
          0,
          0,
        );

        expect(res[1]).to.closeTo(convertToUnit(799298, 14), convertToUnit(1, 14));
        expect(res[2]).to.equal(convertToUnit(0, 18));
      });
    });

    describe("getVAIRepayRate", async () => {
      it("success for zero baseRate", async () => {
        const res = await vaiController.getVAIRepayRate();
        expect(res).to.eq(0);
      });

      it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(1, 17));
        await vaiController.connect(impersonatedTimeLock).setFloatRate(convertToUnit(1, 17));

        const vaiRepayRate = await vaiController.getVAIRepayRate();
        expect(vaiRepayRate).to.closeTo(convertToUnit(1, 17), convertToUnit(1, 16));
      });
    });

    describe("getVAIRepayAmount", async () => {
      beforeEach("mintVAI", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
        expect(await vai.balanceOf(await user1.getAddress())).to.eq(convertToUnit(100, 18));
        await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
      });

      it("success for zero rate", async () => {
        expect(await vaiController.getVAIRepayAmount(await user1.getAddress())).to.eq(convertToUnit(100, 18));
      });

      it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(1, 17));
        await vaiController.connect(impersonatedTimeLock).setFloatRate(convertToUnit(1, 17));
        await mine(1000);
        await vaiController.accrueVAIInterest();

        expect(await vaiController.getVAIRepayAmount(await user1.getAddress())).to.closeTo(
          convertToUnit(100, 18),
          convertToUnit(1, 15),
        );
      });
    });

    describe("getVAICalculateRepayAmount", async () => {
      beforeEach("mintVAI", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
        expect(await vai.balanceOf(await user1.getAddress())).to.eq(convertToUnit(100, 18));
        await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
      });

      it("success for zero rate", async () => {
        const repayAmount = await vaiController.getVAICalculateRepayAmount(
          await user1.getAddress(),
          convertToUnit(50, 18),
        );
        expect(repayAmount[0]).to.eq(convertToUnit(50, 18));
      });

      it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(1, 17));
        await vaiController.connect(impersonatedTimeLock).setFloatRate(convertToUnit(1, 17));
        await mine(1000);
        await vaiController.accrueVAIInterest();

        const result = await vaiController.getVAICalculateRepayAmount(await user1.getAddress(), convertToUnit(100, 18));
        expect(result[0]).to.closeTo(convertToUnit(100, 18), convertToUnit(1, 17));
        expect(result[1]).to.closeTo(convertToUnit(1, 15), convertToUnit(1, 14));
        expect(result[2]).to.eq(convertToUnit(0, 18));
      });
    });

    describe("getMintableVAI", async () => {
      beforeEach("mintVAI", async () => {
        await vaiController.connect(user1).mintVAI(convertToUnit(50, 18));
        expect(await vai.balanceOf(await user1.getAddress())).to.eq(convertToUnit(50, 18));
        await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
      });

      it("include current interest when calculating mintable VAI", async () => {
        await vaiController.connect(impersonatedTimeLock).setBaseRate(convertToUnit(1, 17));
        await vaiController.accrueVAIInterest();

        const userMintableVaiAmount = await vaiController.getMintableVAI(await user1.getAddress());
        expect(await vaiController.getVAIRepayAmount(await user1.getAddress())).to.closeTo(
          convertToUnit(50, 18),
          convertToUnit(1, 14),
        );
        expect(userMintableVaiAmount).to.closeTo(convertToUnit(100, 18), convertToUnit(1, 17));
      });
    });
  });
}

// assumes we're forking zksyncmainnet at any recent block, e.g.
// anvil-zksync fork --fork-url mainnet --fork-block-number 59265626
import { smock } from "@defi-wonderland/smock";
import { Deployer } from "@matterlabs/hardhat-zksync";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BytesLike, formatUnits, parseUnits } from "ethers/lib/utils";
import hre from "hardhat";
import { ethers } from "hardhat";
import { Provider, Wallet } from "zksync-ethers";

import {
  AccessControlManager__factory,
  Comptroller__factory,
  UpgradeableBeacon__factory,
  VToken__factory,
  WUSDMLiquidator,
} from "../../../typechain";
import { initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK;

if (FORK) console.log(`fork tests are running on: ${FORKED_NETWORK}`);

const TIMELOCK = "0x093565Bc20AA326F4209eBaF3a26089272627613";
const ACM = "0x526159A92A82afE5327d37Ef446b68FD9a5cA914";
const PROXY_ADMIN = "0x8Ea1A989B036f7Ef21bb95CE4E7961522Ca00287";
const POOL_REGISTRY = "0xFD96B926298034aed9bBe0Cca4b651E41eB87Bc4";
const COMPTROLLER_BEACON = "0x0221415aF47FD261dD39B72018423dADe5d937c5";
const ORIGINAL_IMPLEMENTATION = "0xB2B58B15667e39dc09A0e29f1863eee7FD495541";

const COMPTROLLER = "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1";
const VWUSDM = "0x183dE3C349fCf546aAe925E1c7F364EA6FB4033c";
const VWETH = "0x1Fa916C27c7C2c4602124A14C77Dbb40a5FF1BE8";
const VUSDCE = "0x1aF23bD57c62A99C59aD48236553D0Dd11e49D2D";
const VUSDT = "0x69cDA960E3b20DFD480866fFfd377Ebe40bd0A46";

const A1 = "0x68c8020A052d5061760e2AbF5726D59D4ebe3506";
const A2 = "0x4C0e4B3e6c5756fb31886a0A01079701ffEC0561";
const A3 = "0x924EDEd3D010b3F20009b872183eec48D0111265";
const A4 = "0x2B379d8c90e02016658aD00ba2566F55E814C369";
const A5 = "0xfffAB9120d9Df39EEa07063F6465a0aA45a80C52";

const ORIGINAL_MIN_LIQUIDATABLE_COLLATERAL = parseUnits("100", 18);
const ORIGINAL_LT = parseUnits("0.78");
const ORIGINAL_PROTOCOL_SEIZE_SHARE = parseUnits("0.05", 18);
const ORIGINAL_CLOSE_FACTOR = parseUnits("0.5", 18);

const USDM_MINTER = "0xd9dF2f01183eA1738f7C9a5314440f04e4B28b21";
const USDM = "0x7715c206A14Ac93Cb1A6c0316A6E5f8aD7c9Dc31";
const WUSDM = "0xA900cbE7739c96D2B153a273953620A701d5442b";
const USDM_MINT_AMOUNT = parseUnits("1200000", 18);

const DEPLOYER_PRIVATE_KEY = `0x${process.env["DEPLOYER_PRIVATE_KEY"]}` as BytesLike;

const USDM_INTERFACE = new ethers.utils.Interface([
  "function mint(address,uint256) external",
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
]);

const WUSDM_INTERFACE = new ethers.utils.Interface([
  "function deposit(uint256,address) external returns (uint256)",
  "function transfer(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
]);

if (FORK && FORKED_NETWORK === "zksyncmainnet") {
  describe("Repay and liquidate", () => {
    const provider = new Provider({ url: "http://127.0.0.1:8011", timeout: 1200000 });
    const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const deployer = new Deployer(hre, wallet);

    const comptroller = Comptroller__factory.connect(COMPTROLLER, provider);
    const beacon = UpgradeableBeacon__factory.connect(COMPTROLLER_BEACON, provider);
    const acm = AccessControlManager__factory.connect(ACM, provider);
    const vwUSDM = VToken__factory.connect(VWUSDM, provider);
    const vWETH = VToken__factory.connect(VWETH, provider);
    const vUSDCe = VToken__factory.connect(VUSDCE, provider);
    const vUSDT = VToken__factory.connect(VUSDT, provider);
    const wUSDM = new ethers.Contract(WUSDM, WUSDM_INTERFACE, provider);
    const usdm = new ethers.Contract(USDM, USDM_INTERFACE, provider);

    let timelock: SignerWithAddress;
    let usdmMinter: SignerWithAddress;
    let wUSDMLiquidator: WUSDMLiquidator;

    before(async () => {
      timelock = await initMainnetUser(TIMELOCK, ethers.utils.parseUnits("2"));
      usdmMinter = await initMainnetUser(USDM_MINTER, ethers.utils.parseUnits("2"));
      await setBalance(wallet.address, ethers.utils.parseUnits("2"));

      const wUSDMLiquidatorImpl = await deployer.deploy("WUSDMLiquidator");
      const data = (await wUSDMLiquidatorImpl.populateTransaction.initialize()).data;
      const proxy = await deployer.deploy(
        "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
        [wUSDMLiquidatorImpl.address, PROXY_ADMIN, data],
      );
      wUSDMLiquidator = new ethers.Contract(proxy.address, wUSDMLiquidatorImpl.interface, wallet) as WUSDMLiquidator;
    });

    describe("Prerequisites – Mountain protocol team", () => {
      it("should mint USDM", async () => {
        await usdm.connect(usdmMinter).mint(USDM_MINTER, USDM_MINT_AMOUNT);
        expect(await usdm.balanceOf(USDM_MINTER)).to.be.gte(USDM_MINT_AMOUNT);
      });

      it("should deposit USDM to wUSDM", async () => {
        await usdm.connect(usdmMinter).approve(WUSDM, USDM_MINT_AMOUNT);
        await wUSDM.connect(usdmMinter).deposit(USDM_MINT_AMOUNT, USDM_MINTER);
      });

      it("should transfer wUSDM to the auxiliary contract", async () => {
        const wUSDMAmount = await wUSDM.balanceOf(USDM_MINTER);
        await wUSDM.connect(usdmMinter).transfer(wUSDMLiquidator.address, wUSDMAmount);
      });
    });

    describe("VIP", () => {
      describe("Temporary configuration", async () => {
        it("should upgrade comptroller", async () => {
          const temporaryImpl = await deployer.deploy("Comptroller", [POOL_REGISTRY]);
          await beacon.connect(timelock).upgradeTo(temporaryImpl.address);
        });

        it("should allow WUSDM Liquidator to add a temporary configuration", async () => {
          await acm
            .connect(timelock)
            .giveCallPermission(
              ethers.constants.AddressZero,
              "setMinLiquidatableCollateral(uint256)",
              wUSDMLiquidator.address,
            );
          await acm
            .connect(timelock)
            .giveCallPermission(ethers.constants.AddressZero, "setCloseFactor(uint256)", wUSDMLiquidator.address);
          await acm
            .connect(timelock)
            .giveCallPermission(
              ethers.constants.AddressZero,
              "setCollateralFactor(address,uint256,uint256)",
              wUSDMLiquidator.address,
            );
          await acm
            .connect(timelock)
            .giveCallPermission(
              ethers.constants.AddressZero,
              "setActionsPaused(address[],uint256[],bool)",
              wUSDMLiquidator.address,
            );
          await acm
            .connect(timelock)
            .giveCallPermission(
              ethers.constants.AddressZero,
              "setProtocolSeizeShare(uint256)",
              wUSDMLiquidator.address,
            );
        });
      });

      describe("Actual liquidation", () => {
        it("runs the auxiliary contract successfully", async () => {
          await wUSDMLiquidator.connect(wallet).run();
        });
      });

      describe("Restoring the original config", () => {
        it("restores the original Comptroller implementation", async () => {
          await beacon.connect(timelock).upgradeTo(ORIGINAL_IMPLEMENTATION);
        });

        it("revokes the permissions", async () => {
          await acm
            .connect(timelock)
            .revokeCallPermission(
              ethers.constants.AddressZero,
              "setMinLiquidatableCollateral(uint256)",
              wUSDMLiquidator.address,
            );
          await acm
            .connect(timelock)
            .revokeCallPermission(ethers.constants.AddressZero, "setCloseFactor(uint256)", wUSDMLiquidator.address);
          await acm
            .connect(timelock)
            .revokeCallPermission(
              ethers.constants.AddressZero,
              "setCollateralFactor(address,uint256,uint256)",
              wUSDMLiquidator.address,
            );
          await acm
            .connect(timelock)
            .revokeCallPermission(
              ethers.constants.AddressZero,
              "setActionsPaused(address[],uint256[],bool)",
              wUSDMLiquidator.address,
            );
          await acm
            .connect(timelock)
            .revokeCallPermission(
              ethers.constants.AddressZero,
              "setProtocolSeizeShare(uint256)",
              wUSDMLiquidator.address,
            );
        });
      });
    });

    describe("Post-VIP state", () => {
      describe(A1, () => {
        it(`keeps 805315.832951034118725452 wUSDM of debt in ${A1}`, async () => {
          expect(await vwUSDM.callStatic.borrowBalanceCurrent(A1)).to.equal(parseUnits("805315.832951034118725452"));
        });

        it(`keeps 287 wei of vWETH collateral in ${A1}`, async () => {
          expect(await vWETH.balanceOf(A1)).to.equal(287);
        });
      });

      describe(A2, () => {
        it(`leaves 1 wei of WETH debt in ${A2}`, async () => {
          expect(await vWETH.callStatic.borrowBalanceCurrent(A2)).to.equal(1);
        });

        it(`leaves 15890.96471584 vwUSDM of collateral in ${A2}`, async () => {
          expect(await vwUSDM.balanceOf(A2)).to.equal(parseUnits("15890.96471584", 8));
        });
      });

      describe(A3, () => {
        it(`leaves 1 wei of USDC.e debt in ${A3}`, async () => {
          expect(await vUSDCe.callStatic.borrowBalanceCurrent(A3)).to.equal(1);
        });

        it(`leaves 1 wei of USDT debt in ${A3}`, async () => {
          expect(await vUSDT.callStatic.borrowBalanceCurrent(A3)).to.equal(1);
        });

        it(`leaves less than 100 wei of vwUSDM collateral in ${A3}`, async () => {
          expect(await vwUSDM.balanceOf(A3)).to.be.lt(100);
        });
      });

      describe(A4, () => {
        it(`leaves 1 wei of USDC.e debt in ${A4}`, async () => {
          expect(await vUSDCe.callStatic.borrowBalanceCurrent(A4)).to.equal(1);
        });

        it(`leaves 1 wei of USDT debt in ${A4}`, async () => {
          expect(await vUSDT.callStatic.borrowBalanceCurrent(A4)).to.equal(1);
        });

        it(`leaves less than 100 wei of vwUSDM collateral in ${A4}`, async () => {
          expect(await vwUSDM.balanceOf(A4)).to.be.lt(100);
        });
      });

      describe(A5, () => {
        it(`leaves 1 wei of USDC.e debt in ${A5}`, async () => {
          expect(await vUSDCe.callStatic.borrowBalanceCurrent(A5)).to.equal(1);
        });

        it(`leaves 1 wei of USDT debt in ${A5}`, async () => {
          expect(await vUSDT.callStatic.borrowBalanceCurrent(A5)).to.equal(1);
        });

        it(`leaves less than 100 wei of vwUSDM collateral in ${A5}`, async () => {
          expect(await vwUSDM.balanceOf(A5)).to.be.lt(100);
        });
      });

      describe("Restores the parameters correctly", () => {
        it(`sets protocol seize share to ${formatUnits(ORIGINAL_PROTOCOL_SEIZE_SHARE, 18)}`, async () => {
          for (const vToken of [vwUSDM, vWETH, vUSDCe, vUSDT]) {
            expect(await vToken.protocolSeizeShareMantissa()).to.equal(ORIGINAL_PROTOCOL_SEIZE_SHARE);
          }
        });

        it(`sets the close factor to ${formatUnits(ORIGINAL_CLOSE_FACTOR, 18)}`, async () => {
          expect(await comptroller.closeFactorMantissa()).to.equal(ORIGINAL_CLOSE_FACTOR);
        });

        it(`sets min liquidatable collateral to ${formatUnits(ORIGINAL_MIN_LIQUIDATABLE_COLLATERAL, 18)}`, async () => {
          expect(await comptroller.minLiquidatableCollateral()).to.equal(ORIGINAL_MIN_LIQUIDATABLE_COLLATERAL);
        });

        it("keeps supply, borrow and enter market actions paused for vWUSDM", async () => {
          expect(await comptroller.actionPaused(VWUSDM, 0)).to.equal(true);
          expect(await comptroller.actionPaused(VWUSDM, 2)).to.equal(true);
          expect(await comptroller.actionPaused(VWUSDM, 7)).to.equal(true);
        });

        it(`keeps CF 0 and LT ${formatUnits(ORIGINAL_LT)} for vwUSDM`, async () => {
          const marketInfo = await comptroller.markets(VWUSDM);
          expect(marketInfo.collateralFactorMantissa).to.equal(0);
          expect(marketInfo.liquidationThresholdMantissa).to.equal(ORIGINAL_LT);
        });
      });
    });
  });
}

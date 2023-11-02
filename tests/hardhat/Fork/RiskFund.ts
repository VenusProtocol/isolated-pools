import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  AccessControlManager__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  IMockProtocolShareReserve,
  IMockProtocolShareReserve__factory,
  PancakeRouter,
  PancakeRouter__factory,
  ProtocolShareReserve,
  ProtocolShareReserve__factory,
  RiskFund,
  RiskFund__factory,
  Shortfall,
  Shortfall__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const FORKING = process.env.FORKING === "true";
const network = process.env.NETWORK_NAME || "bsc";

const {
  ACM,
  PSR,
  ADMIN,
  USDT,
  VUSDT,
  TOKEN1,
  TOKEN2,
  VTOKEN1,
  VTOKEN2,
  COMPTROLLER,
  RISKFUND,
  TREASURY,
  SHORTFALL,
  USDT_HOLDER,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  SWAP_ROUTER_CORE_POOL,
  BLOCK_NUMBER,
} = getContractAddresses(network as string);

let token1: IERC20;
let token2: IERC20;
let vToken1: VToken;
let vToken2: VToken;
let comptroller: Comptroller;
let riskFund: RiskFund;
let shortfall: Shortfall;
let token1Holder: SignerWithAddress;
let token2Holder: SignerWithAddress;
let impersonatedTimelock: SignerWithAddress;
let accessControlManager: AccessControlManager;
let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
let protocolShareReserve: ProtocolShareReserve | IMockProtocolShareReserve;
let TOKEN1_ADDRESS: string = TOKEN1;
let VTOKEN1_ADDRESS: string = VTOKEN1;

let token1Reserve = parseUnits("100", 18);
const token2Reserve = parseUnits("100", 18);
let minAmountOut = parseUnits("10", 18);

if (network != "sepolia") {
  TOKEN1_ADDRESS = USDT;
  VTOKEN1_ADDRESS = VUSDT;
}
const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

const initPancakeSwapRouter = async (
  admin: SignerWithAddress,
): Promise<PancakeRouter | FakeContract<PancakeRouter>> => {
  let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
  if (network == "bsc" || network == "bsctestnet") {
    pancakeSwapRouter = PancakeRouter__factory.connect(SWAP_ROUTER_CORE_POOL, admin);
  } else {
    const pancakeSwapRouterFactory = await smock.mock<PancakeRouter__factory>("PancakeRouter");
    pancakeSwapRouter = await pancakeSwapRouterFactory.deploy(SWAP_ROUTER_CORE_POOL, admin.address);
    await pancakeSwapRouter.deployed();
  }

  await token1.connect(token1Holder).transfer(pancakeSwapRouter.address, parseUnits("1000", 18));
  await token2.connect(token2Holder).transfer(pancakeSwapRouter.address, parseUnits("1000", 18));

  return pancakeSwapRouter;
};

const riskFundFixture = async (): Promise<void> => {
  await setForkBlock(BLOCK_NUMBER);
  await configureTimelock();

  token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));
  token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));
  if (network != "sepolia") token1Holder = await initMainnetUser(USDT_HOLDER, ethers.utils.parseUnits("2"));

  token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
  token1 = IERC20__factory.connect(TOKEN1_ADDRESS, impersonatedTimelock);

  pancakeSwapRouter = await initPancakeSwapRouter(impersonatedTimelock);

  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(RISKFUND, "swapPoolsAssets(address[],uint256[],address[][],uint256)", ADMIN);

  riskFund = RiskFund__factory.connect(RISKFUND, impersonatedTimelock);
  shortfall = Shortfall__factory.connect(SHORTFALL, impersonatedTimelock);
  protocolShareReserve = IMockProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);

  if (network == "bsctestnet") {
    protocolShareReserve = ProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);
    const distributionConfig1 = {
      schema: 0,
      percentage: 50,
      destination: TREASURY,
    };

    const distributionConfig2 = {
      schema: 0,
      percentage: 50,
      destination: RISKFUND,
    };

    await protocolShareReserve
      .connect(impersonatedTimelock)
      .addOrUpdateDistributionConfigs([distributionConfig1, distributionConfig2]);
    token1Reserve = parseUnits("100", 6);
    minAmountOut = parseUnits("10", 6);
  }

  comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
  vToken1 = VToken__factory.connect(VTOKEN1_ADDRESS, impersonatedTimelock);
  vToken2 = VToken__factory.connect(VTOKEN2, impersonatedTimelock);

  await vToken1.connect(impersonatedTimelock).setShortfallContract(SHORTFALL);
  await vToken1.connect(impersonatedTimelock).setProtocolShareReserve(PSR);

  await vToken2.connect(impersonatedTimelock).setShortfallContract(SHORTFALL);
  await vToken2.connect(impersonatedTimelock).setProtocolShareReserve(PSR);

  if (network == "sepolia") {
    await riskFund.connect(impersonatedTimelock).setPancakeSwapRouter(pancakeSwapRouter.address);
  }
};

if (FORKING) {
  describe("Risk Fund Fork: Tests", function () {
    beforeEach(async function () {
      await loadFixture(riskFundFixture);

      await token1.connect(token1Holder).approve(vToken1.address, token1Reserve);
      await vToken1.connect(token1Holder).addReserves(token1Reserve);

      await token2.connect(token2Holder).approve(vToken2.address, token2Reserve);
      await vToken2.connect(token2Holder).addReserves(token2Reserve);

      await vToken1.reduceReserves(token1Reserve);
      await vToken2.reduceReserves(token2Reserve);
    });

    describe("Assets transfer to riskfund", async function () {
      it("Transfer assets from different markets to riskFund", async function () {
        let token1ReservesInPSR;
        let token2ReservesInPSR;
        const token1PreviousBalanceForRiskFund = await token1.balanceOf(riskFund.address);
        const token2PreviousBalanceForRiskFund = await token2.balanceOf(riskFund.address);

        const poolAssetReservesPreviousForToken1 = await riskFund.getPoolAssetReserve(
          comptroller.address,
          token1.address,
        );
        const poolAssetReservesPreviousForToken2 = await riskFund.getPoolAssetReserve(
          comptroller.address,
          token2.address,
        );

        if (network == "bsctestnet") {
          token1ReservesInPSR = (await protocolShareReserve.assetsReserves(comptroller.address, token1.address, 0)).add(
            await protocolShareReserve.assetsReserves(comptroller.address, token1.address, 1),
          );
          token2ReservesInPSR = (await protocolShareReserve.assetsReserves(comptroller.address, token2.address, 0)).add(
            await protocolShareReserve.assetsReserves(comptroller.address, token2.address, 1),
          );

          await protocolShareReserve.releaseFunds(comptroller.address, [token1.address]);
          await protocolShareReserve.releaseFunds(comptroller.address, [token2.address]);
        } else {
          token1ReservesInPSR = await protocolShareReserve.assetsReserves(token1.address);
          token2ReservesInPSR = await protocolShareReserve.assetsReserves(token2.address);

          await protocolShareReserve.releaseFunds(comptroller.address, token1.address, token1Reserve);
          await protocolShareReserve.releaseFunds(comptroller.address, token2.address, token2Reserve);
        }

        const token1NewBalanceForRiskFund = await token1.balanceOf(riskFund.address);
        const token2NewBalanceForRiskFund = await token2.balanceOf(riskFund.address);

        const poolAssetReservesNewForToken1 = await riskFund.getPoolAssetReserve(comptroller.address, token1.address);
        const poolAssetReservesNewForToken2 = await riskFund.getPoolAssetReserve(comptroller.address, token2.address);

        expect(token1NewBalanceForRiskFund).to.equal(token1PreviousBalanceForRiskFund.add(token1ReservesInPSR.div(2)));
        expect(token2NewBalanceForRiskFund).to.equal(token2PreviousBalanceForRiskFund.add(token2ReservesInPSR.div(2)));

        expect(poolAssetReservesNewForToken1).to.equal(
          poolAssetReservesPreviousForToken1.add(token1ReservesInPSR.div(2)),
        );
        expect(poolAssetReservesNewForToken2).to.equal(
          poolAssetReservesPreviousForToken2.add(token2ReservesInPSR.div(2)),
        );
      });

      it("Transfer reserves from riskFund to auction contract", async () => {
        let auctionTransferAmount = parseUnits("25", 18);
        if (network == "bsctestnet") {
          await protocolShareReserve.releaseFunds(comptroller.address, [token1.address]);
          await protocolShareReserve.releaseFunds(comptroller.address, [token2.address]);
          auctionTransferAmount = parseUnits("25", 6);
        } else {
          await protocolShareReserve.releaseFunds(comptroller.address, token1.address, token1Reserve);
          await protocolShareReserve.releaseFunds(comptroller.address, token2.address, token2Reserve);
        }

        const shortfallSigner = await initMainnetUser(shortfall.address, parseEther("2"));
        await riskFund.connect(shortfallSigner).transferReserveForAuction(comptroller.address, auctionTransferAmount);

        const shortfallBalance = await token1.balanceOf(shortfall.address);
        expect(shortfallBalance).to.equal(auctionTransferAmount);
      });
    });

    describe("Swap Assets", () => {
      it("Swap all pool assets and transferring them to auction contract", async () => {
        if (network == "bsctestnet") {
          await protocolShareReserve.releaseFunds(comptroller.address, [token1.address]);
          await protocolShareReserve.releaseFunds(comptroller.address, [token2.address]);
        } else {
          await protocolShareReserve.releaseFunds(comptroller.address, token1.address, token1Reserve);
          await protocolShareReserve.releaseFunds(comptroller.address, token2.address, token2Reserve);
        }

        const riskFundReservesBefore = await riskFund.getPoolsBaseAssetReserves(comptroller.address);
        const riskFundBalanceBefore = await token1.balanceOf(riskFund.address);

        const [, amountout] = await pancakeSwapRouter
          .connect(impersonatedTimelock)
          .getAmountsOut(await token2.balanceOf(riskFund.address), [token2.address, token1.address]);

        const deadline = (await ethers.provider.getBlock("latest")).timestamp + 100;
        await riskFund.swapPoolsAssets([vToken2.address], [minAmountOut], [[token2.address, token1.address]], deadline);

        const riskFundReservesAfter = await riskFund.getPoolsBaseAssetReserves(comptroller.address);
        const riskFundBalanceAfter = await token1.balanceOf(riskFund.address);

        expect(riskFundReservesAfter.sub(riskFundReservesBefore)).to.equal(amountout);
        expect(riskFundBalanceAfter.sub(riskFundBalanceBefore)).to.equal(amountout);
      });
    });
  });
}

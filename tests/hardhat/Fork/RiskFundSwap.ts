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
  PancakeRouter,
  PancakeRouter__factory,
  ProtocolShareReserve,
  ProtocolShareReserve__factory,
  RiskFund,
  RiskFund__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const {
  ACM,
  PSR,
  ADMIN,
  USDT,
  TOKEN1,
  TOKEN2,
  VTOKEN2,
  COMPTROLLER,
  RISKFUND,
  SHORTFALL,
  USDT_HOLDER,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  SWAP_ROUTER_CORE_POOL,
  BLOCK_NUMBER,
} = getContractAddresses(FORKED_NETWORK as string);

let token1: IERC20;
let token2: IERC20;
let vToken2: VToken;
let comptroller: Comptroller;
let riskFund: RiskFund;
let token1Holder: SignerWithAddress;
let token2Holder: SignerWithAddress;
let impersonatedTimelock: SignerWithAddress;
let accessControlManager: AccessControlManager;
let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
let protocolShareReserve: ProtocolShareReserve;
let TOKEN1_ADDRESS: string = TOKEN1;

const ADD_RESERVE_AMOUNT = parseUnits("100", 18);
const REDUCE_RESERVE_AMOUNT = parseUnits("50", 18);

if (FORKED_NETWORK != "sepolia") {
  TOKEN1_ADDRESS = USDT;
}

const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

const initPancakeSwapRouter = async (
  admin: SignerWithAddress,
): Promise<PancakeRouter | FakeContract<PancakeRouter>> => {
  let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
  if (FORKED_NETWORK == "sepolia") {
    const pancakeSwapRouterFactory = await smock.mock<PancakeRouter__factory>("PancakeRouter");
    pancakeSwapRouter = await pancakeSwapRouterFactory.deploy(SWAP_ROUTER_CORE_POOL, admin.address);
    await pancakeSwapRouter.deployed();
  } else {
    pancakeSwapRouter = PancakeRouter__factory.connect(SWAP_ROUTER_CORE_POOL, admin);
  }

  await token1.connect(token1Holder).transfer(pancakeSwapRouter.address, parseUnits("1000", 18));
  await token2.connect(token2Holder).transfer(pancakeSwapRouter.address, parseUnits("1000", 18));

  return pancakeSwapRouter;
};

const riskFundFixture = async (): Promise<void> => {
  await setForkBlock(BLOCK_NUMBER);
  await configureTimelock();
  const [, user] = await ethers.getSigners();

  token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));
  token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));
  if (FORKED_NETWORK != "sepolia") token1Holder = await initMainnetUser(USDT_HOLDER, ethers.utils.parseUnits("2"));

  token2 = IERC20__factory.connect(TOKEN2, user);
  token1 = IERC20__factory.connect(TOKEN1_ADDRESS, user);
  pancakeSwapRouter = await initPancakeSwapRouter(impersonatedTimelock);
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(RISKFUND, "swapPoolsAssets(address[],uint256[],address[][],uint256)", ADMIN);

  riskFund = RiskFund__factory.connect(RISKFUND, impersonatedTimelock);

  protocolShareReserve = ProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);

  comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
  vToken2 = VToken__factory.connect(VTOKEN2, impersonatedTimelock);
  await vToken2.connect(impersonatedTimelock).setShortfallContract(SHORTFALL);
  await vToken2.connect(impersonatedTimelock).setProtocolShareReserve(PSR);

  if (FORKED_NETWORK == "sepolia") {
    await riskFund.connect(impersonatedTimelock).setPancakeSwapRouter(pancakeSwapRouter.address);
  }
};

if (FORK) {
  describe("Risk Fund Fork: Swap Tests", () => {
    let minAmount = parseUnits("10", 18);

    if (FORKED_NETWORK == "bsctestnet") {
      minAmount = parseUnits("10", 6);
    }

    beforeEach(async () => {
      await loadFixture(riskFundFixture);
    });

    it("Swap All Pool Assets", async () => {
      await token2.connect(token2Holder).approve(vToken2.address, ADD_RESERVE_AMOUNT);
      await vToken2.connect(token2Holder).addReserves(ADD_RESERVE_AMOUNT);

      await vToken2.reduceReserves(REDUCE_RESERVE_AMOUNT);
      await protocolShareReserve.releaseFunds(comptroller.address, [token2.address]);

      const riskFundReservesBefore = await riskFund.getPoolsBaseAssetReserves(comptroller.address);
      const riskFundBalanceBefore = await token1.balanceOf(riskFund.address);

      const [, amountout] = await pancakeSwapRouter
        .connect(impersonatedTimelock)
        .getAmountsOut(await token2.balanceOf(riskFund.address), [token2.address, token1.address]);

      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 100;
      await riskFund.swapPoolsAssets([vToken2.address], [minAmount], [[token2.address, token1.address]], deadline);

      const riskFundReservesAfter = await riskFund.getPoolsBaseAssetReserves(comptroller.address);
      const riskFundBalanceAfter = await token1.balanceOf(riskFund.address);

      expect(riskFundReservesAfter.sub(riskFundReservesBefore)).to.equal(amountout);
      expect(riskFundBalanceAfter.sub(riskFundBalanceBefore)).to.equal(amountout);
    });
  });
}

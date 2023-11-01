import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  AccessControlManager__factory,
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  MockPriceOracle,
  MockPriceOracle__factory,
  MockProtocolShareReserve,
  MockProtocolShareReserve__factory,
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

const FORKING = process.env.FORKING === "true";
const network = process.env.NETWORK_NAME || "bsc";

const {
  SWAP_ROUTER_CORE_POOL,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
  COMPTROLLER,
  ADMIN,
  TOKEN1,
  RISKFUND,
  TOKEN2,
  VTOKEN2,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  SHORTFALL,
  ACM,
  PSR,
  BLOCK_NUMBER,
  PANCAKE_SWAP_ROUTER,
} = getContractAddresses(network as string);

// // Disable a warning about mixing beacons and transparent proxies
// upgrades.silenceWarnings();

let impersonatedTimelock: SignerWithAddress;
let token1: IERC20;
let token2: IERC20;
let vToken2: VToken;
let priceOracle: MockPriceOracle;
let chainlinkOracle: ChainlinkOracle;
let comptroller: Comptroller;
let accessControlManager: AccessControlManager;
let protocolShareReserve: ProtocolShareReserve | MockProtocolShareReserve;
let riskFund: RiskFund;
let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
let token1Holder: SignerWithAddress;
let token2Holder: SignerWithAddress;

const ADD_RESERVE_AMOUNT = parseUnits("100", 18);
const REDUCE_RESERVE_AMOUNT = parseUnits("50", 18);

const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

const initPancakeSwapRouter = async (
  admin: SignerWithAddress,
): Promise<PancakeRouter | FakeContract<PancakeRouter>> => {
  let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
  if (network == "bsc" || network == "bsctestnet") {
    pancakeSwapRouter = PancakeRouter__factory.connect(SWAP_ROUTER_CORE_POOL, admin);
    await token1.connect(token1Holder).transfer(SWAP_ROUTER_CORE_POOL, parseUnits("10000", 18));
    await token2.connect(token2Holder).transfer(SWAP_ROUTER_CORE_POOL, parseUnits("10000", 18));
  } else {
    const pancakeSwapRouterFactory = await smock.mock<PancakeRouter__factory>("PancakeRouter");
    pancakeSwapRouter = await pancakeSwapRouterFactory.deploy(PANCAKE_SWAP_ROUTER, admin.address);
    await pancakeSwapRouter.deployed();
    console.log(SWAP_ROUTER_CORE_POOL, pancakeSwapRouter.address);
    await token1.connect(token1Holder).transfer(pancakeSwapRouter.address, parseUnits("10000", 18));
    await token2.connect(token2Holder).transfer(pancakeSwapRouter.address, parseUnits("10000", 18));
  }
  return pancakeSwapRouter;
};

const riskFundFixture = async (): Promise<void> => {
  await setForkBlock(BLOCK_NUMBER);
  await configureTimelock();
  const [, user] = await ethers.getSigners();

  token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));
  token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));
  token2 = IERC20__factory.connect(TOKEN2, user);
  token1 = IERC20__factory.connect(TOKEN1, user);
  pancakeSwapRouter = await initPancakeSwapRouter(impersonatedTimelock);
  console.log(1);
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(RISKFUND, "swapPoolsAssets(address[],uint256[],address[][],uint256)", ADMIN);
  await accessControlManager.giveCallPermission(RISKFUND, "setConvertibleBaseAsset(address)", ADMIN);

  riskFund = RiskFund__factory.connect(RISKFUND, impersonatedTimelock);
  await riskFund.connect(impersonatedTimelock).setConvertibleBaseAsset(TOKEN1);

  protocolShareReserve = ProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);

  if (network == "bsctestnet") {
    protocolShareReserve = MockProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);
  }

  chainlinkOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);
  await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, parseUnits("1.1", 18));
  await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, parseUnits(".75", 18));

  priceOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);

  let tokenConfig = {
    asset: token2.address,
    oracles: [chainlinkOracle.address, ethers.constants.AddressZero, ethers.constants.AddressZero],
    enableFlagsForOracles: [true, false, false],
  };
  await priceOracle.connect(impersonatedTimelock).setTokenConfig(tokenConfig);

  tokenConfig = {
    asset: token1.address,
    oracles: [chainlinkOracle.address, ethers.constants.AddressZero, ethers.constants.AddressZero],
    enableFlagsForOracles: [true, false, false],
  };
  await priceOracle.connect(impersonatedTimelock).setTokenConfig(tokenConfig);

  comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
  vToken2 = VToken__factory.connect(VTOKEN2, impersonatedTimelock);
  await vToken2.connect(impersonatedTimelock).setShortfallContract(SHORTFALL);
  await vToken2.connect(impersonatedTimelock).setProtocolShareReserve(PSR);

  await vToken2.connect(impersonatedTimelock).setProtocolShareReserve(PSR);
  if (network == "sepolia") {
    await protocolShareReserve.connect(impersonatedTimelock).acceptOwnership();
    await riskFund.connect(impersonatedTimelock).acceptOwnership();
    await riskFund.connect(impersonatedTimelock).setPancakeSwapRouter(pancakeSwapRouter.address);
  }
};

if (FORKING) {
  describe.only("Risk Fund Fork: Swap Tests", () => {
    beforeEach(async () => {
      await loadFixture(riskFundFixture);
      console.log(33);
    });

    it("Swap All Pool Assets", async () => {
      await token2.connect(token2Holder).approve(vToken2.address, ADD_RESERVE_AMOUNT);
      console.log(2);

      await vToken2.connect(token2Holder).addReserves(ADD_RESERVE_AMOUNT);
      console.log(2);

      await vToken2.reduceReserves(REDUCE_RESERVE_AMOUNT);
      console.log((await token2.balanceOf(riskFund.address)).toString());
      console.log(2);
      if (network == "bsctestnet") {
        await protocolShareReserve.releaseFunds(comptroller.address, [token2.address]);
      } else {
        await protocolShareReserve.releaseFunds(comptroller.address, token2.address, REDUCE_RESERVE_AMOUNT);
      }
      console.log((await token2.balanceOf(riskFund.address)).toString());

      console.log(376233);
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 100;
      console.log(await riskFund.pancakeSwapRouter());
      // await vToken2.update
      // await expect(riskFund.connect(impersonatedTimelock).swapPoolsAssets(
      //   [vToken2.address],
      //   [parseUnits("10", 18)],
      //   [[token2.address, token1.address]],
      //   deadline,
      // )).to.be.revertedWithCustomError(riskFund, "ZeroAddressNotAllowed");
      console.log(await riskFund.poolRegistry());
      await riskFund.swapPoolsAssets(
        [vToken2.address],
        [parseUnits("10", 18)],
        [[token2.address, token1.address]],
        deadline,
      );
      console.log(376233);

      expect(Number(await riskFund.getPoolsBaseAssetReserves(comptroller.address))).to.be.closeTo(
        Number("24931282761361385504"),
        Number(parseUnits("1", 18)),
      );

      const balance = await token1.balanceOf(riskFund.address);
      expect(Number(balance)).to.be.closeTo(Number(parseUnits("25", 18)), Number(parseUnits("1", 18)));
    });
  });
}

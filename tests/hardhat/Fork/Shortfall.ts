import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  IPancakeswapV2Router__factory,
  ProtocolShareReserve,
  ProtocolShareReserve__factory,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
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
  ADMIN,
  TREASURY,
  ACM,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
  POOL_REGISTRY,
  SWAP_ROUTER_CORE_POOL,
  COMPTROLLER,
  COMPTROLLER_TRON,
  USDT_HOLDER,
  TRX_HOLDER,
  BLOCK_NUMBER,
} = getContractAddresses(network as string);

const { expect } = chai;
chai.use(smock.matchers);

let COMPTROLLER_ADDRESS: string;
let TOKEN1: string;
let TOKEN2: string;
let VTOKEN1: string;
let VTOKEN2: string;
let TOKEN1_HOLDER: string;
let TOKEN2_HOLDER: string;
if (network == "bsc") {
  COMPTROLLER_ADDRESS = COMPTROLLER_TRON;
  TOKEN1 = getContractAddresses(network as string).USDT;
  TOKEN2 = getContractAddresses(network as string).TRX;
  VTOKEN1 = getContractAddresses(network as string).VUSDT_TRON;
  VTOKEN2 = getContractAddresses(network as string).VTRX_TRON;
  TOKEN1_HOLDER = USDT_HOLDER;
  TOKEN2_HOLDER = TRX_HOLDER;
} else if (network == "bsctestnet") {
  COMPTROLLER_ADDRESS = COMPTROLLER;
  TOKEN1 = getContractAddresses(network as string).TOKEN1;
  TOKEN2 = getContractAddresses(network as string).USDT;
  VTOKEN1 = getContractAddresses(network as string).VTOKEN1;
  VTOKEN2 = getContractAddresses(network as string).VUSDT;
  TOKEN1_HOLDER = getContractAddresses(network as string).TOKEN1_HOLDER;
  TOKEN2_HOLDER = USDT_HOLDER;
}

const MINIMUM_POOL_BAD_DEBT = parseUnits("10", 18); // USD
const LOOPS_LIMIT = 100;

let impersonatedTimelock: SignerWithAddress;
let oracle: ResilientOracleInterface;
let chainlinkOracle: ChainlinkOracle;

let manager: SignerWithAddress;
let user1: SignerWithAddress;
let liquidator: SignerWithAddress;

let comptroller: Comptroller;
let vTOKEN2: VToken;
let vTOKEN1: VToken;

let token2: IERC20;
let token1: IERC20;

let shortfall: Shortfall;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;

const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

const grabTokensTo = async (userAddress: string) => {
  const token2Holder = await initMainnetUser(TOKEN2_HOLDER, parseEther("2"));
  const token1Holder = await initMainnetUser(TOKEN1_HOLDER, parseEther("2"));

  await token2.connect(token2Holder).transfer(userAddress, parseUnits("10000", 6));
  await token1.connect(token1Holder).transfer(userAddress, parseUnits("10000", 18));
};

const setupRiskManagementContracts = async () => {
  const swapRouter = await ethers.getContractAt<IPancakeswapV2Router__factory>(
    "IPancakeswapV2Router",
    SWAP_ROUTER_CORE_POOL,
  );

  const riskFundFactory = await ethers.getContractFactory<RiskFund__factory>("RiskFund");
  riskFund = (await upgrades.deployProxy(riskFundFactory, [
    swapRouter.address,
    parseUnits("1", 18),
    TOKEN2, // convertibleBaseAsset
    ACM,
    LOOPS_LIMIT,
  ])) as RiskFund;
  await riskFund.setPoolRegistry(POOL_REGISTRY);

  const protocolShareReserveFactory = await ethers.getContractFactory<ProtocolShareReserve__factory>(
    "ProtocolShareReserve",
  );
  protocolShareReserve = (await upgrades.deployProxy(protocolShareReserveFactory, [
    TREASURY,
    riskFund.address,
  ])) as ProtocolShareReserve;
  await protocolShareReserve.setPoolRegistry(POOL_REGISTRY);

  const shortfallFactory = await ethers.getContractFactory<Shortfall__factory>("Shortfall");
  shortfall = (await upgrades.deployProxy(shortfallFactory, [
    TOKEN2, // convertibleBaseAsset
    riskFund.address,
    MINIMUM_POOL_BAD_DEBT,
    ACM,
  ])) as Shortfall;
  await shortfall.updatePoolRegistry(POOL_REGISTRY);
};

const setupTokens = async () => {
  token2 = await ethers.getContractAt<IERC20__factory>("MockToken", TOKEN2);
  token1 = await ethers.getContractAt<IERC20__factory>("MockToken", TOKEN1);

  await grabTokensTo(manager.address);
  await grabTokensTo(user1.address);
  await grabTokensTo(liquidator.address);

  comptroller = Comptroller__factory.connect(COMPTROLLER_ADDRESS, impersonatedTimelock);
  chainlinkOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);

  vTOKEN2 = await ethers.getContractAt<VToken__factory>("VToken", VTOKEN2);
  vTOKEN1 = await ethers.getContractAt<VToken__factory>("VToken", VTOKEN1);

  for (const vToken of [vTOKEN2, vTOKEN1]) {
    await vToken.connect(impersonatedTimelock).setShortfallContract(shortfall.address);
    await vToken.connect(impersonatedTimelock).setProtocolShareReserve(protocolShareReserve.address);
  }
};

const generateToken1BadDebt = async () => {
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("100", 18));
  const token2SupplyAmount = parseUnits("100", 6);
  const token1BorrowAmount = parseUnits("500", 18);
  await token1.connect(manager).approve(vTOKEN1.address, token1BorrowAmount);
  await vTOKEN1.connect(manager).mint(token1BorrowAmount);
  await token2.connect(user1).approve(vTOKEN2.address, token2SupplyAmount);
  await vTOKEN2.connect(user1).mint(token2SupplyAmount);
  await comptroller.connect(user1).enterMarkets([vTOKEN2.address]);
  await vTOKEN1.connect(user1).borrow(token1BorrowAmount);
  await chainlinkOracle.setDirectPrice(token2.address, "1");

  // We repay about 91 TOKEN1 but the majority of the debt is bad debt
  await token1.connect(liquidator).approve(vTOKEN1.address, parseUnits("91.1", 18));
  await comptroller.connect(liquidator).healAccount(user1.address);

  // Restore original TOKEN2 price
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("0.08098989", 18));

  // Pretend to recover the dust so that the bad debt is exactly 500 TOKEN1
  const shortfallSigner = await initMainnetUser(shortfall.address, parseEther("1"));
  const dust = (await vTOKEN1.badDebt()).sub(parseUnits("500", 18));
  await vTOKEN1.connect(shortfallSigner).badDebtRecovered(dust);
};

const pretendRiskFundAccumulatedBaseAsset = async () => {
  const token2Reserve = parseUnits("1000", 6);
  await token2.approve(vTOKEN2.address, token2Reserve);
  await vTOKEN2.addReserves(token2Reserve);
  await vTOKEN2.reduceReserves(token2Reserve);
  await protocolShareReserve.releaseFunds(comptroller.address, token2.address, token2Reserve);
};

const setup = async () => {
  [manager, user1, liquidator] = await ethers.getSigners();

  await setForkBlock(BLOCK_NUMBER);

  comptroller = await ethers.getContractAt<Comptroller__factory>("Comptroller", COMPTROLLER_ADDRESS);
  chainlinkOracle = await ethers.getContractAt<ChainlinkOracle__factory>("ChainlinkOracle", CHAINLINK_ORACLE);
  oracle = await ethers.getContractAt<ResilientOracleInterface__factory>("ResilientOracleInterface", RESILIENT_ORACLE);

  await configureTimelock();
  await setupRiskManagementContracts();
  await setupTokens();
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("8098989", 22));
  await chainlinkOracle.setDirectPrice(token1.address, parseUnits("99971612", 10));
  await generateToken1BadDebt();
  await pretendRiskFundAccumulatedBaseAsset();
};

enum AuctionType {
  LARGE_POOL_DEBT = 0,
  LARGE_RISK_FUND = 1,
}

if (FORKING && (network == "bsc" || network == "bsctestnet")) {
  describe("Shortfall fork tests", async () => {
    const token1BadDebt = parseUnits("500", 18);
    const token2RiskFund = parseUnits("500", 6);

    beforeEach(async () => {
      await loadFixture(setup);
    });

    it("initializes as expected", async () => {
      expect(await vTOKEN1.badDebt()).to.equal(token1BadDebt);
      expect(await vTOKEN2.badDebt()).to.equal(0);
      expect(await riskFund.getPoolsBaseAssetReserves(COMPTROLLER_ADDRESS)).to.equal(token2RiskFund);
    });

    describe("startAuction", async () => {
      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) < bad debt plus incentive ($)", async () => {
        // Convertible base asset is TOKEN2, the risk fund balance is about 500 TOKEN2 or $40
        await shortfall.startAuction(COMPTROLLER_ADDRESS);

        const auction = await shortfall.auctions(COMPTROLLER_ADDRESS);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });

      it("starts a LARGE_RISK_FUND auction if risk fund reserve ($) > bad debt plus incentive ($)", async () => {
        // Convertible base asset is TOKEN2, we set its price to $1.11 so that 500 TOKEN2 = $555 > bad debt plus incentive
        await chainlinkOracle.setDirectPrice(token2.address, parseUnits("1.11", 18));
        await shortfall.startAuction(COMPTROLLER_ADDRESS);

        const auction = await shortfall.auctions(COMPTROLLER_ADDRESS);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_RISK_FUND);
      });

      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) == bad debt plus incentive ($)", async () => {
        // Convertible base asset is TOKEN2, we set its price to $1.1 so that 500 TOKEN2 = $550
        await chainlinkOracle.setDirectPrice(token2.address, parseUnits("1.1", 18));
        // We set TOKEN1 price to $1 so that bad debt plus incentive is exactly $550
        await chainlinkOracle.setDirectPrice(token1.address, parseUnits("1.0", 18));

        // Ensure our computations are correct
        const token1Price = await oracle.getPrice(token1.address);
        const badDebtPlusIncentive = (await vTOKEN1.badDebt())
          .mul(parseUnits("1.1", 18))
          .mul(token1Price)
          .div(parseUnits("1", 36));
        expect(badDebtPlusIncentive).to.equal(parseUnits("550", 18));

        const token2Price = await oracle.getPrice(token2.address);
        const riskFundReserve = await riskFund.getPoolsBaseAssetReserves(COMPTROLLER_ADDRESS);
        const riskFundReserveInUsd = riskFundReserve.mul(token2Price).div(parseUnits("1", 18));
        expect(riskFundReserveInUsd).to.equal(parseUnits("550", 18));

        await shortfall.startAuction(COMPTROLLER_ADDRESS);

        const auction = await shortfall.auctions(COMPTROLLER_ADDRESS);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });
    });
  });
}

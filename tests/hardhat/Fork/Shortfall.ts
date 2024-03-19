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
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet";

const ADMIN = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const TREASURY = "0xF322942f644A996A617BD29c16bd7d231d9F35E9";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const ORACLE = "0x6592b5DE802159F3E74B2486b091D11a8256ab8A";
const CHAINLINK_ORACLE = "0x1B2103441A0A108daD8848D8F5d790e4D402921F";
const POOL_REGISTRY = "0x9F7b01A536aFA00EF10310A162877fd792cD0666";

const SWAP_ROUTER_CORE_POOL = "0x8938E6dA30b59c1E27d5f70a94688A89F7c815a4";
const COMPTROLLER_TRON = "0x23b4404E4E5eC5FF5a6FFb70B7d14E3FabF237B0";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const TRX = "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3";

const VUSDT_TRON = "0x281E5378f99A4bc55b295ABc0A3E7eD32Deba059";
const VTRX_TRON = "0x836beb2cB723C498136e1119248436A645845F4E";

const MINIMUM_POOL_BAD_DEBT = parseUnits("10", 18); // USD
const LOOPS_LIMIT = 100;

let impersonatedTimelock: SignerWithAddress;
let oracle: ResilientOracleInterface;
let chainlinkOracle: ChainlinkOracle;

let manager: SignerWithAddress;
let user1: SignerWithAddress;
let liquidator: SignerWithAddress;

let comptroller: Comptroller;
let vTRX: VToken;
let vUSDT: VToken;

let trx: IERC20;
let usdt: IERC20;

let shortfall: Shortfall;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;

const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

const grabTokensTo = async (userAddress: string) => {
  const trxHolder = await initMainnetUser("0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296", parseEther("2"));
  const usdtHolder = await initMainnetUser("0xF977814e90dA44bFA03b6295A0616a897441aceC", parseEther("2"));

  await trx.connect(trxHolder).transfer(userAddress, parseUnits("10000", 6));
  await usdt.connect(usdtHolder).transfer(userAddress, parseUnits("10000", 18));
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
    TRX, // convertibleBaseAsset
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
    TRX, // convertibleBaseAsset
    riskFund.address,
    MINIMUM_POOL_BAD_DEBT,
    ACM,
  ])) as Shortfall;
  await shortfall.updatePoolRegistry(POOL_REGISTRY);
};

const setupTokens = async () => {
  trx = await ethers.getContractAt<IERC20__factory>("MockToken", TRX);
  usdt = await ethers.getContractAt<IERC20__factory>("MockToken", USDT);

  await grabTokensTo(manager.address);
  await grabTokensTo(user1.address);
  await grabTokensTo(liquidator.address);

  comptroller = Comptroller__factory.connect(COMPTROLLER_TRON, impersonatedTimelock);
  chainlinkOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);

  vTRX = await ethers.getContractAt<VToken__factory>("VToken", VTRX_TRON);
  vUSDT = await ethers.getContractAt<VToken__factory>("VToken", VUSDT_TRON);

  for (const vToken of [vTRX, vUSDT]) {
    await vToken.connect(impersonatedTimelock).setShortfallContract(shortfall.address);
    await vToken.connect(impersonatedTimelock).setProtocolShareReserve(protocolShareReserve.address);
  }
};

const generateUsdtBadDebt = async () => {
  await chainlinkOracle.setDirectPrice(trx.address, parseUnits("100", 18));
  const trxSupplyAmount = parseUnits("100", 6);
  const usdtBorrowAmount = parseUnits("500", 18);
  await usdt.connect(manager).approve(vUSDT.address, usdtBorrowAmount);
  await vUSDT.connect(manager).mint(usdtBorrowAmount);
  await trx.connect(user1).approve(vTRX.address, trxSupplyAmount);
  await vTRX.connect(user1).mint(trxSupplyAmount);
  await comptroller.connect(user1).enterMarkets([vTRX.address]);
  await vUSDT.connect(user1).borrow(usdtBorrowAmount);
  await chainlinkOracle.setDirectPrice(trx.address, "1");

  // We repay about 91 USDT but the majority of the debt is bad debt
  await usdt.connect(liquidator).approve(vUSDT.address, parseUnits("91.1", 18));
  await comptroller.connect(liquidator).healAccount(user1.address);

  // Restore original TRX price
  await chainlinkOracle.setDirectPrice(trx.address, parseUnits("0.08098989", 18));

  // Pretend to recover the dust so that the bad debt is exactly 500 USDT
  const shortfallSigner = await initMainnetUser(shortfall.address, parseEther("1"));
  const dust = (await vUSDT.badDebt()).sub(parseUnits("500", 18));
  await vUSDT.connect(shortfallSigner).badDebtRecovered(dust);
};

const pretendRiskFundAccumulatedBaseAsset = async () => {
  const trxReserve = parseUnits("1000", 6);
  await trx.approve(vTRX.address, trxReserve);
  await vTRX.addReserves(trxReserve);
  await vTRX.reduceReserves(trxReserve);
  await protocolShareReserve.releaseFunds(comptroller.address, trx.address, trxReserve);
};

const setup = async () => {
  [manager, user1, liquidator] = await ethers.getSigners();

  await setForkBlock(30245720);

  comptroller = await ethers.getContractAt<Comptroller__factory>("Comptroller", COMPTROLLER_TRON);
  chainlinkOracle = await ethers.getContractAt<ChainlinkOracle__factory>("ChainlinkOracle", CHAINLINK_ORACLE);
  oracle = await ethers.getContractAt<ResilientOracleInterface__factory>("ResilientOracleInterface", ORACLE);

  await configureTimelock();
  await setupRiskManagementContracts();
  await setupTokens();
  await generateUsdtBadDebt();
  await pretendRiskFundAccumulatedBaseAsset();
};

enum AuctionType {
  LARGE_POOL_DEBT = 0,
  LARGE_RISK_FUND = 1,
}

if (FORK_MAINNET) {
  describe("Shortfall fork tests", async () => {
    const usdtBadDebt = parseUnits("500", 18);
    const trxRiskFund = parseUnits("500", 6);

    beforeEach(async () => {
      await loadFixture(setup);
    });

    it("initializes as expected", async () => {
      expect(await vUSDT.badDebt()).to.equal(usdtBadDebt);
      expect(await vTRX.badDebt()).to.equal(0);
      expect(await riskFund.getPoolsBaseAssetReserves(COMPTROLLER_TRON)).to.equal(trxRiskFund);
    });

    describe("startAuction", async () => {
      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) < bad debt plus incentive ($)", async () => {
        // Convertible base asset is TRX, the risk fund balance is about 500 TRX or $40
        await shortfall.startAuction(COMPTROLLER_TRON);

        const auction = await shortfall.auctions(COMPTROLLER_TRON);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });

      it("starts a LARGE_RISK_FUND auction if risk fund reserve ($) > bad debt plus incentive ($)", async () => {
        // Convertible base asset is TRX, we set its price to $1.11 so that 500 TRX = $555 > bad debt plus incentive
        await chainlinkOracle.setDirectPrice(trx.address, parseUnits("1.11", 18));
        await shortfall.startAuction(COMPTROLLER_TRON);

        const auction = await shortfall.auctions(COMPTROLLER_TRON);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_RISK_FUND);
      });

      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) == bad debt plus incentive ($)", async () => {
        // Convertible base asset is TRX, we set its price to $1.1 so that 500 TRX = $550
        await chainlinkOracle.setDirectPrice(trx.address, parseUnits("1.1", 18));
        // We set USDT price to $1 so that bad debt plus incentive is exactly $550
        await chainlinkOracle.setDirectPrice(usdt.address, parseUnits("1.0", 18));

        // Ensure our computations are correct
        const usdtPrice = await oracle.getPrice(usdt.address);
        const badDebtPlusIncentive = (await vUSDT.badDebt())
          .mul(parseUnits("1.1", 18))
          .mul(usdtPrice)
          .div(parseUnits("1", 36));
        expect(badDebtPlusIncentive).to.equal(parseUnits("550", 18));

        const trxPrice = await oracle.getPrice(trx.address);
        const riskFundReserve = await riskFund.getPoolsBaseAssetReserves(COMPTROLLER_TRON);
        const riskFundReserveInUsd = riskFundReserve.mul(trxPrice).div(parseUnits("1", 18));
        expect(riskFundReserveInUsd).to.equal(parseUnits("550", 18));

        await shortfall.startAuction(COMPTROLLER_TRON);

        const auction = await shortfall.auctions(COMPTROLLER_TRON);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });
    });
  });
}

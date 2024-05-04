import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  MockPriceOracle,
  MockPriceOracle__factory,
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

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const {
  PSR,
  ADMIN,
  TOKEN2,
  USDT,
  VUSDT,
  VTOKEN2,
  RISKFUND,
  SHORTFALL,
  COMPTROLLER,
  USDT_HOLDER,
  TOKEN2_HOLDER,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
  BLOCK_NUMBER,
} = getContractAddresses(FORKED_NETWORK as string);

const { expect } = chai;
chai.use(smock.matchers);

let token2: IERC20;
let token1: IERC20;
let vTOKEN2: VToken;
let vTOKEN1: VToken;
let comptroller: Comptroller;
let shortfall: Shortfall;
let riskFund: RiskFund;
let user1: SignerWithAddress;
let manager: SignerWithAddress;
let liquidator: SignerWithAddress;
let impersonatedTimelock: SignerWithAddress;
let resilientOracle: MockPriceOracle;
let chainlinkOracle: ChainlinkOracle;
let protocolShareReserve: ProtocolShareReserve;

const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

let usdtDecimals: BigNumber;
let oldPoolAsetReserves: BigNumber;

const grabTokensTo = async (userAddress: string) => {
  const token2Holder = await initMainnetUser(TOKEN2_HOLDER, parseEther("2"));
  const token1Holder = await initMainnetUser(USDT_HOLDER, parseEther("2"));

  await token2.connect(token2Holder).transfer(userAddress, parseUnits("500", 18));
  await token1.connect(token1Holder).transfer(userAddress, parseUnits("500", usdtDecimals));
};

const setupRiskManagementContracts = async () => {
  riskFund = RiskFund__factory.connect(RISKFUND, impersonatedTimelock);
  protocolShareReserve = ProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);

  shortfall = Shortfall__factory.connect(SHORTFALL, impersonatedTimelock);
  await shortfall.updateMinimumPoolBadDebt(parseUnits("50", 18)); // --------------------------------------------
};

const setupTokens = async () => {
  token2 = await ethers.getContractAt<IERC20__factory>("MockToken", TOKEN2);
  token1 = await ethers.getContractAt<IERC20__factory>("MockToken", USDT);
  usdtDecimals = await token1.decimals();

  await grabTokensTo(manager.address);
  await grabTokensTo(user1.address);
  await grabTokensTo(liquidator.address);

  comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
  chainlinkOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);
  resilientOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);

  let tokenConfig = {
    asset: token2.address,
    oracles: [chainlinkOracle.address, ethers.constants.AddressZero, ethers.constants.AddressZero],
    enableFlagsForOracles: [true, false, false],
  };
  await resilientOracle.connect(impersonatedTimelock).setTokenConfig(tokenConfig);

  tokenConfig = {
    asset: token1.address,
    oracles: [chainlinkOracle.address, ethers.constants.AddressZero, ethers.constants.AddressZero],
    enableFlagsForOracles: [true, false, false],
  };
  await resilientOracle.connect(impersonatedTimelock).setTokenConfig(tokenConfig);

  vTOKEN2 = await ethers.getContractAt<VToken__factory>("VToken", VTOKEN2);
  vTOKEN1 = await ethers.getContractAt<VToken__factory>("VToken", VUSDT);
};

const generateToken1BadDebt = async () => {
  const token2SupplyAmount = parseUnits("500", 18);
  const token1BorrowAmount = parseUnits("100", usdtDecimals);

  await token1.connect(manager).approve(vTOKEN1.address, token1BorrowAmount);
  await vTOKEN1.connect(manager).mint(token1BorrowAmount);

  await token2.connect(user1).approve(vTOKEN2.address, token2SupplyAmount);
  await vTOKEN2.connect(user1).mint(token2SupplyAmount);

  await comptroller.connect(user1).enterMarkets([vTOKEN2.address]);
  await vTOKEN1.connect(user1).borrow(token1BorrowAmount);

  await chainlinkOracle.setDirectPrice(token2.address, "1");

  await token1.connect(liquidator).approve(vTOKEN1.address, parseUnits("100", usdtDecimals));
  await comptroller.connect(liquidator).healAccount(user1.address);

  // Restoring original price
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("100", 18));

  const shortfallSigner = await initMainnetUser(shortfall.address, parseEther("1"));
  const dust = (await vTOKEN1.badDebt()).sub(parseUnits("100", usdtDecimals));
  await vTOKEN1.connect(shortfallSigner).badDebtRecovered(dust);
};

const pretendRiskFundAccumulatedBaseAsset = async amount => {
  const token1Reserve = amount;
  await token1.approve(vTOKEN1.address, token1Reserve);

  await vTOKEN1.addReserves(token1Reserve);
  await vTOKEN1.reduceReserves(token1Reserve);

  await protocolShareReserve.releaseFunds(comptroller.address, [token1.address]);
};

const setup = async () => {
  [manager, user1, liquidator] = await ethers.getSigners();

  await setForkBlock(BLOCK_NUMBER);

  await configureTimelock();
  await setupRiskManagementContracts();
  await setupTokens();
  oldPoolAsetReserves = await riskFund.getPoolsBaseAssetReserves(COMPTROLLER);

  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("100", 18));
  await chainlinkOracle.setDirectPrice(token1.address, parseUnits("100", 18));

  await generateToken1BadDebt();
  await pretendRiskFundAccumulatedBaseAsset(parseUnits("100", usdtDecimals));
};

enum AuctionType {
  LARGE_POOL_DEBT = 0,
  LARGE_RISK_FUND = 1,
}

if (FORK && (FORKED_NETWORK === "bscmainnet" || FORKED_NETWORK === "bsctestnet")) {
  describe("Shortfall fork tests", async () => {
    beforeEach(async () => {
      await loadFixture(setup);
    });

    it("initializes as expected", async () => {
      const newPoolAssetReserves = await riskFund.getPoolsBaseAssetReserves(COMPTROLLER);

      expect(await vTOKEN1.badDebt()).to.equal(parseUnits("100", usdtDecimals));
      expect(await vTOKEN2.badDebt()).to.equal(0);
      expect(newPoolAssetReserves.sub(oldPoolAsetReserves)).to.closeTo(
        parseUnits("40", usdtDecimals),
        parseUnits("5", usdtDecimals),
      );
    });

    describe("startAuction", async () => {
      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) < bad debt plus incentive ($)", async () => {
        await shortfall.startAuction(COMPTROLLER);

        const auction = await shortfall.auctions(COMPTROLLER);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });

      it("starts a LARGE_RISK_FUND auction if risk fund reserve ($) > bad debt plus incentive ($)", async () => {
        await pretendRiskFundAccumulatedBaseAsset(parseUnits("200", usdtDecimals));

        await shortfall.startAuction(COMPTROLLER);

        const auction = await shortfall.auctions(COMPTROLLER);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_RISK_FUND);
      });

      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) == bad debt plus incentive ($)", async () => {
        await chainlinkOracle.setDirectPrice(token1.address, parseUnits("1.1", 18));
        await chainlinkOracle.setDirectPrice(token2.address, parseUnits("1.0", 18));

        // Ensure our computations are correct
        const token1Price = await resilientOracle.getPrice(token1.address);
        const badDebtPlusIncentive = (await vTOKEN1.badDebt())
          .mul(parseUnits("1.1", 18))
          .mul(token1Price)
          .div(parseUnits("1", 18 + 36 - usdtDecimals));
        expect(badDebtPlusIncentive).to.equal(parseUnits("121", usdtDecimals));

        const token2Price = await resilientOracle.getPrice(token2.address);
        const riskFundReserve = await riskFund.getPoolsBaseAssetReserves(COMPTROLLER);
        const riskFundReserveInUsd = riskFundReserve.mul(token2Price).div(parseUnits("1", 18));

        expect(riskFundReserveInUsd.sub(oldPoolAsetReserves)).to.closeTo(
          parseUnits("40", usdtDecimals),
          parseUnits("5", usdtDecimals),
        );

        await shortfall.startAuction(COMPTROLLER);

        const auction = await shortfall.auctions(COMPTROLLER);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });
    });
  });
}

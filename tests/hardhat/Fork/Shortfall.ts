import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
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
  ADMIN,
  ACM,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
  COMPTROLLER,
  BLOCK_NUMBER,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  TOKEN1,
  TOKEN2,
  VTOKEN1,
  VTOKEN2,
  RISKFUND,
  SHORTFALL,
  TREASURY,
  PSR,
} = getContractAddresses(network as string);

const { expect } = chai;
chai.use(smock.matchers);

let impersonatedTimelock: SignerWithAddress;
let accessControlManager: AccessControlManager;
let resilientOracle: MockPriceOracle;
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
let protocolShareReserve: ProtocolShareReserve | MockProtocolShareReserve;
let riskFund: RiskFund;

const configureTimelock = async () => {
  impersonatedTimelock = await initMainnetUser(ADMIN, parseEther("2"));
};

const grabTokensTo = async (userAddress: string) => {
  const token2Holder = await initMainnetUser(TOKEN2_HOLDER, parseEther("2"));
  const token1Holder = await initMainnetUser(TOKEN1_HOLDER, parseEther("2"));

  await token2.connect(token2Holder).transfer(userAddress, parseUnits("10000", 18));
  await token1.connect(token1Holder).transfer(userAddress, parseUnits("10000", 18));
};

const setupRiskManagementContracts = async () => {
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
  await accessControlManager.giveCallPermission(RISKFUND, "setConvertibleBaseAsset(address)", ADMIN);
  await accessControlManager.giveCallPermission(SHORTFALL, "updateMinimumPoolBadDebt(uint256)", ADMIN);

  riskFund = RiskFund__factory.connect(RISKFUND, impersonatedTimelock);
  await riskFund.connect(impersonatedTimelock).setConvertibleBaseAsset(TOKEN1);
  protocolShareReserve = ProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);

  if (network == "bsctestnet") {
    protocolShareReserve = MockProtocolShareReserve__factory.connect(PSR, impersonatedTimelock);
  }

  if (network == "bsctestnet") {
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
  }

  shortfall = Shortfall__factory.connect(SHORTFALL, impersonatedTimelock);
  await shortfall.updateMinimumPoolBadDebt(parseUnits("50", 18));

  if (network == "sepolia") {
    await protocolShareReserve.connect(impersonatedTimelock).acceptOwnership();
    await riskFund.connect(impersonatedTimelock).acceptOwnership();
    await shortfall.connect(impersonatedTimelock).acceptOwnership();
  }
};

const setupTokens = async () => {
  token2 = await ethers.getContractAt<IERC20__factory>("MockToken", TOKEN2);
  token1 = await ethers.getContractAt<IERC20__factory>("MockToken", TOKEN1);

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
  vTOKEN1 = await ethers.getContractAt<VToken__factory>("VToken", VTOKEN1);

  await vTOKEN1.connect(impersonatedTimelock).setShortfallContract(SHORTFALL);
  await vTOKEN2.connect(impersonatedTimelock).setShortfallContract(SHORTFALL);
  await vTOKEN1.connect(impersonatedTimelock).setProtocolShareReserve(PSR);
  await vTOKEN2.connect(impersonatedTimelock).setProtocolShareReserve(PSR);
};

const generateToken1BadDebt = async () => {
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("100", 18));
  const token2SupplyAmount = parseUnits("500", 18);
  const token1BorrowAmount = parseUnits("100", 18);

  await token1.connect(manager).approve(vTOKEN1.address, token1BorrowAmount);
  await vTOKEN1.connect(manager).mint(token1BorrowAmount);

  await token2.connect(user1).approve(vTOKEN2.address, token2SupplyAmount);
  await vTOKEN2.connect(user1).mint(token2SupplyAmount);

  await comptroller.connect(user1).enterMarkets([vTOKEN2.address]);
  await vTOKEN1.connect(user1).borrow(token1BorrowAmount);

  await chainlinkOracle.setDirectPrice(token2.address, "1");

  await token1.connect(liquidator).approve(vTOKEN1.address, parseUnits("100", 18));
  await comptroller.connect(liquidator).healAccount(user1.address);

  // Restoring original price
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("100", 18));

  const shortfallSigner = await initMainnetUser(shortfall.address, parseEther("1"));
  const dust = (await vTOKEN1.badDebt()).sub(parseUnits("100", 18));
  await vTOKEN1.connect(shortfallSigner).badDebtRecovered(dust);
};

const pretendRiskFundAccumulatedBaseAsset = async amount => {
  const token1Reserve = amount;
  await token1.approve(vTOKEN1.address, token1Reserve);

  await vTOKEN1.addReserves(token1Reserve);

  await vTOKEN1.reduceReserves(token1Reserve);

  if (network == "bsctestnet") {
    await protocolShareReserve.releaseFunds(comptroller.address, [token1.address]);
  } else {
    await protocolShareReserve.releaseFunds(comptroller.address, token1.address, token1Reserve);
  }
};

const setup = async () => {
  [manager, user1, liquidator] = await ethers.getSigners();

  await setForkBlock(BLOCK_NUMBER);

  await configureTimelock();

  await setupRiskManagementContracts();
  await setupTokens();
  await chainlinkOracle.setDirectPrice(token2.address, parseUnits("100", 18));
  await chainlinkOracle.setDirectPrice(token1.address, parseUnits("100", 18));

  await generateToken1BadDebt();
  await pretendRiskFundAccumulatedBaseAsset(parseUnits("100", 18));
};

enum AuctionType {
  LARGE_POOL_DEBT = 0,
  LARGE_RISK_FUND = 1,
}

if (FORKING) {
  describe("Shortfall fork tests", async () => {
    const token1BadDebt = parseUnits("100", 18);
    const token2RiskFund = parseUnits("50", 18);

    beforeEach(async () => {
      await loadFixture(setup);
    });

    it("initializes as expected", async () => {
      expect(await vTOKEN1.badDebt()).to.equal(token1BadDebt);
      expect(await vTOKEN2.badDebt()).to.equal(0);
      expect(await riskFund.getPoolsBaseAssetReserves(COMPTROLLER)).to.closeTo(token2RiskFund, parseUnits("2", 18));
    });

    describe("startAuction", async () => {
      it("starts a LARGE_POOL_DEBT auction if risk fund reserve ($) < bad debt plus incentive ($)", async () => {
        await shortfall.startAuction(COMPTROLLER);

        const auction = await shortfall.auctions(COMPTROLLER);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });

      it("starts a LARGE_RISK_FUND auction if risk fund reserve ($) > bad debt plus incentive ($)", async () => {
        await pretendRiskFundAccumulatedBaseAsset(parseUnits("200", 18));

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
          .div(parseUnits("1", 36));
        expect(badDebtPlusIncentive).to.equal(parseUnits("121", 18));

        const token2Price = await resilientOracle.getPrice(token2.address);
        const riskFundReserve = await riskFund.getPoolsBaseAssetReserves(COMPTROLLER);
        const riskFundReserveInUsd = riskFundReserve.mul(token2Price).div(parseUnits("1", 18));

        expect(riskFundReserveInUsd).to.closeTo(parseUnits("50", 18), parseUnits("2", 18));

        await shortfall.startAuction(COMPTROLLER);

        const auction = await shortfall.auctions(COMPTROLLER);
        expect(auction.auctionType).to.equal(AuctionType.LARGE_POOL_DEBT);
      });
    });
  });
}

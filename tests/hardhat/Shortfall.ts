import { ethers } from "hardhat";
import {
  AccessControlManager,
  CErc20,
  CErc20__factory,
  Comptroller,
  Comptroller__factory,
  IRiskFund,
  MockToken,
  PriceOracle,
  Shortfall,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";

let shortfall:Shortfall
let fakeRiskFund:FakeContract<IRiskFund>
let mockBUSD: MockToken;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: MockContract<CErc20>;
let cWBTC: MockContract<CErc20>;
let comptroller: MockContract<Comptroller>;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let fakePriceOracle: FakeContract<PriceOracle>;

let riskFundBalance = "10000"
const minimumPoolBadDebt = "10000"
const pooldId = "1"

describe("Shortfall: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const MockBUSD = await ethers.getContractFactory("MockToken");
    mockBUSD = await MockBUSD.deploy("BUSD", "BUSD", 18);
    await mockBUSD.faucet(convertToUnit(100000, 18));

    fakeRiskFund = await smock.fake<IRiskFund>("IRiskFund")

    const Shortfall = await ethers.getContractFactory("Shortfall");
    shortfall = await Shortfall.deploy(
      mockBUSD.address,
      fakeRiskFund.address
    );
    await shortfall.initialize(parseUnits(minimumPoolBadDebt, "18"));

    const [poolRegistry] = await ethers.getSigners();
    await shortfall.setPoolRegistry(poolRegistry.address)

    //Deploy Mock Tokens
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);

    fakeAccessControlManager = await smock.fake<AccessControlManager>(
      "AccessControlManager"
    );
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const Comptroller = await smock.mock<Comptroller__factory>('Comptroller');
    comptroller = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address)

    cDAI = await (await smock.mock<CErc20__factory>("CErc20")).deploy()
    cWBTC = await (await smock.mock<CErc20__factory>("CErc20")).deploy()
    
    cWBTC.setVariable("decimals", 8);
    cDAI.decimals.returns(18);
    
    cDAI.setVariable("underlying", mockDAI.address)
    cWBTC.setVariable("underlying", mockWBTC.address)

    cDAI.setVariable("shortfall", shortfall.address)
    cWBTC.setVariable("shortfall", shortfall.address)

    await shortfall.setPoolComptroller(pooldId, comptroller.address)

    comptroller.getAllMarkets.returns((args: any) => {
      return [cDAI.address, cWBTC.address];
    });

    fakePriceOracle = await smock.fake<PriceOracle>("PriceOracle");

    const btcPrice = "21000.34";
    const daiPrice = "1";

    fakePriceOracle.getUnderlyingPrice.returns((args: any) => {
      if (cDAI && cWBTC) {
        if (args[0] === cDAI.address) {
          return convertToUnit(daiPrice, 18);
        } else {
          return convertToUnit(btcPrice, 18);
        }
      }

      return 1;
    });

    comptroller.oracle.returns(fakePriceOracle.address);

    fakeRiskFund.getPoolReserve.returns(parseUnits(riskFundBalance, 18))

    fakeRiskFund.transferReserveForAuction.returns(async () => {
      await mockBUSD.transfer(shortfall.address, parseUnits(riskFundBalance, 18))
    });
  });

  it("Should have debt and reserve", async function () {
    const comptrollerAddress = (await shortfall.comptrollers(1));
    expect(comptrollerAddress).equal(comptroller.address)

    cDAI.badDebt.returns(parseUnits("1000", 18))
    cWBTC.badDebt.returns(parseUnits("1", 8))

    expect(await fakeRiskFund.getPoolReserve(1)).equal(parseUnits(riskFundBalance, 18).toString())

    expect(await cDAI.badDebt()).equal(parseUnits("1000", 18))
    expect(await cWBTC.badDebt()).equal(parseUnits("1", 8))
  });

  it("Should not start auction", async function () {
    cDAI.badDebt.returns(parseUnits("20", 18))
    cWBTC.badDebt.returns(parseUnits("0.01", 8))

    await expect(shortfall.startAuction(1)).to.be.reverted;
  });
});

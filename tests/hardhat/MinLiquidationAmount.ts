import { ethers } from "hardhat";
import {
  FakeContract,
  MockContract,
  MockContractFactory,
  smock,
} from "@defi-wonderland/smock";
import {
  Comptroller,
  ComptrollerErrorReporter,
  Comptroller__factory,
  CToken,
  PriceOracle,
} from "../../typechain";
import chai from "chai";

import { Error } from "./util/Errors";
import { assert } from "console";

chai.should(); // if you like should syntax
const { expect } = chai;
chai.use(smock.matchers);

describe("Min Liquidation Amount", () => {
  let comptrollerFactory: MockContractFactory<Comptroller__factory>;
  let comptroller: MockContract<Comptroller>;

  let cTokenBorrow: FakeContract<CToken>;
  let cTokenCollateral: FakeContract<CToken>;

  let priceOracle: FakeContract<PriceOracle>;

  let errorReporter: FakeContract<ComptrollerErrorReporter>;

  beforeEach(async () => {
    comptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    comptroller = await comptrollerFactory.deploy();
    await comptroller.deployed();

    priceOracle = await smock.fake<PriceOracle>("PriceOracle");

    await comptroller._setPriceOracle(priceOracle.address);

    cTokenBorrow = await smock.fake<CToken>("CToken");
    cTokenCollateral = await smock.fake<CToken>("CToken");

    errorReporter = await smock.fake<ComptrollerErrorReporter>(
      "ComptrollerErrorReporter"
    );
  });

  it("should revert if Oracle Price is 0", async () => {
    const [owner, addr1] = await ethers.getSigners();
    var response = await comptroller.validateMinLiquidatableAmount(
      1,
      cTokenCollateral.address,
      cTokenBorrow.address
    );
    expect(Number(response).should.be.equal(Number(Error.PRICE_ERROR)));
  });

  it("should revert if min liqudate amount is not set in contract storage", async () => {
    await priceOracle.getUnderlyingPrice.returns(1);
    const [owner, addr1] = await ethers.getSigners();
    var response = await comptroller.validateMinLiquidatableAmount(
      1,
      cTokenCollateral.address,
      cTokenBorrow.address
    );

    expect(
      Number(response).should.be.equal(
        Number(Error.MIN_LIQUIDATABLE_AMOUNT_NOT_SET)
      )
    );
  });

  it("should revert if min liqudate amount > repayAmount", async () => {
    await priceOracle.getUnderlyingPrice.returns(100);

    var cTokenBorrowAddress = cTokenBorrow.address;

    await comptroller.setVariable("minimalLiquidatableAmount", {
      [cTokenBorrowAddress]: 1000,
    });

    const [owner, addr1] = await ethers.getSigners();
    var response = await comptroller.validateMinLiquidatableAmount(
      1,
      cTokenCollateral.address,
      cTokenBorrow.address
    );
    expect(
      Number(response).should.be.equal(
        Number(Error.BELOW_MIN_LIQUIDATABLE_AMOUNT)
      )
    );
  });

  it("should return 0 upon sucessful validation", async () => {
    await priceOracle.getUnderlyingPrice.returns(1000000);

    var cTokenBorrowAddress = cTokenBorrow.address;

    await comptroller.setVariable("minimalLiquidatableAmount", {
      [cTokenBorrowAddress]: 1,
    });

    const [owner, addr1] = await ethers.getSigners();
    var response = await comptroller.validateMinLiquidatableAmount(
      2,
      cTokenCollateral.address,
      cTokenBorrow.address
    );
    expect(
      Number(response).should.be.equal(
        Number(Error.NO_ERROR)
      )
    );
  });
});

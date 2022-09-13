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
  VToken,
  PriceOracle,
  AccessControlManager
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

  let vTokenBorrow: FakeContract<VToken>;
  let vTokenCollateral: FakeContract<VToken>;

  let priceOracle: FakeContract<PriceOracle>;
  let accessControlManager: FakeContract<AccessControlManager>;

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");

    comptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    comptroller = await comptrollerFactory.deploy(owner.address, accessControlManager.address);
    await comptroller.deployed();

    priceOracle = await smock.fake<PriceOracle>("PriceOracle");

    await comptroller._setPriceOracle(priceOracle.address);

    vTokenBorrow = await smock.fake<VToken>("VToken");
    vTokenCollateral = await smock.fake<VToken>("VToken");
  });
  describe("Verification Tests", () => {
    it("should revert if Oracle Price is 0", async () => {
      const [owner, addr1] = await ethers.getSigners();
      var response = await comptroller.validateMinLiquidatableAmount(
        1,
        vTokenCollateral.address,
        vTokenBorrow.address
      );
      expect(Number(response).should.be.equal(Number(Error.PRICE_ERROR)));
    });

    it("should revert if min liqudate amount is not set in contract storage", async () => {
      await priceOracle.getUnderlyingPrice.returns(1);
      const [owner, addr1] = await ethers.getSigners();
      var response = await comptroller.validateMinLiquidatableAmount(
        1,
        vTokenCollateral.address,
        vTokenBorrow.address
      );

      expect(
        Number(response).should.be.equal(
          Number(Error.MIN_LIQUIDATABLE_AMOUNT_NOT_SET)
        )
      );
    });

    it("should revert if min liqudate amount > repayAmount", async () => {
      await priceOracle.getUnderlyingPrice.returns(100);

      var vTokenBorrowAddress = vTokenBorrow.address;

      await comptroller.setVariable("minimalLiquidatableAmount", {
        [vTokenBorrowAddress]: 1000,
      });

      const [owner, addr1] = await ethers.getSigners();
      var response = await comptroller.validateMinLiquidatableAmount(
        1,
        vTokenCollateral.address,
        vTokenBorrow.address
      );
      expect(
        Number(response).should.be.equal(
          Number(Error.BELOW_MIN_LIQUIDATABLE_AMOUNT)
        )
      );
    });

    it("should return 0 upon sucessful validation", async () => {
      await priceOracle.getUnderlyingPrice.returns(1000000);

      var vTokenBorrowAddress = vTokenBorrow.address;

      await comptroller.setVariable("minimalLiquidatableAmount", {
        [vTokenBorrowAddress]: 1,
      });

      const [owner, addr1] = await ethers.getSigners();
      var response = await comptroller.validateMinLiquidatableAmount(
        2,
        vTokenCollateral.address,
        vTokenBorrow.address
      );
      expect(
        Number(response).should.be.equal(
          Number(Error.NO_ERROR)
        )
      );
    });
  });
  describe("Administration Tests", () => {
    it("only admin can set Min Liquidate Amounts", async () => {
      const [owner, addr1, addr2] = await ethers.getSigners();

      var vTokens : String[] = [addr1.address, addr2.address]
      var limits : Number[] = [1,2]
	  
      accessControlManager.isAllowedToCall.returns(false);
      // calling function from addr1 instead of owner address
      await expect(
        comptroller.connect(addr1)._setMarketMinLiquidationAmount(vTokens, limits)
        )
      .to.be.revertedWith("only approved addresses can update min liquidation amounts");
    });

    it("invalid data (markets == 0)", async () => {
      const [owner, addr1] = await ethers.getSigners();

      var vTokens : String[] = []
      var limits : Number[] = [1,2]

      accessControlManager.isAllowedToCall.returns(true);

      await expect(
        comptroller._setMarketMinLiquidationAmount(vTokens, limits)
        )
      .to.be.revertedWith("invalid input");
    });

    it("invalid data (markets.size != limits.size)", async () => {
      const [owner, addr1, addr2] = await ethers.getSigners();

      var vTokens : String[] = [addr1.address, addr2.address]
      var limits : Number[] = [1, 2, 3]

      accessControlManager.isAllowedToCall.returns(true);
	  
      await expect(
        comptroller._setMarketMinLiquidationAmount(vTokens, limits)
      )
      .to.be.revertedWith("invalid input");
    });
  });
});

import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

type SimpleComptrollerFixture = {
  poolRegistry: FakeContract<PoolRegistry>;
  oracle: FakeContract<PriceOracle>;
  accessControl: FakeContract<AccessControlManager>;
  comptroller: MockContract<Comptroller>;
};

const maxLoopsLimit = 150;

async function deploySimpleComptroller(): Promise<SimpleComptrollerFixture> {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const oracle = await smock.fake<PriceOracle>("PriceOracle");
  const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await upgrades.deployProxy(Comptroller, [maxLoopsLimit, accessControl.address], {
    constructorArgs: [poolRegistry.address],
    initializer: "initialize(uint256,address)",
  });
  await comptroller.setPriceOracle(oracle.address);
  await comptroller.setLiquidationIncentive(parseUnits("1", 18));
  return { oracle, comptroller, accessControl, poolRegistry };
}

function configureVToken(vToken: FakeContract<VToken>, comptroller: MockContract<Comptroller>) {
  vToken.comptroller.returns(comptroller.address);
  vToken.isVToken.returns(true);
  vToken.exchangeRateStored.returns(parseUnits("2", 18));
  vToken.totalSupply.returns(parseUnits("1000000", 18));
  vToken.totalBorrows.returns(parseUnits("900000", 18));
}

describe("hooks", () => {
  describe("preMintHook", () => {
    let root: SignerWithAddress;
    let comptroller: MockContract<Comptroller>;
    let vToken: FakeContract<VToken>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      vToken.isVToken.returns(true);
      const { comptroller, poolRegistry } = contracts;
      await setBalance(poolRegistry.address, parseEther("1"));
      await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      [root] = await ethers.getSigners();
      ({ comptroller, vToken } = await loadFixture(deploy));
      configureVToken(vToken, comptroller);
    });

    it("allows minting if cap is not reached", async () => {
      const cap = parseUnits("1001", 18);
      const currentVTokenSupply = parseUnits("500", 18);
      const exchangeRate = parseUnits("2", 18);
      // underlying supply = currentVTokenSupply * exchangeRate = 1000

      vToken.totalSupply.returns(currentVTokenSupply);
      vToken.exchangeRateStored.returns(exchangeRate);
      await comptroller.setMarketSupplyCaps([vToken.address], [cap]);
      await comptroller.callStatic.preMintHook(vToken.address, root.address, parseUnits("0.9999", 18));
    });

    it("reverts if supply cap reached", async () => {
      const cap = parseUnits("1001", 18);
      const currentVTokenSupply = parseUnits("500", 18);
      const exchangeRate = parseUnits("2", 18);
      // underlying supply = currentVTokenSupply * exchangeRate = 1000

      vToken.totalSupply.returns(currentVTokenSupply);
      vToken.exchangeRateStored.returns(exchangeRate);
      await comptroller.setMarketSupplyCaps([vToken.address], [cap]);
      await expect(comptroller.preMintHook(vToken.address, root.address, parseUnits("1.01", 18)))
        .to.be.revertedWithCustomError(comptroller, "SupplyCapExceeded")
        .withArgs(vToken.address, cap);
    });

    it("reverts if market is not listed", async () => {
      const someVToken = await smock.fake<VToken>("VToken");
      await expect(comptroller.preMintHook(someVToken.address, root.address, parseUnits("1", 18)))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(someVToken.address);
    });
  });
});

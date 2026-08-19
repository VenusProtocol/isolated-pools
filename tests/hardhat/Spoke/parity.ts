import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, Contract, constants } from "ethers";
import { Interface, parseEther, parseUnits } from "ethers/lib/utils";
import { readFileSync } from "fs";
import { artifacts, ethers, upgrades } from "hardhat";
import { resolve } from "path";

import { AccessControlManager, PoolRegistry, ResilientOracleInterface, VToken } from "../../../typechain";
import { MAX_LOOPS_LIMIT, ONE } from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const SHARED = "Comptroller";
const SPOKE = "SpokeComptroller";

const POOL_INCENTIVE = parseUnits("1.1", 18);
const MARKET_INCENTIVE = parseUnits("1.25", 18);
const CLOSE_FACTOR = parseUnits("0.5", 18);
const SUPPLY_CAP = parseUnits("1000", 18);

/// Functions and events the spoke drops, because Prime does not exist on a spoke pool.
const REMOVED_FUNCTIONS = ["prime()", "setPrimeToken(address)"];
const REMOVED_EVENTS = ["NewPrimeToken(address,address)"];

/// The spoke's own surface: per-market liquidation incentives, the two allowlists, and the bounded oracle.
const ADDED_FUNCTIONS = [
  "deviationBoundedOracle()",
  "effectiveLiquidationIncentive(address)",
  "isAllowedLiquidator(address)",
  "isAllowedSupplier(address,address)",
  "isLiquidationAllowlistEnabled()",
  "isSupplyAllowlistEnabled(address)",
  "liquidationIncentives(address)",
  "setAllowedLiquidator(address,bool)",
  "setAllowedSupplier(address,address,bool)",
  "setDeviationBoundedOracle(address)",
  "setLiquidationAllowlistEnabled(bool)",
  "setMarketLiquidationIncentive(address,uint256)",
  "setSupplyAllowlistEnabled(address,bool)",
];
const ADDED_EVENTS = [
  "AllowedLiquidatorUpdated(address,bool)",
  "AllowedSupplierUpdated(address,address,bool)",
  "LiquidationAllowlistEnabledUpdated(bool)",
  "NewDeviationBoundedOracle(address,address)",
  "NewMarketLiquidationIncentive(address,uint256,uint256)",
  "SupplyAllowlistEnabledUpdated(address,bool)",
];

/// Roles the spoke adds. Everything upstream checks has to still be checked under the same string.
const ADDED_ROLES = [
  "setAllowedLiquidator(address,bool)",
  "setAllowedSupplier(address,address,bool)",
  "setLiquidationAllowlistEnabled(bool)",
  "setMarketLiquidationIncentive(address,uint256)",
  "setSupplyAllowlistEnabled(address,bool)",
];

async function signatures(contractName: string, kind: "function" | "event"): Promise<string[]> {
  const { abi } = await artifacts.readArtifact(contractName);
  return new Interface(abi).fragments
    .filter(fragment => fragment.type === kind)
    .map(fragment => fragment.format("sighash"))
    .sort();
}

function roleStrings(sourcePath: string): string[] {
  const source = readFileSync(resolve(__dirname, "../../..", sourcePath), "utf8");
  return [...source.matchAll(/_checkAccessAllowed\("([^"]+)"\)/g)].map(match => match[1]).sort();
}

interface Pool {
  comptroller: Contract;
  markets: FakeContract<VToken>[];
  oracle: FakeContract<ResilientOracleInterface>;
}

/// A pool of either implementation, configured the same way. Both take the pool registry as a constructor argument
/// and share the same initializer, which is what makes one setup function enough.
async function deployPool(contractName: string): Promise<Pool> {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const acm = await smock.fake<AccessControlManager>("AccessControlManager");
  acm.isAllowedToCall.returns(true);
  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  await setBalance(poolRegistry.address, parseEther("1"));

  const factory = await ethers.getContractFactory(contractName);
  const comptroller = await upgrades.deployProxy(factory, [MAX_LOOPS_LIMIT, acm.address], {
    constructorArgs: [poolRegistry.address],
    initializer: "initialize(uint256,address)",
  });

  await comptroller.setPriceOracle(oracle.address);
  await comptroller.setCloseFactor(CLOSE_FACTOR);
  await comptroller.setLiquidationIncentive(POOL_INCENTIVE);

  const markets: FakeContract<VToken>[] = [];
  for (let i = 0; i < 2; ++i) {
    const vToken = await smock.fake<VToken>("VToken");
    vToken.isVToken.returns(true);
    vToken.exchangeRateStored.returns(ONE);
    vToken.getAccountSnapshot.returns([0, 0, 0, ONE]);
    vToken.totalSupply.returns(0);
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(ONE);

    await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
    await comptroller.setMarketSupplyCaps([vToken.address], [SUPPLY_CAP]);
    await comptroller.setMarketBorrowCaps([vToken.address], [constants.MaxUint256]);
    markets.push(vToken);
  }

  // The spoke's deviation-bounded oracle is deliberately left unset: none of the paths below read it, and leaving it
  // out keeps the two pools configured identically.
  return { comptroller, markets, oracle };
}

async function deployBothPools(): Promise<Record<string, Pool>> {
  return { [SHARED]: await deployPool(SHARED), [SPOKE]: await deployPool(SPOKE) };
}

// The spoke is a hand-maintained fork of `Comptroller`, and everything built against the shared implementation
// (the lens, the periphery contracts, VIP calldata, subgraphs) assumes the two behave the same wherever the fork
// was not meant to change anything. These tests state that assumption, so a re-sync that quietly drops a function,
// renames a role or changes a number has to fail somewhere other than on a live pool.
describe("SpokeComptroller: parity with the shared Comptroller", () => {
  let pools: Record<string, Pool>;
  let account: SignerWithAddress;

  const both = () => Object.entries(pools);

  /// Runs the same call against both implementations. The fork replaced upstream's revert strings with custom
  /// errors, so the two agree on the outcome rather than on the error, and the assertions only ask for that.
  async function bothReject(call: (pool: Pool) => Promise<unknown>): Promise<void> {
    for (const [name, pool] of both()) {
      await expect(call(pool), `${name} should reject`).to.be.reverted;
    }
  }

  async function bothAccept(call: (pool: Pool) => Promise<unknown>): Promise<void> {
    for (const [name, pool] of both()) {
      await expect(call(pool), `${name} should accept`).to.not.be.reverted;
    }
  }

  describe("surface", () => {
    it("keeps every function upstream exposes, apart from the Prime pair", async () => {
      const shared = await signatures(SHARED, "function");
      const spoke = await signatures(SPOKE, "function");

      expect(shared.filter(signature => !spoke.includes(signature))).to.deep.equal(REMOVED_FUNCTIONS);
      expect(spoke.filter(signature => !shared.includes(signature))).to.deep.equal(ADDED_FUNCTIONS);
    });

    it("keeps every event upstream emits, apart from the Prime one", async () => {
      // Indexers key off event signatures, so a renamed or reshaped event breaks them silently.
      const shared = await signatures(SHARED, "event");
      const spoke = await signatures(SPOKE, "event");

      expect(shared.filter(signature => !spoke.includes(signature))).to.deep.equal(REMOVED_EVENTS);
      expect(spoke.filter(signature => !shared.includes(signature))).to.deep.equal(ADDED_EVENTS);
    });

    it("keeps liquidationIncentiveMantissa() in the ABI even though it answers per caller now", async () => {
      // Same selector, and for anything that is not a market of the pool the same answer. That is what keeps the
      // lens and every off-chain reader working.
      expect(await signatures(SPOKE, "function")).to.include("liquidationIncentiveMantissa()");
      expect(await signatures(SHARED, "function")).to.include("liquidationIncentiveMantissa()");
    });

    it("checks every access-controlled role under the same string", async () => {
      // The ACM hashes the string, so a role that upstream spells one way and the spoke another needs a different
      // grant in the listing VIP. Copying upstream's grants would then leave the setter permanently unauthorized.
      const shared = roleStrings("contracts/Comptroller.sol");
      const spoke = roleStrings("contracts/Spoke/SpokeComptroller.sol");

      expect(shared.filter(role => !spoke.includes(role))).to.deep.equal([]);
      expect(spoke.filter(role => !shared.includes(role))).to.deep.equal(ADDED_ROLES);
    });
  });

  describe("shared behaviour", () => {
    beforeEach(async () => {
      [, account] = await ethers.getSigners();
      pools = await loadFixture(deployBothPools);

      // `loadFixture` rewinds the chain but hands back the same fakes, and a fake's behaviour lives in JavaScript
      // rather than in the EVM. A price one test moves is still in place for the next one without this.
      for (const [, pool] of both()) {
        pool.oracle.getUnderlyingPrice.reset();
        for (const market of pool.markets) {
          pool.oracle.getUnderlyingPrice.whenCalledWith(market.address).returns(ONE);
        }
      }
    });

    it("prices a seizure identically while no market carries its own incentive", async () => {
      const cases = [
        { repay: parseUnits("100", 18), borrowedPrice: ONE, collateralPrice: ONE },
        { repay: parseUnits("37.5", 18), borrowedPrice: parseUnits("2", 18), collateralPrice: ONE },
        { repay: parseUnits("1", 18), borrowedPrice: ONE, collateralPrice: parseUnits("3", 18) },
      ];

      for (const { repay, borrowedPrice, collateralPrice } of cases) {
        const results: BigNumber[] = [];
        for (const [, pool] of both()) {
          const [borrowed, collateral] = pool.markets;
          pool.oracle.getUnderlyingPrice.whenCalledWith(borrowed.address).returns(borrowedPrice);
          pool.oracle.getUnderlyingPrice.whenCalledWith(collateral.address).returns(collateralPrice);

          const [error, seizeTokens] = await pool.comptroller.liquidateCalculateSeizeTokens(
            borrowed.address,
            collateral.address,
            repay,
          );
          expect(error).to.equal(0);
          results.push(seizeTokens);
        }

        // repay * incentive * borrowedPrice / (collateralPrice * exchangeRate)
        const expected = repay.mul(POOL_INCENTIVE).div(ONE).mul(borrowedPrice).div(collateralPrice);
        expect(results[0]).to.equal(expected);
        expect(results[1]).to.equal(results[0]);
      }
    });

    it("diverges only once the collateral market carries its own incentive", async () => {
      const [borrowed, collateral] = pools[SPOKE].markets;
      await pools[SPOKE].comptroller.setMarketLiquidationIncentive(collateral.address, MARKET_INCENTIVE);
      const repay = parseUnits("100", 18);

      // Only one of the two ABIs names the return values, so both are read positionally.
      const seizeTokens = async (pool: Pool) =>
        (
          await pool.comptroller.liquidateCalculateSeizeTokens(pool.markets[0].address, pool.markets[1].address, repay)
        )[1];

      expect(await seizeTokens(pools[SHARED])).to.equal(repay.mul(POOL_INCENTIVE).div(ONE));
      expect(await seizeTokens(pools[SPOKE])).to.equal(repay.mul(MARKET_INCENTIVE).div(ONE));
      expect(borrowed.address).to.not.equal(collateral.address);
    });

    it("reports the pool-wide incentive to an ordinary caller", async () => {
      for (const [name, pool] of both()) {
        expect(await pool.comptroller.liquidationIncentiveMantissa(), name).to.equal(POOL_INCENTIVE);
      }
    });

    it("draws the close factor bounds in the same place", async () => {
      await bothAccept(pool => pool.comptroller.setCloseFactor(parseUnits("0.05", 18)));
      await bothAccept(pool => pool.comptroller.setCloseFactor(parseUnits("0.9", 18)));
      await bothReject(pool => pool.comptroller.setCloseFactor(parseUnits("0.05", 18).sub(1)));
      await bothReject(pool => pool.comptroller.setCloseFactor(parseUnits("0.9", 18).add(1)));
    });

    it("draws the collateral factor and threshold bounds in the same place", async () => {
      const weights = (pool: Pool, factor: BigNumber, threshold: BigNumber) =>
        pool.comptroller.setCollateralFactor(pool.markets[0].address, factor, threshold);

      await bothAccept(pool => weights(pool, parseUnits("0.95", 18), ONE));
      await bothReject(pool => weights(pool, parseUnits("0.95", 18).add(1), ONE));
      await bothReject(pool => weights(pool, parseUnits("0.5", 18), ONE.add(1)));
      // A threshold below the collateral factor would let an account borrow itself straight into liquidation.
      await bothReject(pool => weights(pool, parseUnits("0.5", 18), parseUnits("0.4", 18)));
    });

    it("holds the same floor under the pool-wide liquidation incentive", async () => {
      await bothAccept(pool => pool.comptroller.setLiquidationIncentive(ONE));
      await bothReject(pool => pool.comptroller.setLiquidationIncentive(ONE.sub(1)));
    });

    it("meters supply against the cap the same way", async () => {
      const mint = (pool: Pool, amount: BigNumber) =>
        pool.comptroller.callStatic.preMintHook(pool.markets[0].address, account.address, amount);

      await bothAccept(pool => mint(pool, SUPPLY_CAP));
      await bothReject(pool => mint(pool, SUPPLY_CAP.add(1)));
    });

    it("records the same asset list for an account", async () => {
      for (const [name, pool] of both()) {
        const addresses = pool.markets.map(market => market.address);
        await pool.comptroller.connect(account).enterMarkets(addresses);

        expect((await pool.comptroller.getAssetsIn(account.address)).map(String), name).to.deep.equal(addresses);
        expect(await pool.comptroller.checkMembership(account.address, addresses[0]), name).to.equal(true);
      }
    });

    it("rejects an unlisted market from the same entry points", async () => {
      const unlisted = await smock.fake<VToken>("VToken");

      await bothReject(pool => pool.comptroller.connect(account).enterMarkets([unlisted.address]));
      await bothReject(pool => pool.comptroller.callStatic.preMintHook(unlisted.address, account.address, ONE));
      await bothReject(pool => pool.comptroller.setCollateralFactor(unlisted.address, parseUnits("0.5", 18), ONE));
    });
  });
});

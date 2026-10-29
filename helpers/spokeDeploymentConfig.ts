import { InterestRateModels, PoolConfig, VTokenConfig, preconfiguredAddresses } from "./deploymentConfig";
import { convertToUnit } from "./utils";

// Market configuration for the hub-funded spoke pools, deliberately kept out of `deploymentConfig.ts`'s `globalConfig`.
// `008-deploy-comptrollers.ts` and `009-deploy-vtokens.ts` iterate every pool in that file, so a spoke entry there would
// be stood up behind the shared `ComptrollerBeacon` and `VTokenBeacon` and would claim these deployment names first.
// It is the same separation `024-deploy-spoke-pool-registry.ts` argues for on the registry side.
//
// The shape is the isolated pools' `PoolConfig`, so the parameters the listing VIP needs at `addPool` and `addMarket`
// time sit here next to the ones `028-deploy-spoke-vtokens.ts` reads. Spoke-only market state, the per-market
// liquidation threshold and incentive, the supply allowlist and forced liquidation, is set on `SpokeComptroller` after
// `addMarket` and is not deployment input.

// Names the first pool's comptroller record, `Comptroller_HubSpoke` from `025-deploy-spoke-comptroller.ts`, which
// `028-deploy-spoke-vtokens.ts` reads back to build the markets. Deployment naming across the spoke scripts follows one
// rule: pool-wide singletons take a `Spoke` prefix (`SpokePoolRegistry`, `SpokeComptrollerImpl`, `SpokeVTokenBeacon`,
// `SpokePoolLens`), per-pool instances take a pool suffix, as the isolated pools distinguish `Comptroller_Stablecoins`
// from `VToken_vUSDT_Stablecoins`.
//
// Each market's record is `VToken_<symbol>`, so the vToken symbol carries the suffix that tells its markets apart. On
// the test networks that suffix is the pool id. On `bscmainnet` it is the pool's own name, `bStockIndex`: the symbol is
// on-chain metadata users see, and the comptroller record was already named before the pool was. Pools added later
// use their id for both the comptroller record and the symbol suffix.
export const SPOKE_POOL_ID = "HubSpoke";

// The values the listing VIP sets, through `addPool`, `addMarket` and the comptroller's setters. No deploy script reads
// them, so a pool can be deployed before its risk parameters are decided, and its entry can leave them out.
type PoolListingParameter = "closeFactor" | "liquidationIncentive" | "minLiquidatableCollateral";
type MarketListingParameter =
  | "collateralFactor"
  | "liquidationThreshold"
  | "initialSupply"
  | "supplyCap"
  | "borrowCap"
  | "vTokenReceiver"
  | "reduceReservesBlockDelta";

export type SpokeVTokenConfig = Omit<VTokenConfig, MarketListingParameter> &
  Partial<Pick<VTokenConfig, MarketListingParameter>>;

export type SpokePoolConfig = Omit<PoolConfig, "vtokens" | PoolListingParameter> &
  Partial<Pick<PoolConfig, PoolListingParameter>> & { vtokens: SpokeVTokenConfig[] };

// On `hardhat` and `bsctestnet`, risk parameters copy the isolated pools' Stablecoins pool on `bsctestnet`: its
// pool-wide values, and for every market the rate curve, collateral factor, liquidation threshold, reserve factor and
// caps of its `vUSDT_Stablecoins` market, with the caps scaled to each token's decimals. The spoke pool can restrict who
// may supply and who may liquidate, not who may borrow; it does not take more risk per market, so there is no reason
// for these to differ from the isolated stablecoin markets.
//
// On `bscmainnet` they are the listing parameters of the "bStock index" pool. The "bStock mainstream" and "BPN Loan"
// pools set only what deployment needs, and their listing VIPs set the rest.

// Receives the seed vTokens `addMarket` mints, so the seed can never be redeemed.
const SEED_RECEIVER = "0x000000000000000000000000000000000000dEaD";

// A second pool on the hardhat network, so the deployment tests cover more than one pool behind the shared beacons.
const HARDHAT_SECOND_POOL_ID = "HubSpokeSecond";
const HARDHAT_SECOND_POOL: SpokePoolConfig = {
  id: HARDHAT_SECOND_POOL_ID,
  name: "Hub-funded spoke, second",
  closeFactor: convertToUnit("0.5", 18),
  liquidationIncentive: convertToUnit("1.1", 18),
  minLiquidatableCollateral: convertToUnit("100", 18),
  vtokens: [
    {
      name: "Venus USDT (Hub-funded spoke, second)",
      asset: "USDT",
      symbol: `vUSDT_${HARDHAT_SECOND_POOL_ID}`,
      rateModel: InterestRateModels.JumpRate.toString(),
      baseRatePerYear: convertToUnit("0", 18),
      multiplierPerYear: convertToUnit("0.1", 18),
      jumpMultiplierPerYear: convertToUnit("2.5", 18),
      kink_: convertToUnit("0.8", 18),
      reserveFactor: convertToUnit("0.1", 18),
    },
  ],
};

// The second `bscmainnet` pool. The id is the name in camel case, as `bStockIndex` is for the first pool. Each vToken
// symbol ends in the id and each vToken name in the name, and neither can change once `028` deploys the market.
const BSTOCK_MAINSTREAM_ID = "bStockMainstream";
const BSTOCK_MAINSTREAM_NAME = "bStock mainstream";

// The bStock index pool's curves, so `028` reuses the rate models already deployed for them.
const LIQUIDITY_RATE_MODEL = {
  rateModel: InterestRateModels.JumpRate.toString(),
  baseRatePerYear: "14888916156458044",
  multiplierPerYear: "37459988156559232",
  jumpMultiplierPerYear: "998472797360528128",
  kink_: convertToUnit("0.9", 18),
};
const COLLATERAL_RATE_MODEL = {
  rateModel: InterestRateModels.WhitePaper.toString(),
  baseRatePerYear: "0",
  multiplierPerYear: "0",
  jumpMultiplierPerYear: "0",
  kink_: "0",
};

const spokeMarket =
  (poolId: string, poolName: string) =>
  (asset: string, rateModel: typeof LIQUIDITY_RATE_MODEL): SpokeVTokenConfig => ({
    name: `Venus ${asset} (${poolName})`,
    asset,
    symbol: `v${asset}_${poolId}`,
    ...rateModel,
    reserveFactor: convertToUnit("0.1", 18),
  });

const bStockMainstreamMarket = spokeMarket(BSTOCK_MAINSTREAM_ID, BSTOCK_MAINSTREAM_NAME);

const BSTOCK_MAINSTREAM: SpokePoolConfig = {
  id: BSTOCK_MAINSTREAM_ID,
  name: BSTOCK_MAINSTREAM_NAME,
  vtokens: [
    // Liquidity side: supplied only by each Hub's Spoke source, borrowable, and never collateral.
    ...["USDT", "USDC", "U"].map(asset => bStockMainstreamMarket(asset, LIQUIDITY_RATE_MODEL)),
    // Collateral side, with a zero-rate model since these markets are not borrowable. BNCB is left out until Atlas has
    // a feed for it.
    ...[
      "NVDAB",
      "TSLAB",
      "SPCXB",
      "SKHYB",
      "CRCLB",
      "GOOGLB",
      "AAPLB",
      "MSTRB",
      "SNDKB",
      "METAB",
      "MSFTB",
      "NBISB",
      "BEB",
      "AMDB",
      "MRNAB",
      "MUB",
      "INTCB",
      "DRAMB",
      "TSMB",
      "COINB",
    ].map(asset => bStockMainstreamMarket(asset, COLLATERAL_RATE_MODEL)),
  ],
};

// The third `bscmainnet` pool, named the same way, and listed by VIP-678.
const BPN_LOAN_ID = "BPNLoan";
const BPN_LOAN_NAME = "BPN Loan";

// A flat 6% APY at any utilization: the base is 6% compounded daily, `(1.06^(1/365) - 1) * 365`, with no slope, no
// jump and the kink at 100%.
const FLAT_6_PERCENT_RATE_MODEL = {
  rateModel: InterestRateModels.JumpRate.toString(),
  baseRatePerYear: "58273559420325816",
  multiplierPerYear: "0",
  jumpMultiplierPerYear: "0",
  kink_: convertToUnit("1", 18),
};

const bpnLoanMarket = spokeMarket(BPN_LOAN_ID, BPN_LOAN_NAME);

const BPN_LOAN: SpokePoolConfig = {
  id: BPN_LOAN_ID,
  name: BPN_LOAN_NAME,
  vtokens: [
    // Collateral side: supplied only by its allowlist and not borrowable, so it takes the zero-rate model.
    bpnLoanMarket("BPNC", COLLATERAL_RATE_MODEL),
    // Liquidity side: supplied only by each Hub's Spoke source, borrowable, and never collateral.
    ...["USDT", "USDC", "U"].map(asset => bpnLoanMarket(asset, FLAT_6_PERCENT_RATE_MODEL)),
  ],
};

export const spokePoolConfig: Record<string, SpokePoolConfig[]> = {
  hardhat: [
    {
      id: SPOKE_POOL_ID,
      name: "Hub-funded spoke",
      closeFactor: convertToUnit("0.5", 18),
      liquidationIncentive: convertToUnit("1.1", 18),
      minLiquidatableCollateral: convertToUnit("100", 18),
      vtokens: [
        {
          name: "Venus USDT (Hub-funded spoke)",
          asset: "USDT",
          symbol: `vUSDT_${SPOKE_POOL_ID}`,
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: convertToUnit("0", 18),
          multiplierPerYear: convertToUnit("0.1", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.8", 18),
          liquidationThreshold: convertToUnit("0.88", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(10_000, 18),
          supplyCap: convertToUnit(1_000_000, 18),
          borrowCap: convertToUnit(400_000, 18),
          vTokenReceiver: "account:deployer",
          reduceReservesBlockDelta: "100",
        },
        {
          name: "Venus USDD (Hub-funded spoke)",
          asset: "USDD",
          symbol: `vUSDD_${SPOKE_POOL_ID}`,
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: convertToUnit("0", 18),
          multiplierPerYear: convertToUnit("0.1", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.8", 18),
          liquidationThreshold: convertToUnit("0.88", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(10_000, 18),
          supplyCap: convertToUnit(1_000_000, 18),
          borrowCap: convertToUnit(400_000, 18),
          vTokenReceiver: "account:deployer",
          reduceReservesBlockDelta: "100",
        },
      ],
    },
    HARDHAT_SECOND_POOL,
  ],
  bsctestnet: [
    {
      id: SPOKE_POOL_ID,
      name: "Hub-funded spoke",
      closeFactor: convertToUnit("0.5", 18),
      liquidationIncentive: convertToUnit("1.1", 18),
      minLiquidatableCollateral: convertToUnit("100", 18),
      vtokens: [
        {
          name: "Venus USDT (Hub-funded spoke)",
          asset: "USDT",
          symbol: `vUSDT_${SPOKE_POOL_ID}`,
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: convertToUnit("0", 18),
          multiplierPerYear: convertToUnit("0.1", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.8", 18),
          liquidationThreshold: convertToUnit("0.88", 18),
          reserveFactor: convertToUnit("0.1", 18),
          // Both testnet stablecoins carry 6 decimals, so the amounts below are 1e6 scaled, as the isolated Stablecoins
          // pool has them on this network.
          initialSupply: convertToUnit(10_000, 6),
          supplyCap: convertToUnit(1_000_000, 6),
          borrowCap: convertToUnit(400_000, 6),
          vTokenReceiver: preconfiguredAddresses.bsctestnet.VTreasury,
          reduceReservesBlockDelta: "100",
        },
        {
          name: "Venus USDC (Hub-funded spoke)",
          asset: "USDC",
          symbol: `vUSDC_${SPOKE_POOL_ID}`,
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: convertToUnit("0", 18),
          multiplierPerYear: convertToUnit("0.1", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.8", 18),
          liquidationThreshold: convertToUnit("0.88", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(10_000, 6),
          supplyCap: convertToUnit(1_000_000, 6),
          borrowCap: convertToUnit(400_000, 6),
          vTokenReceiver: preconfiguredAddresses.bsctestnet.VTreasury,
          reduceReservesBlockDelta: "100",
        },
      ],
    },
  ],
  bscmainnet: [
    {
      id: SPOKE_POOL_ID,
      name: "bStock index",
      closeFactor: convertToUnit("0.5", 18),
      liquidationIncentive: convertToUnit("1.1", 18),
      minLiquidatableCollateral: convertToUnit("100", 18),
      // All five underlyings carry 18 decimals, so every amount below is 1e18 scaled.
      vtokens: [
        // Liquidity side: supplied only by each Hub's Spoke source, borrowable, and never collateral.
        {
          name: "Venus USDT (bStock index)",
          asset: "USDT",
          symbol: "vUSDT_bStockIndex",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "14888916156458044",
          multiplierPerYear: "37459988156559232",
          jumpMultiplierPerYear: "998472797360528128",
          kink_: convertToUnit("0.9", 18),
          collateralFactor: "0",
          liquidationThreshold: "0",
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(10, 18),
          supplyCap: convertToUnit(5_000_000, 18),
          borrowCap: convertToUnit(5_000_000, 18),
          vTokenReceiver: SEED_RECEIVER,
          reduceReservesBlockDelta: "28800",
        },
        {
          name: "Venus USDC (bStock index)",
          asset: "USDC",
          symbol: "vUSDC_bStockIndex",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "14888916156458044",
          multiplierPerYear: "37459988156559232",
          jumpMultiplierPerYear: "998472797360528128",
          kink_: convertToUnit("0.9", 18),
          collateralFactor: "0",
          liquidationThreshold: "0",
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(10, 18),
          supplyCap: convertToUnit(5_000_000, 18),
          borrowCap: convertToUnit(5_000_000, 18),
          vTokenReceiver: SEED_RECEIVER,
          reduceReservesBlockDelta: "28800",
        },
        {
          name: "Venus U (bStock index)",
          asset: "U",
          symbol: "vU_bStockIndex",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "14888916156458044",
          multiplierPerYear: "37459988156559232",
          jumpMultiplierPerYear: "998472797360528128",
          kink_: convertToUnit("0.9", 18),
          collateralFactor: "0",
          liquidationThreshold: "0",
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(10, 18),
          supplyCap: convertToUnit(5_000_000, 18),
          borrowCap: convertToUnit(5_000_000, 18),
          vTokenReceiver: SEED_RECEIVER,
          reduceReservesBlockDelta: "28800",
        },
        // Collateral side: open to any supplier and not borrowable, through a 0 borrow cap and BORROW paused by the
        // listing VIP. With nothing to borrow there is no interest to charge, hence a zero-rate model.
        //
        // The seed is $10 of each, converted at the price when the listing VIP is proposed. The VIP carries that
        // amount; `028-deploy-spoke-vtokens.ts` does not read `initialSupply`.
        {
          name: "Venus QQQB (bStock index)",
          asset: "QQQB",
          symbol: "vQQQB_bStockIndex",
          rateModel: InterestRateModels.WhitePaper.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: "0",
          jumpMultiplierPerYear: "0",
          kink_: "0",
          collateralFactor: convertToUnit("0.8", 18),
          liquidationThreshold: convertToUnit("0.85", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: "0",
          supplyCap: convertToUnit(10_000, 18),
          borrowCap: "0",
          vTokenReceiver: SEED_RECEIVER,
          reduceReservesBlockDelta: "28800",
        },
        {
          name: "Venus SPYB (bStock index)",
          asset: "SPYB",
          symbol: "vSPYB_bStockIndex",
          rateModel: InterestRateModels.WhitePaper.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: "0",
          jumpMultiplierPerYear: "0",
          kink_: "0",
          collateralFactor: convertToUnit("0.8", 18),
          liquidationThreshold: convertToUnit("0.85", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: "0",
          supplyCap: convertToUnit(10_000, 18),
          borrowCap: "0",
          vTokenReceiver: SEED_RECEIVER,
          reduceReservesBlockDelta: "28800",
        },
      ],
    },
    BSTOCK_MAINSTREAM,
    BPN_LOAN,
  ],
};

// A network with no entry has no spoke pool, which is the normal case: the deploy scripts log it rather than failing,
// so `--tags HubSpoke` stays runnable everywhere.
export const getSpokePoolConfigs = (networkName: string): SpokePoolConfig[] => spokePoolConfig[networkName] ?? [];

// The `maxLoopsLimit` `025-deploy-spoke-comptroller.ts` initializes the comptroller with. It caps how many markets the
// pool can list, and so how many one account can enter, and every liquidation path walks all of them. Measured on a
// bscmainnet fork, `liquidateAccount` reaches the 2^24 per-transaction gas cap at about 59 entered markets when every
// market has borrows, and at about 94 when they are collateral-only. `setMaxLoopsLimit` can only raise the limit, so
// measure again before raising it.
const SPOKE_MAX_LOOPS_LIMIT = 50;

// Networks whose comptroller was initialized before the limit above was set. The deploy script reads the live value
// back and stops on a mismatch, and the limit cannot be lowered, so these record what is deployed.
const deployedSpokeMaxLoopsLimit: Record<string, number> = {
  bsctestnet: 100,
};

export const getSpokeMaxLoopsLimit = (networkName: string): number =>
  deployedSpokeMaxLoopsLimit[networkName] ?? SPOKE_MAX_LOOPS_LIMIT;

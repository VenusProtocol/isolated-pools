import { InterestRateModels } from "./deploymentConfig";
import { RateModelConfig } from "./rateModelHelpers";
import { convertToUnit } from "./utils";

// Deployment input for the hub-funded spoke pools: `025-deploy-spoke-comptroller.ts` deploys one comptroller per pool
// and `028-deploy-spoke-vtokens.ts` one market per entry in `markets`. It lives apart from `deploymentConfig.ts` because
// the isolated-pool scripts deploy every pool listed there behind their shared beacons. Risk parameters such as caps,
// collateral factors and seeds are not deployment input; the listing VIP sets them.
//
// To add a pool, append it to its network's list below. Its comptroller is recorded as `Comptroller_<id>` and each
// market as `VToken_v<asset>_<id>`, named `Venus <asset> (<name>)`. A market's name and symbol are on-chain and cannot
// change once `028` has deployed it.

// `028` names each rate model after its curve, so markets on the same curve share one deployed model.

// Copied from `vUSDT_Stablecoins` in the isolated Stablecoins pool on bsctestnet.
const TESTNET_STABLECOIN_RATE: RateModelConfig = {
  rateModel: InterestRateModels.JumpRate.toString(),
  baseRatePerYear: "0",
  multiplierPerYear: convertToUnit("0.1", 18),
  jumpMultiplierPerYear: convertToUnit("2.5", 18),
  kink_: convertToUnit("0.8", 18),
};

const BSTOCK_LIQUIDITY_RATE: RateModelConfig = {
  rateModel: InterestRateModels.JumpRate.toString(),
  baseRatePerYear: "14888916156458044",
  multiplierPerYear: "37459988156559232",
  jumpMultiplierPerYear: "998472797360528128",
  kink_: convertToUnit("0.9", 18),
};

// A flat 6% APY at any utilization: the base is 6% compounded daily, `(1.06^(1/365) - 1) * 365`.
const FLAT_6_PERCENT_RATE: RateModelConfig = {
  rateModel: InterestRateModels.JumpRate.toString(),
  baseRatePerYear: "58273559420325816",
  multiplierPerYear: "0",
  jumpMultiplierPerYear: "0",
  kink_: convertToUnit("1", 18),
};

// For collateral-only markets: nothing is borrowed, so there is no interest to charge.
const ZERO_RATE: RateModelConfig = {
  rateModel: InterestRateModels.WhitePaper.toString(),
  baseRatePerYear: "0",
  multiplierPerYear: "0",
  jumpMultiplierPerYear: "0",
  kink_: "0",
};

type SpokePool = {
  id: string;
  name: string;
  // Replaces `id` in the market symbols. Only the first bscmainnet pool needs it: its comptroller record was named
  // before the pool was.
  symbolSuffix?: string;
  markets: { asset: string; rateModel: RateModelConfig }[];
};

const spokePools: Record<string, SpokePool[]> = {
  // Two pools, so the deployment tests cover more than one pool behind the shared beacons.
  hardhat: [
    {
      id: "HubSpoke",
      name: "Hub-funded spoke",
      markets: [
        { asset: "USDT", rateModel: TESTNET_STABLECOIN_RATE },
        { asset: "USDD", rateModel: TESTNET_STABLECOIN_RATE },
      ],
    },
    {
      id: "HubSpokeSecond",
      name: "Hub-funded spoke, second",
      markets: [{ asset: "USDT", rateModel: TESTNET_STABLECOIN_RATE }],
    },
  ],
  bsctestnet: [
    {
      id: "HubSpoke",
      name: "Hub-funded spoke",
      markets: [
        { asset: "USDT", rateModel: TESTNET_STABLECOIN_RATE },
        { asset: "USDC", rateModel: TESTNET_STABLECOIN_RATE },
      ],
    },
  ],
  bscmainnet: [
    {
      id: "HubSpoke",
      symbolSuffix: "bStockIndex",
      name: "bStock index",
      markets: [
        { asset: "USDT", rateModel: BSTOCK_LIQUIDITY_RATE },
        { asset: "USDC", rateModel: BSTOCK_LIQUIDITY_RATE },
        { asset: "U", rateModel: BSTOCK_LIQUIDITY_RATE },
        { asset: "QQQB", rateModel: ZERO_RATE },
        { asset: "SPYB", rateModel: ZERO_RATE },
      ],
    },
    {
      id: "bStockMainstream",
      name: "bStock mainstream",
      // BNCB is left out until Atlas has a feed for it.
      markets: [
        { asset: "USDT", rateModel: BSTOCK_LIQUIDITY_RATE },
        { asset: "USDC", rateModel: BSTOCK_LIQUIDITY_RATE },
        { asset: "U", rateModel: BSTOCK_LIQUIDITY_RATE },
        { asset: "NVDAB", rateModel: ZERO_RATE },
        { asset: "TSLAB", rateModel: ZERO_RATE },
        { asset: "SPCXB", rateModel: ZERO_RATE },
        { asset: "SKHYB", rateModel: ZERO_RATE },
        { asset: "CRCLB", rateModel: ZERO_RATE },
        { asset: "GOOGLB", rateModel: ZERO_RATE },
        { asset: "AAPLB", rateModel: ZERO_RATE },
        { asset: "MSTRB", rateModel: ZERO_RATE },
        { asset: "SNDKB", rateModel: ZERO_RATE },
        { asset: "METAB", rateModel: ZERO_RATE },
        { asset: "MSFTB", rateModel: ZERO_RATE },
        { asset: "NBISB", rateModel: ZERO_RATE },
        { asset: "BEB", rateModel: ZERO_RATE },
        { asset: "AMDB", rateModel: ZERO_RATE },
        { asset: "MRNAB", rateModel: ZERO_RATE },
        { asset: "MUB", rateModel: ZERO_RATE },
        { asset: "INTCB", rateModel: ZERO_RATE },
        { asset: "DRAMB", rateModel: ZERO_RATE },
        { asset: "TSMB", rateModel: ZERO_RATE },
        { asset: "COINB", rateModel: ZERO_RATE },
      ],
    },
    {
      id: "BPNLoan",
      name: "BPN Loan",
      markets: [
        { asset: "BPNC", rateModel: ZERO_RATE },
        { asset: "USDT", rateModel: FLAT_6_PERCENT_RATE },
        { asset: "USDC", rateModel: FLAT_6_PERCENT_RATE },
        { asset: "U", rateModel: FLAT_6_PERCENT_RATE },
      ],
    },
  ],
};

// Every spoke market keeps 10% of its interest as reserves.
const RESERVE_FACTOR = convertToUnit("0.1", 18);

// A network's pools with each market's name and symbol filled in. A network with no entry has no spoke pool, and the
// deploy scripts skip it.
export const getSpokePoolConfigs = (networkName: string) =>
  (spokePools[networkName] ?? []).map(({ id, name, symbolSuffix = id, markets }) => ({
    id,
    vtokens: markets.map(({ asset, rateModel }) => ({
      name: `Venus ${asset} (${name})`,
      symbol: `v${asset}_${symbolSuffix}`,
      asset,
      reserveFactor: RESERVE_FACTOR,
      ...rateModel,
    })),
  }));

// The `maxLoopsLimit` each comptroller is initialized with. It caps how many markets a pool can list, and liquidation
// walks every market an account has entered: on a bscmainnet fork, `liquidateAccount` reaches the 2^24 gas cap at
// about 59 entered markets that all have borrows. The limit can only be raised, so measure again before raising it.
const SPOKE_MAX_LOOPS_LIMIT = 50;

// Comptrollers initialized before the limit above was set. `025` reads the live value back and stops on a mismatch.
const deployedSpokeMaxLoopsLimit: Record<string, number> = {
  bsctestnet: 100,
};

export const getSpokeMaxLoopsLimit = (networkName: string): number =>
  deployedSpokeMaxLoopsLimit[networkName] ?? SPOKE_MAX_LOOPS_LIMIT;

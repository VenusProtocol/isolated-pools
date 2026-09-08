import { InterestRateModels, PoolConfig, preconfiguredAddresses } from "./deploymentConfig";
import { convertToUnit } from "./utils";

// Market configuration for the hub-funded spoke pool, deliberately kept out of `deploymentConfig.ts`'s `globalConfig`.
// `008-deploy-comptrollers.ts` and `009-deploy-vtokens.ts` iterate every pool in that file, so a spoke entry there would
// be stood up behind the shared `ComptrollerBeacon` and `VTokenBeacon` and would claim these deployment names first.
// It is the same separation `024-deploy-spoke-pool-registry.ts` argues for on the registry side.
//
// The shape is the isolated pools' `PoolConfig`, so the parameters the listing VIP needs at `addPool` and `addMarket`
// time sit here next to the ones `028-deploy-spoke-vtokens.ts` reads. Spoke-only market state, the per-market
// liquidation threshold and incentive, the supply allowlist and forced liquidation, is set on `SpokeComptroller` after
// `addMarket` and is not deployment input.

// Names the pool in every per-pool deployment record: `Comptroller_HubSpoke` from `025-deploy-spoke-comptroller.ts`,
// and the `_HubSpoke` suffix each vToken symbol below carries. Deployment naming across the spoke scripts follows one
// rule: pool-wide singletons take a `Spoke` prefix (`SpokePoolRegistry`, `SpokeComptrollerImpl`, `SpokeVTokenBeacon`,
// `SpokePoolLens`), per-pool instances take this id as a suffix, exactly as the isolated pools distinguish
// `Comptroller_Stablecoins` from `VToken_vUSDT_Stablecoins`.
export const SPOKE_POOL_ID = "HubSpoke";

// Risk parameters mirror the isolated pools' Stablecoins pool on the same network. The spoke pool restricts who may
// supply, borrow and liquidate; it does not take more risk per market, so there is no reason for the curve, the
// collateral factor or the caps to differ from the isolated stablecoin markets they sit beside.
export const spokePoolConfig: Record<string, PoolConfig> = {
  hardhat: {
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
  bsctestnet: {
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
};

// A network with no entry has no spoke pool, which is the normal case: the deploy script logs and returns rather than
// failing, so `--tags HubSpoke` stays runnable everywhere.
export const getSpokePoolConfig = (networkName: string): PoolConfig | undefined => spokePoolConfig[networkName];

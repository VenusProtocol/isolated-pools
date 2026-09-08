import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { InterestRateModels, getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import {
  getBlockOrTimestampBasedDeploymentInfo,
  sameAddress,
  toAddress,
  verifyDeployment,
} from "../helpers/deploymentUtils";
import { getRateModelName, getRateModelParams } from "../helpers/rateModelHelpers";
import { getSpokePoolConfig } from "../helpers/spokeDeploymentConfig";
import { AddressOne } from "../helpers/utils";

// The markets of the hub-funded spoke pool: one `BeaconProxy` per asset in front of `SpokeVTokenBeacon`, the beacon
// `027-deploy-spoke-vtoken-beacon.ts` deploys. Markets are their own script rather than part of that one because a
// beacon is deployed once per chain while markets are listed one at a time, and because `009-deploy-vtokens.ts` cannot
// be reused: it iterates `deploymentConfig.ts`'s `poolConfig` and points every market it builds at the shared
// `VTokenBeacon`. Which assets this pool lists, and with what risk parameters, is in `helpers/spokeDeploymentConfig.ts`.
//
// This script only builds the markets. Registering them is `SpokePoolRegistry.addMarket`, which is ACM gated and
// belongs to the listing VIP, in the order `024-deploy-spoke-pool-registry.ts` spells out: accept ownership, grant the
// roles, set both oracles, `addPool`, then `addMarket` per market. Until that runs these markets exist but no
// comptroller knows them, which is the same state `009-deploy-vtokens.ts` leaves the isolated markets in.
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = hre.getNetworkName();

  const spokePool = getSpokePoolConfig(networkName);
  if (!spokePool) {
    console.log(`No spoke pool configured for ${networkName}, skipping spoke market deployment`);
    return;
  }

  const { tokensConfig, preconfiguredAddresses } = await getConfig(networkName);
  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(networkName);

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager || "AccessControlManager");

  // Every market is minted from this beacon, never the chain's shared `VTokenBeacon`. `upgradeTo` moves every proxy
  // behind a beacon in one call, so a market on the shared one could only take a VToken change that every isolated
  // market on the chain takes with it, and the other way round.
  const spokeVTokenBeacon = await ethers.getContract("SpokeVTokenBeacon");
  // The deployment record carries the `BeaconProxy` ABI it was created with, so attach the implementation's ABI to the
  // proxy address to read pool state through it, as `025-deploy-spoke-comptroller.ts` does.
  const comptrollerProxy = await deployments.get(`Comptroller_${spokePool.id}`);
  const comptroller = await ethers.getContractAt("SpokeComptroller", comptrollerProxy.address);

  // The proxy is what the markets are initialized against and what the VIP later registers, so a market built against
  // some other pool's comptroller would be silently wrong. The implementation bakes the spoke registry in as an
  // immutable, so reading `poolRegistry` back is what proves this is the spoke pool and not an isolated one.
  const wiredPoolRegistry = await comptroller.poolRegistry();
  const spokePoolRegistry = await ethers.getContract("SpokePoolRegistry");
  if (!sameAddress(wiredPoolRegistry, spokePoolRegistry.address)) {
    throw new Error(
      `Comptroller_${spokePool.id} at ${comptroller.address} reads pool registry ${wiredPoolRegistry}, expected the ` +
        `SpokePoolRegistry at ${spokePoolRegistry.address}. Run 024 and 025 first.`,
    );
  }
  console.log(`Deploying ${spokePool.vtokens.length} market(s) for Comptroller_${spokePool.id} ${comptroller.address}`);

  // Both are the chain's live contracts, matching what the fork suite's listing model asserts of these markets. The
  // ProtocolShareReserve still resolves vTokens through a single pool registry, so `reduceReserves` on these markets
  // stays broken until that repo's multi-registry change is live, as `024-deploy-spoke-pool-registry.ts` notes.
  const protocolShareReserve = (await ethers.getContract("ProtocolShareReserve")).address;
  const shortfall = preconfiguredAddresses.Shortfall ? await toAddress(preconfiguredAddresses.Shortfall) : AddressOne;

  // `009-deploy-vtokens.ts` hands the isolated markets to the timelock at initialize time and leaves the deployer as
  // owner only where there is no timelock. Same rule here, so the markets need no ownership step of their own.
  const vTokenOwner =
    hre.network.live && preconfiguredAddresses.NormalTimelock
      ? await toAddress(preconfiguredAddresses.NormalTimelock)
      : deployer;
  console.log(`Markets will be owned by ${vTokenOwner}`);

  for (const vTokenConfig of spokePool.vtokens) {
    const { name, asset, symbol, reserveFactor } = vTokenConfig;

    const token = getTokenConfig(asset, tokensConfig);
    const underlying = token.isMock
      ? await ethers.getContract(`Mock${token.symbol}`)
      : await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", token.tokenAddress);

    // The rate model name is a pure function of the curve, so a market whose curve matches one already deployed on this
    // chain reuses that contract. That is the isolated pools' behaviour too, and it is deliberate: a rate curve is a
    // risk parameter the same team maintains across pools, not an axis this pool needs to be independent on.
    const rateModelParams = getRateModelParams(vTokenConfig);
    const rateModelName = getRateModelName(rateModelParams, { isTimeBased, blocksPerYear });
    let rateModelArgs: unknown[];
    let rateModelContract: string;
    if (rateModelParams.model === InterestRateModels.JumpRate) {
      rateModelContract = "JumpRateModelV2";
      rateModelArgs = [
        rateModelParams.baseRatePerYear,
        rateModelParams.multiplierPerYear,
        rateModelParams.jumpMultiplierPerYear,
        rateModelParams.kink,
        accessControlManager,
        isTimeBased,
        blocksPerYear,
      ];
    } else if (rateModelParams.model === InterestRateModels.WhitePaper) {
      rateModelContract = "WhitePaperInterestRateModel";
      rateModelArgs = [rateModelParams.baseRatePerYear, rateModelParams.multiplierPerYear, isTimeBased, blocksPerYear];
    } else if (rateModelParams.model === InterestRateModels.TwoKinks) {
      rateModelContract = "TwoKinksInterestRateModel";
      rateModelArgs = [
        rateModelParams.baseRatePerYear,
        rateModelParams.multiplierPerYear,
        rateModelParams.kink,
        rateModelParams.multiplierPerYear2,
        rateModelParams.baseRatePerYear2,
        rateModelParams.kink2,
        rateModelParams.jumpMultiplierPerYear,
        isTimeBased,
        blocksPerYear,
      ];
    } else {
      throw new Error(`Unreachable ${rateModelParams}`);
    }

    const rateModel: DeployResult = await deploy(rateModelName, {
      from: deployer,
      contract: rateModelContract,
      args: rateModelArgs,
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });
    await verifyDeployment(hre, rateModelName, rateModel, rateModelArgs);

    const underlyingDecimals = Number(await underlying.decimals());
    const vTokenDecimals = 8;
    const initArgs = [
      underlying.address,
      comptroller.address,
      rateModel.address,
      // 10 ** (18 + underlyingDecimals - vTokenDecimals), the rate every live isolated market is listed at.
      parseUnits("1", 18 + underlyingDecimals - vTokenDecimals),
      name,
      symbol,
      vTokenDecimals,
      vTokenOwner,
      accessControlManager,
      [shortfall, protocolShareReserve],
      reserveFactor,
    ];

    // `VToken_<symbol>` as the isolated markets use, where the symbol carries the pool id as its suffix. That suffix is
    // what tells `VToken_vUSDT_HubSpoke` from `VToken_vUSDT_Stablecoins`, the same way `Comptroller_HubSpoke` is told
    // from `Comptroller_Stablecoins`. The `Spoke` prefix is reserved for the pool-wide singletons.
    const args = [
      spokeVTokenBeacon.address,
      (await ethers.getContractFactory("VToken")).interface.encodeFunctionData("initialize", initArgs),
    ];
    const market: DeployResult = await deploy(`VToken_${symbol}`, {
      from: deployer,
      contract: "BeaconProxy",
      args,
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });

    // A market built against the wrong beacon or comptroller cannot be repointed, only redeployed, and by the time the
    // VIP calls `addMarket` it is governance's problem. Read both back off the chain now.
    const vToken = await ethers.getContractAt("VToken", market.address);
    const checks: [string, string, string][] = [
      [`${symbol} comptroller`, await vToken.comptroller(), comptroller.address],
      [`${symbol} underlying`, await vToken.underlying(), underlying.address],
      [`${symbol} interest rate model`, await vToken.interestRateModel(), rateModel.address],
    ];
    for (const [label, actual, expected] of checks) {
      if (!sameAddress(actual, expected)) {
        throw new Error(`${label} is ${actual}, expected ${expected}`);
      }
    }
    console.log(`Verified ${symbol} at ${market.address}: comptroller, underlying and rate model`);

    await verifyDeployment(hre, `VToken_${symbol}`, market, args);
    console.log(`-----------------------------------------`);
  }

  // What the listing VIP still owes these markets, beyond `addMarket`: the spoke-only state lives on
  // `SpokeComptroller`, not on the vToken, so each market needs its liquidation threshold and, where it differs from
  // the pool default, its own liquidation incentive, plus the supply allowlist entries this pool restricts supply with.
};

func.tags = ["HubSpokeVTokens", "HubSpoke"];
// Tag-selected runs skip everything not tagged, so the comptroller and the beacon these markets are built from have to
// be named rather than left to the file ordering a full run relies on.
func.dependencies = ["HubSpokeComptroller", "HubSpokeVTokenBeacon"];

export default func;

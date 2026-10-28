import { expect } from "chai";
import hre, { artifacts, deployments, ethers, getNamedAccounts } from "hardhat";

import deploySpokeComptroller from "../../../deploy/025-deploy-spoke-comptroller";
import {
  deployUnlessOnlyMetadataChanged,
  getBlockOrTimestampBasedDeploymentInfo,
} from "../../../helpers/deploymentUtils";
import { getRateModelName, getRateModelParams } from "../../../helpers/rateModelHelpers";
import { getSpokePoolConfigs } from "../../../helpers/spokeDeploymentConfig";

const EIP_170_LIMIT = 24576;
const BEACON_ABI = ["function implementation() view returns (address)", "function owner() view returns (address)"];

// `bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)`, where a `BeaconProxy` keeps the beacon it delegates to.
// There is no getter for it, and it is the only place the proxy records which beacon it will follow through upgrades.
const EIP_1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

// The pools and markets the deploy scripts build on this network. `009-deploy-vtokens.ts` never sees these, which is
// why they live outside `deploymentConfig.ts`.
const spokePools = getSpokePoolConfigs("hardhat");
const spokeMarkets = spokePools.flatMap(({ id, vtokens }) => vtokens.map(config => ({ poolId: id, config })));
const timeManagerParams = getBlockOrTimestampBasedDeploymentInfo("hardhat");

async function spokeComptroller() {
  return ethers.getContractAt("SpokeComptroller", (await deployments.get("Comptroller_HubSpoke")).address);
}

describe("SpokeComptroller: deployment", function () {
  // The hardhat-deploy fixture stands up the whole isolated-pools deployment, which runs well past mocha's 40s
  // default when the full suite shares the process. Same allowance the integration suite uses.
  this.timeout(500000);

  before(async () => {
    await deployments.fixture(["MockTokens", "OracleDeploy", "Oracle", "il", "HubSpoke"]);
  });

  it("wires the spoke to its own beacon and leaves the shared one alone", async () => {
    const spokeBeacon = await ethers.getContractAt(
      BEACON_ABI,
      (
        await deployments.get("SpokeComptrollerBeacon")
      ).address,
    );
    const sharedBeacon = await ethers.getContractAt(BEACON_ABI, (await deployments.get("ComptrollerBeacon")).address);

    const spokeImpl = (await deployments.get("SpokeComptrollerImpl")).address;
    const sharedImpl = (await deployments.get("ComptrollerImpl")).address;

    const proxy = (await deployments.get("Comptroller_HubSpoke")).address;
    const slot = await ethers.provider.getStorageAt(proxy, EIP_1967_BEACON_SLOT);
    expect(ethers.utils.getAddress(ethers.utils.hexDataSlice(slot, 12))).to.equal(spokeBeacon.address);
    expect(await spokeBeacon.implementation()).to.equal(spokeImpl);
    // The shared beacon every other pool in this repo upgrades through must be untouched.
    expect(await sharedBeacon.implementation()).to.equal(sharedImpl);
    expect(spokeImpl).to.not.equal(sharedImpl);
    expect(spokeBeacon.address).to.not.equal(sharedBeacon.address);
  });

  it("deploys a comptroller for every configured pool behind the one spoke beacon", async () => {
    const spokeBeacon = (await deployments.get("SpokeComptrollerBeacon")).address;
    const spokeRegistry = (await deployments.get("SpokePoolRegistry")).address;

    expect(spokePools.length, "the hardhat config should cover more than one pool").to.be.greaterThan(1);
    const proxies = new Set<string>();
    for (const { id } of spokePools) {
      const proxy = (await deployments.get(`Comptroller_${id}`)).address;
      const slot = await ethers.provider.getStorageAt(proxy, EIP_1967_BEACON_SLOT);
      expect(ethers.utils.getAddress(ethers.utils.hexDataSlice(slot, 12)), `${id} beacon`).to.equal(spokeBeacon);
      expect(await (await ethers.getContractAt("SpokeComptroller", proxy)).poolRegistry()).to.equal(spokeRegistry);
      proxies.add(proxy);
    }
    expect(proxies.size).to.equal(spokePools.length);
  });

  it("gives the spoke markets a VToken beacon of their own", async () => {
    const spokeBeacon = await ethers.getContractAt(BEACON_ABI, (await deployments.get("SpokeVTokenBeacon")).address);
    const sharedBeacon = await ethers.getContractAt(BEACON_ABI, (await deployments.get("VTokenBeacon")).address);

    const spokeImpl = (await deployments.get("SpokeVTokenImpl")).address;
    const sharedImpl = (await deployments.get("VTokenImpl")).address;

    expect(await spokeBeacon.implementation()).to.equal(spokeImpl);
    // `upgradeTo` moves every proxy behind a beacon at once, so sharing this one would tie a VToken change for the
    // spoke pool to every isolated market on the chain, in both directions.
    expect(await sharedBeacon.implementation()).to.equal(sharedImpl);
    expect(spokeImpl).to.not.equal(sharedImpl);
    expect(spokeBeacon.address).to.not.equal(sharedBeacon.address);
  });

  it("hands the VToken beacon to the configured owner inside the deployment run", async () => {
    const { deployer } = await getNamedAccounts();
    const beacon = await ethers.getContractAt(BEACON_ABI, (await deployments.get("SpokeVTokenBeacon")).address);

    // `UpgradeableBeacon` is plain `Ownable`, so unlike the comptroller there is nothing left for the VIP to accept.
    // No timelock is configured on the hardhat network, so the deployer is the expected owner here.
    expect(await beacon.owner()).to.equal(deployer);
  });

  it("builds every configured market behind the spoke VToken beacon", async () => {
    const spokeBeacon = (await deployments.get("SpokeVTokenBeacon")).address;
    const sharedBeacon = (await deployments.get("VTokenBeacon")).address;

    expect(spokeMarkets, "no spoke markets configured for this network").to.not.have.lengthOf(0);
    for (const {
      poolId,
      config: { symbol },
    } of spokeMarkets) {
      const market = (await deployments.get(`VToken_${symbol}`)).address;
      const slot = await ethers.provider.getStorageAt(market, EIP_1967_BEACON_SLOT);
      const beacon = ethers.utils.getAddress(ethers.utils.hexDataSlice(slot, 12));

      // The whole point of 027 is decided here: a market on the shared beacon could only take a VToken change that
      // every isolated market on the chain takes with it, and the other way round.
      expect(beacon, `${symbol} beacon`).to.equal(spokeBeacon);
      expect(beacon, `${symbol} beacon`).to.not.equal(sharedBeacon);
      expect(await (await ethers.getContractAt("VToken", market)).comptroller()).to.equal(
        (await deployments.get(`Comptroller_${poolId}`)).address,
      );
    }
  });

  it("initializes each market with its configured token metadata and rate model", async () => {
    for (const { config } of spokeMarkets) {
      const market = await ethers.getContractAt("VToken", (await deployments.get(`VToken_${config.symbol}`)).address);

      expect(await market.name()).to.equal(config.name);
      expect(await market.symbol()).to.equal(config.symbol);
      expect(await market.decimals()).to.equal(8);
      expect(await market.reserveFactorMantissa()).to.equal(config.reserveFactor);

      // The rate model name is a pure function of the curve, so resolving it from the same config the script read is
      // what proves the market took the configured curve rather than whichever model happened to be deployed first.
      const rateModelName = getRateModelName(getRateModelParams(config), timeManagerParams);
      expect(await market.interestRateModel()).to.equal((await deployments.get(rateModelName)).address);
    }
  });

  it("binds the spoke to its own pool registry, not the isolated-pools one", async () => {
    // The registry is the directory every consumer iterates to answer "which pools exist". Sharing it would hand the
    // indexer, the frontend and the risk tooling a pool whose liquidity market only the Hub may supply.
    const spokeRegistry = (await deployments.get("SpokePoolRegistry")).address;
    const isolatedRegistry = (await deployments.get("PoolRegistry")).address;

    expect(spokeRegistry).to.not.equal(isolatedRegistry);
    expect(await (await spokeComptroller()).poolRegistry()).to.equal(spokeRegistry);

    // Same implementation, so the only thing keeping the two directories apart is that they are separate instances.
    const registry = await ethers.getContract("SpokePoolRegistry");
    expect(await registry.accessControlManager()).to.equal((await deployments.get("AccessControlManager")).address);
    expect(await registry.getAllPools()).to.have.lengthOf(0);
  });

  it("deploys each proxy as a SpokeComptroller, initialized, owned by the deployer", async () => {
    const { deployer } = await getNamedAccounts();

    for (const { id } of spokePools) {
      const comptroller = await ethers.getContractAt(
        "SpokeComptroller",
        (
          await deployments.get(`Comptroller_${id}`)
        ).address,
      );

      expect(await comptroller.poolRegistry()).to.equal((await deployments.get("SpokePoolRegistry")).address);
      expect(await comptroller.accessControlManager()).to.equal(
        (await deployments.get("AccessControlManager")).address,
      );
      expect(await comptroller.maxLoopsLimit()).to.equal(50);
      expect(await comptroller.owner(), `${id} owner`).to.equal(deployer);
      expect(await comptroller.pendingOwner(), `${id} pending owner`).to.equal(ethers.constants.AddressZero);

      // Spoke-only surface, which proves the proxy runs the fork rather than the shared implementation.
      expect(await comptroller.isLiquidationAllowlistEnabled()).to.equal(false);
      expect(await comptroller.deviationBoundedOracle()).to.equal(ethers.constants.AddressZero);
    }
  });

  it("leaves the pool unregistered and unconfigured, which is the listing VIP's job", async () => {
    const comptroller = await spokeComptroller();

    for (const name of ["SpokePoolRegistry", "PoolRegistry"]) {
      const registry = await ethers.getContract(name);
      const registered = (await registry.getAllPools()).map((p: { comptroller: string }) => p.comptroller);
      expect(registered, `${name} should not hold the spoke pool`).to.not.include(comptroller.address);
    }

    expect(await comptroller.oracle()).to.equal(ethers.constants.AddressZero);
    expect(await comptroller.closeFactorMantissa()).to.equal(0);
    expect(await comptroller.liquidationIncentiveMantissa()).to.equal(0);
    expect(await comptroller.minLiquidatableCollateral()).to.equal(0);
    expect((await comptroller.getAllMarkets()).length).to.equal(0);
  });

  it("answers borrowing-power reads for an account in no markets", async () => {
    const comptroller = await spokeComptroller();
    const { deployer } = await getNamedAccounts();

    // Nothing is entered, so the snapshot loop never runs and never reaches the unset bounded oracle. The
    // fail-closed guarantee comes from the per-market price read, not from a check on the oracle address, and this
    // documents that listing a market is what makes the oracle mandatory.
    const [, liquidity, shortfall] = await comptroller.getBorrowingPower(deployer);
    expect(liquidity).to.equal(0);
    expect(shortfall).to.equal(0);
  });

  it("refuses to hand over a comptroller proxy that follows another beacon", async () => {
    // `skipIfAlreadyDeployed` hands back a recorded proxy without comparing its constructor arguments. This one follows
    // a second beacon over the same implementation and is initialized the same way, so reading the beacon off the
    // chain is the only check in 025 that can tell it apart.
    const recorded = await deployments.get("Comptroller_HubSpoke");
    const otherBeacon = await (
      await ethers.getContractFactory("UpgradeableBeacon")
    ).deploy((await deployments.get("SpokeComptrollerImpl")).address);
    const initData = (await ethers.getContractFactory("SpokeComptroller")).interface.encodeFunctionData("initialize", [
      100,
      (await deployments.get("AccessControlManager")).address,
    ]);
    const proxy = await (await ethers.getContractFactory("BeaconProxy")).deploy(otherBeacon.address, initData);

    await deployments.save("Comptroller_HubSpoke", { abi: recorded.abi, address: proxy.address });
    try {
      await expect(deploySpokeComptroller(hre)).to.be.rejectedWith(
        "Refusing to transfer ownership: comptroller beacon",
      );
    } finally {
      await deployments.save("Comptroller_HubSpoke", recorded);
    }
  });

  it("reuses an implementation whose build differs only in its metadata hash", async () => {
    // An edit to a file the contract only imports changes the metadata hash and nothing else. Simulate a deployment
    // built before such an edit: the same code with one byte of the hash flipped, behind the beacon.
    const { deployer } = await getNamedAccounts();
    const recorded = await deployments.get("SpokeComptrollerImpl");
    const artifact = await deployments.getArtifact("SpokeComptroller");
    const metadataStart = artifact.bytecode.length - (parseInt(artifact.bytecode.slice(-4), 16) + 2) * 2;
    // Past the CBOR map header and the `ipfs` key, inside the 34-byte hash itself.
    const flipAt = metadataStart + 30;
    const flipped = artifact.bytecode[flipAt] === "0" ? "1" : "0";
    const bytecode = artifact.bytecode.slice(0, flipAt) + flipped + artifact.bytecode.slice(flipAt + 1);
    const signer = await ethers.getSigner(deployer);
    const earlier = await new ethers.ContractFactory(artifact.abi, bytecode, signer).deploy(...(recorded.args ?? []));
    await earlier.deployed();

    const beacon = await ethers.getContractAt(
      "UpgradeableBeacon",
      (
        await deployments.get("SpokeComptrollerBeacon")
      ).address,
    );
    await beacon.upgradeTo(earlier.address);
    await deployments.save("SpokeComptrollerImpl", {
      abi: artifact.abi,
      address: earlier.address,
      bytecode,
      args: recorded.args,
      transactionHash: earlier.deployTransaction.hash,
    });
    try {
      // hardhat-deploy on its own would redeploy, which is what the script must not do here.
      const { differences } = await deployments.fetchIfDifferent("SpokeComptrollerImpl", {
        contract: "SpokeComptroller",
        from: deployer,
        args: recorded.args,
      });
      expect(differences).to.equal(true);

      await deploySpokeComptroller(hre);
      expect((await deployments.get("SpokeComptrollerImpl")).address).to.equal(earlier.address);
      expect(await beacon.implementation()).to.equal(earlier.address);
    } finally {
      await beacon.upgradeTo(recorded.address);
      await deployments.save("SpokeComptrollerImpl", recorded);
    }
  });

  describe("deployUnlessOnlyMetadataChanged", () => {
    const PROBE = "MetadataReuseProbe";
    const rateModelArgs = (baseRatePerYear: number) => [baseRatePerYear, 0, false, 10_512_000];

    afterEach(async () => {
      await deployments.delete(PROBE);
    });

    it("redeploys when the constructor arguments differ", async () => {
      const { deployer } = await getNamedAccounts();
      const options = { contract: "WhitePaperInterestRateModel", from: deployer };
      const first = await deployUnlessOnlyMetadataChanged(hre, PROBE, { ...options, args: rateModelArgs(0) });
      const second = await deployUnlessOnlyMetadataChanged(hre, PROBE, { ...options, args: rateModelArgs(1) });

      expect(second.newlyDeployed).to.equal(true);
      expect(second.address).to.not.equal(first.address);
    });

    it("redeploys when the code differs, constructor included", async () => {
      // The recorded arguments do not fit the new constructor, so they must not be encoded against it.
      const { deployer } = await getNamedAccounts();
      const first = await deployUnlessOnlyMetadataChanged(hre, PROBE, {
        contract: "WhitePaperInterestRateModel",
        from: deployer,
        args: rateModelArgs(0),
      });
      const second = await deployUnlessOnlyMetadataChanged(hre, PROBE, {
        contract: "MockToken",
        from: deployer,
        args: ["Probe", "PRB", 18],
      });

      expect(second.newlyDeployed).to.equal(true);
      expect(second.address).to.not.equal(first.address);
    });
  });

  describe("contract size", () => {
    // Two traps make this awkward to assert. The hardhat network sets `allowUnlimitedContractSize`, so an oversized
    // contract deploys without complaint and the check has to read the artifact instead. And hardhat.config.ts sets
    // the optimizer's `details.yul` to `!process.env.CI`, so a CI build produces roughly 1.1 KB more bytecode than
    // a production build and would fail this on perfectly good code. The assertion therefore only runs when the Yul
    // optimizer is on, which is the setting production deploys use.
    //
    // This is a backstop, not the real gate. A size check that runs under production settings belongs in CI.
    const yulEnabled = !process.env.CI;

    it("keeps SpokeComptroller under the EIP-170 limit under production optimizer settings", async function () {
      if (!yulEnabled) {
        this.skip();
      }
      const { deployedBytecode } = await artifacts.readArtifact("SpokeComptroller");
      const size = (deployedBytecode.length - 2) / 2;

      expect(size, `SpokeComptroller is ${size} bytes, ${size - EIP_170_LIMIT} over the limit`).to.be.at.most(
        EIP_170_LIMIT,
      );
    });

    it("does not push the shared Comptroller over the limit either", async function () {
      if (!yulEnabled) {
        this.skip();
      }
      // The per-contract optimizer override in hardhat.config.ts applies to SpokeComptroller only. If it ever
      // leaked to the shared implementation this would catch the regression.
      const { deployedBytecode } = await artifacts.readArtifact("Comptroller");
      const size = (deployedBytecode.length - 2) / 2;

      expect(size).to.be.at.most(EIP_170_LIMIT);
    });
  });
});

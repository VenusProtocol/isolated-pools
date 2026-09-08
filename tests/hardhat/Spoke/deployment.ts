import { expect } from "chai";
import { artifacts, deployments, ethers, getNamedAccounts } from "hardhat";

const EIP_170_LIMIT = 24576;
const BEACON_ABI = ["function implementation() view returns (address)", "function owner() view returns (address)"];

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

    expect(await spokeBeacon.implementation()).to.equal(spokeImpl);
    // The shared beacon every other pool in this repo upgrades through must be untouched.
    expect(await sharedBeacon.implementation()).to.equal(sharedImpl);
    expect(spokeImpl).to.not.equal(sharedImpl);
    expect(spokeBeacon.address).to.not.equal(sharedBeacon.address);
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

  it("binds the spoke to its own pool registry, not the isolated-pools one", async () => {
    // The registry is the directory every consumer iterates to answer "which pools exist". Sharing it would hand the
    // indexer, the frontend and the risk tooling a pool whose supply, borrow and liquidation sides are all restricted.
    const spokeRegistry = (await deployments.get("SpokePoolRegistry")).address;
    const isolatedRegistry = (await deployments.get("PoolRegistry")).address;

    expect(spokeRegistry).to.not.equal(isolatedRegistry);
    expect(await (await spokeComptroller()).poolRegistry()).to.equal(spokeRegistry);

    // Same implementation, so the only thing keeping the two directories apart is that they are separate instances.
    const registry = await ethers.getContract("SpokePoolRegistry");
    expect(await registry.accessControlManager()).to.equal((await deployments.get("AccessControlManager")).address);
    expect(await registry.getAllPools()).to.have.lengthOf(0);
  });

  it("deploys the proxy as a SpokeComptroller, initialized, owned by the deployer", async () => {
    const { deployer } = await getNamedAccounts();
    const comptroller = await spokeComptroller();

    expect(await comptroller.poolRegistry()).to.equal((await deployments.get("SpokePoolRegistry")).address);
    expect(await comptroller.accessControlManager()).to.equal((await deployments.get("AccessControlManager")).address);
    expect(await comptroller.maxLoopsLimit()).to.equal(100);
    expect(await comptroller.owner()).to.equal(deployer);

    // Spoke-only surface, which proves the proxy runs the fork rather than the shared implementation.
    expect(await comptroller.isLiquidationAllowlistEnabled()).to.equal(false);
    expect(await comptroller.deviationBoundedOracle()).to.equal(ethers.constants.AddressZero);
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

import { expect } from "chai";
import { deployments, ethers, getNamedAccounts } from "hardhat";

import { setForkBlock } from "../utils";
import { bscmainnet } from "./constants";
import { BLOCK_NUMBER } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const EIP_170_LIMIT = 24_576;

/**
 * Runs the real `deploy/025-deploy-spoke-comptroller.ts` and `deploy/027-deploy-spoke-vtoken-beacon.ts`
 * against live bscmainnet, which is the only way to find out what they do with the addresses this chain
 * actually reports. The behavioural
 * suites deploy the same stack directly, because they need the pool in a listed and configured state
 * the script deliberately leaves to the listing VIP.
 */
if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: the deployment script against live bscmainnet", () => {
    let deployer: string;
    let scriptError: Error | undefined;

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
      ({ deployer } = await getNamedAccounts());
      try {
        await deployments.fixture(["HubSpokeComptroller", "HubSpokeVTokenBeacon"], {
          keepExistingDeployments: true,
        });
      } catch (e) {
        scriptError = e as Error;
      }
    });

    const deployed = async (name: string) => {
      const record = await deployments.getOrNull(name);
      if (record === null) throw new Error(`${name} was not deployed`);
      return record.address;
    };

    it("runs to completion", () => {
      // Regression guard for a defect this suite found. The script used to compare addresses as
      // strings, and `toAddress` returns whatever `preconfiguredAddresses` holds:
      // `@venusprotocol/governance-contracts` records the bscmainnet AccessControlManager in lower
      // case while the on-chain read returns it checksummed, so a pre-handover check rejected a
      // correct value and the script threw before either ownership transfer. Only a fork run
      // catches it, because the casing comes from the network's own deployments package.
      expect(scriptError?.message).to.equal(undefined);
    });

    it("deploys a pool registry of its own rather than reusing this chain's", async () => {
      // `getAllPools` on the live registry is what the indexer, the frontend pool list and the risk
      // tooling iterate. A hub-funded pool whose supply, borrow and liquidation sides are all
      // restricted does not belong in that directory, and once it is in there every one of those
      // consumers needs a special case keyed on its address.
      const registryAddress = await deployed("SpokePoolRegistry");
      expect(registryAddress).to.not.equal(bscmainnet.POOL_REGISTRY);

      const registry = await ethers.getContractAt("PoolRegistry", registryAddress);
      expect(await registry.accessControlManager()).to.equal(bscmainnet.ACM);
      expect(await registry.getAllPools()).to.have.lengthOf(0);

      // `Ownable2Step`, like the comptroller: the script can only nominate.
      expect(await registry.owner()).to.equal(deployer);
      expect(await registry.pendingOwner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
    });

    it("constructs the implementation with that registry, not the live one", async () => {
      // Immutable, so this is the one wiring decision no setter can walk back.
      const spoke = await ethers.getContractAt("SpokeComptroller", await deployed("SpokeComptrollerImpl"));
      expect(await spoke.poolRegistry()).to.equal(await deployed("SpokePoolRegistry"));
    });

    it("points its own beacon at that implementation, never the shared ComptrollerBeacon", async () => {
      const impl = await deployed("SpokeComptrollerImpl");
      const beacon = await ethers.getContractAt("UpgradeableBeacon", await deployed("SpokeComptrollerBeacon"));
      expect(beacon.address).to.not.equal(bscmainnet.COMPTROLLER_BEACON);
      expect(await beacon.implementation()).to.equal(impl);

      // Sharing the beacon would move every other isolated pool on this chain onto the spoke
      // implementation the moment either side was upgraded.
      const shared = await ethers.getContractAt("UpgradeableBeacon", bscmainnet.COMPTROLLER_BEACON);
      expect(await shared.implementation()).to.not.equal(impl);
    });

    it("initializes the proxy against the live ACM and leaves the pool unconfigured", async () => {
      const spoke = await ethers.getContractAt("SpokeComptroller", await deployed("Comptroller_HubSpoke"));
      expect(await spoke.accessControlManager()).to.equal(bscmainnet.ACM);
      expect(await spoke.maxLoopsLimit()).to.equal(100);
      // Everything the listing VIP owns is still unset, which is what makes the order of that VIP
      // load-bearing rather than cosmetic.
      expect(await spoke.oracle()).to.equal(ethers.constants.AddressZero);
      expect(await spoke.deviationBoundedOracle()).to.equal(ethers.constants.AddressZero);
      expect(await spoke.getAllMarkets()).to.have.lengthOf(0);
    });

    it("registers the pool in neither registry, which is the listing VIP's job", async () => {
      const comptroller = await deployed("Comptroller_HubSpoke");
      for (const registryAddress of [bscmainnet.POOL_REGISTRY, await deployed("SpokePoolRegistry")]) {
        const registry = await ethers.getContractAt("PoolRegistry", registryAddress);
        const pool = await registry.getPoolByComptroller(comptroller);
        expect(pool.comptroller, `registry ${registryAddress} should not hold the pool`).to.equal(
          ethers.constants.AddressZero,
        );
      }
    });

    it("points a VToken beacon of its own at a fresh implementation, never the shared VTokenBeacon", async () => {
      const impl = await deployed("SpokeVTokenImpl");
      const beacon = await ethers.getContractAt("UpgradeableBeacon", await deployed("SpokeVTokenBeacon"));
      expect(beacon.address).to.not.equal(bscmainnet.VTOKEN_BEACON);
      expect(await beacon.implementation()).to.equal(impl);

      // `upgradeTo` moves every proxy behind a beacon at once. Sharing this one would tie a VToken change
      // for the spoke pool to every isolated market on the chain, in both directions.
      const shared = await ethers.getContractAt("UpgradeableBeacon", bscmainnet.VTOKEN_BEACON);
      expect(await shared.implementation()).to.not.equal(impl);
    });

    it("hands the VToken beacon to the Normal Timelock inside the deployment transaction", async () => {
      const beacon = await ethers.getContractAt("UpgradeableBeacon", await deployed("SpokeVTokenBeacon"));
      expect(await beacon.owner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
    });

    it("hands the beacon to the Normal Timelock inside the deployment transaction", async () => {
      // `UpgradeableBeacon` is plain `Ownable`, so this handover completes inside the run itself,
      // unlike the comptroller's below.
      const beacon = await ethers.getContractAt("UpgradeableBeacon", await deployed("SpokeComptrollerBeacon"));
      expect(await beacon.owner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
    });

    it("nominates the Normal Timelock on the comptroller and leaves the deployer as owner", async () => {
      // `Ownable2Step` means the script can only nominate; the deployer stays the live owner until
      // the VIP calls `acceptOwnership`, which is why that call has to be the VIP's first action.
      const spoke = await ethers.getContractAt("SpokeComptroller", await deployed("Comptroller_HubSpoke"));
      expect(await spoke.owner()).to.equal(deployer);
      expect(await spoke.pendingOwner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
    });

    it("fits the deployed implementation under the EIP-170 limit", async () => {
      // `allowUnlimitedContractSize` is on for the hardhat network, so an oversized implementation
      // deploys here and would only fail on a real chain. Measure it rather than trusting the
      // deployment to have caught it.
      const code = await ethers.provider.getCode(await deployed("SpokeComptrollerImpl"));
      const size = (code.length - 2) / 2;
      expect(size, `SpokeComptroller runtime size ${size}`).to.be.lessThanOrEqual(EIP_170_LIMIT);
    });
  });
}

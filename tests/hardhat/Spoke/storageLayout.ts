import { expect } from "chai";
import { artifacts } from "hardhat";

// `SpokeComptrollerStorage` is a hand-maintained fork of `ComptrollerStorage`, and its trailing gap size was
// worked out by hand rather than derived by the compiler. Nothing in the build fails if a re-sync inserts a
// variable in the middle of the layout, drops one, or gets the gap arithmetic wrong; the first symptom would be a
// live pool reading someone else's slot after an implementation upgrade. These tests read the layout solc emits
// (`outputSelection` in hardhat.config.ts requests `storageLayout`) and pin it.

const SPOKE = "contracts/Spoke/SpokeComptroller.sol:SpokeComptroller";
const SHARED = "contracts/Comptroller.sol:Comptroller";

/// The slot upstream gives to the Prime token, which the spoke does not use.
const PRIME_SLOT = 214;

interface Entry {
  label: string;
  slot: number;
  offset: number;
  /// Human-readable type, with the declaring contract stripped off struct and enum names so the two forks compare.
  type: string;
}

interface Layout {
  entries: Entry[];
  byLabel: Map<string, Entry>;
  types: Record<string, { label: string; numberOfBytes: string; members?: Entry[] }>;
}

/// Both forks name their structs after the contract that declares them, so `ComptrollerStorage.Market` and
/// `SpokeComptrollerStorage.Market` are the same layout under different labels. Only the qualifier differs, and
/// comparing it would report a difference on every struct forever.
function normalizeType(label: string): string {
  return label.replace(/\b(Spoke)?ComptrollerStorage\./g, "");
}

async function readLayout(fullyQualifiedName: string): Promise<Layout> {
  const [sourceName, contractName] = fullyQualifiedName.split(":");
  const buildInfo = await artifacts.getBuildInfo(fullyQualifiedName);
  if (!buildInfo) {
    throw new Error(`no build info for ${fullyQualifiedName}; compile first`);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const output = (buildInfo.output.contracts as any)[sourceName][contractName];
  const layout = output.storageLayout;
  if (!layout) {
    throw new Error(`no storageLayout for ${fullyQualifiedName}; check outputSelection in hardhat.config.ts`);
  }

  const toEntry = (item: any): Entry => ({
    label: item.label,
    slot: Number(item.slot),
    offset: item.offset,
    type: normalizeType(layout.types[item.type].label),
  });
  const entries: Entry[] = layout.storage.map(toEntry);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // `__gap` appears once per inherited base, so it is deliberately left out of the lookup: everything that reads
  // by label is asking about a named variable.
  const byLabel = new Map(entries.filter(e => e.label !== "__gap").map(e => [e.label, e]));

  return { entries, byLabel, types: layout.types };
}

/// The named variable, or a failure naming what is missing. A layout that no longer declares it is the thing these
/// tests are looking for, so it has to fail loudly rather than compare against undefined.
function variable(layout: Layout, label: string): Entry {
  const found = layout.byLabel.get(label);
  if (!found) {
    throw new Error(`no storage variable named ${label}`);
  }
  return found;
}

function gapAt(layout: Layout, slot: number): Entry {
  const found = layout.entries.find(entry => entry.label === "__gap" && entry.slot === slot);
  if (!found) {
    throw new Error(`no reserved gap at slot ${slot}`);
  }
  return found;
}

/// Members of the `Market` struct each fork declares, keyed off the mapping `markets` resolves to.
function marketStructMembers(layout: Layout): Entry[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const marketsTypeKey = Object.keys(layout.types).find(key => layout.types[key].label.endsWith("Market)"));
  if (!marketsTypeKey) {
    throw new Error("no mapping to a Market struct in the layout");
  }
  const structType = layout.types[(layout.types[marketsTypeKey] as any).value];
  return (structType.members as Entry[]).map(member => ({
    label: member.label,
    slot: Number(member.slot),
    offset: member.offset,
    type: normalizeType(layout.types[(member as any).type].label),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe("SpokeComptroller: storage layout", () => {
  let spoke: Layout;
  let shared: Layout;

  before(async () => {
    spoke = await readLayout(SPOKE);
    shared = await readLayout(SHARED);
  });

  it("matches the recorded layout, slot for slot", () => {
    // Every slot the implementation occupies, including the gaps the OpenZeppelin bases reserve. Anything that
    // moves a variable, changes its type, or pulls in a base with a different footprint fails here, and the
    // failure is the review: either the change is safe for deployed pools or the layout has to be restored.
    const expected = [
      { label: "_initialized", slot: 0, offset: 0, type: "uint8" },
      { label: "_initializing", slot: 0, offset: 1, type: "bool" },
      { label: "__gap", slot: 1, offset: 0, type: "uint256[50]" },
      { label: "_owner", slot: 51, offset: 0, type: "address" },
      { label: "__gap", slot: 52, offset: 0, type: "uint256[49]" },
      { label: "_pendingOwner", slot: 101, offset: 0, type: "address" },
      { label: "__gap", slot: 102, offset: 0, type: "uint256[49]" },
      { label: "_accessControlManager", slot: 151, offset: 0, type: "contract IAccessControlManagerV8" },
      { label: "__gap", slot: 152, offset: 0, type: "uint256[49]" },
      { label: "oracle", slot: 201, offset: 0, type: "contract ResilientOracleInterface" },
      { label: "closeFactorMantissa", slot: 202, offset: 0, type: "uint256" },
      { label: "_poolLiquidationIncentiveMantissa", slot: 203, offset: 0, type: "uint256" },
      { label: "accountAssets", slot: 204, offset: 0, type: "mapping(address => contract VToken[])" },
      { label: "markets", slot: 205, offset: 0, type: "mapping(address => struct Market)" },
      { label: "allMarkets", slot: 206, offset: 0, type: "contract VToken[]" },
      { label: "borrowCaps", slot: 207, offset: 0, type: "mapping(address => uint256)" },
      { label: "minLiquidatableCollateral", slot: 208, offset: 0, type: "uint256" },
      { label: "supplyCaps", slot: 209, offset: 0, type: "mapping(address => uint256)" },
      { label: "_actionPaused", slot: 210, offset: 0, type: "mapping(address => mapping(enum Action => bool))" },
      { label: "rewardsDistributors", slot: 211, offset: 0, type: "contract RewardsDistributor[]" },
      { label: "rewardsDistributorExists", slot: 212, offset: 0, type: "mapping(address => bool)" },
      { label: "isForcedLiquidationEnabled", slot: 213, offset: 0, type: "mapping(address => bool)" },
      { label: "approvedDelegates", slot: 214, offset: 0, type: "mapping(address => mapping(address => bool))" },
      { label: "isSupplyAllowlistEnabled", slot: 215, offset: 0, type: "mapping(address => bool)" },
      { label: "isAllowedSupplier", slot: 216, offset: 0, type: "mapping(address => mapping(address => bool))" },
      { label: "isLiquidationAllowlistEnabled", slot: 217, offset: 0, type: "bool" },
      { label: "isAllowedLiquidator", slot: 218, offset: 0, type: "mapping(address => bool)" },
      { label: "liquidationIncentives", slot: 219, offset: 0, type: "mapping(address => uint256)" },
      { label: "deviationBoundedOracle", slot: 220, offset: 0, type: "contract IDeviationBoundedOracle" },
      { label: "__gap", slot: 221, offset: 0, type: "uint256[42]" },
      { label: "maxLoopsLimit", slot: 263, offset: 0, type: "uint256" },
      { label: "__gap", slot: 264, offset: 0, type: "uint256[49]" },
    ];

    expect(spoke.entries).to.deep.equal(expected);
  });

  it("shares every slot with the shared Comptroller up to the Prime slot", () => {
    // Below the Prime slot the two forks are the same contract, so a spoke variable that drifts here is a re-sync
    // mistake rather than a design decision.
    const upTo = (layout: Layout) => layout.entries.filter(entry => entry.slot < PRIME_SLOT);

    expect(upTo(spoke)).to.deep.equal(
      upTo(shared).map(entry =>
        // The pool-wide incentive is the one rename, forced by the getter of the same name the spoke adds.
        entry.label === "liquidationIncentiveMantissa"
          ? { ...entry, label: "_poolLiquidationIncentiveMantissa" }
          : entry,
      ),
    );
  });

  it("returns the unused Prime slot to the gap rather than leaving a hole", () => {
    expect(spoke.byLabel.has("prime")).to.equal(false);
    expect(variable(shared, "prime").slot).to.equal(PRIME_SLOT);

    // Dropping the variable shifts everything below it up by one, so a spoke pool's storage is not
    // interchangeable with the shared implementation's. That is safe only because spoke pools upgrade through
    // their own beacon: see the deployment tests.
    expect(variable(spoke, "approvedDelegates").slot).to.equal(variable(shared, "approvedDelegates").slot - 1);
  });

  it("sizes the trailing gap so the fork occupies the same slots as the contract it came from", () => {
    // Six variables were added and one removed, so the gap absorbs a net five slots: 47 upstream, 42 here.
    expect(gapAt(shared, 216).type).to.equal("uint256[47]");
    expect(gapAt(spoke, 221).type).to.equal("uint256[42]");

    // What the gap arithmetic is actually protecting: the variable that follows it, contributed by the
    // `MaxLoopsLimitHelper` base both forks inherit, has to land on the same slot in both.
    expect(variable(spoke, "maxLoopsLimit").slot).to.equal(variable(shared, "maxLoopsLimit").slot);
    expect(spoke.entries[spoke.entries.length - 1]).to.deep.equal(shared.entries[shared.entries.length - 1]);
  });

  it("keeps the Market struct identical to upstream", () => {
    // `markets` is a mapping, so its value struct is not part of the flat layout above and a member added or
    // reordered inside it would go unnoticed there.
    expect(marketStructMembers(spoke)).to.deep.equal(marketStructMembers(shared));
  });
});

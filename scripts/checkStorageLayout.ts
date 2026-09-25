/**
 * Fails if a contract's storage layout is no longer a compatible upgrade of the implementation
 * currently running behind its proxy.
 *
 * The old side is the `storageLayout` recorded in the deployment artifact, the layout of the
 * bytecode live on chain. The new side is today's source, read from artifacts/build-info, so a
 * `yarn hardhat compile` has to have run first. Nothing here touches the network.
 *
 * On a pull request the old side is read from the base branch rather than the working tree. A
 * deploy PR overwrites the implementation artifact, so reading the working tree would compare the
 * new source against an artifact generated from that same source and pass for free, exactly when
 * an upgrade is shipping.
 *
 * Appending a variable passes. Inserting, deleting, reordering, resizing, renaming or retyping one
 * fails; `@custom:oz-renamed-from` and `@custom:oz-retyped-from` are how the source declares a
 * rename is intentional. The rules are OpenZeppelin's, the same ones the upgrades plugin applies
 * at deploy time.
 *
 *   yarn check:storage-layout                                        against the working tree
 *   STORAGE_LAYOUT_BASE_REF=origin/develop yarn check:storage-layout  against a git ref
 */
import {
  getContractVersion,
  getStorageLayout,
  getStorageUpgradeReport,
  solcInputOutputDecoder,
  validate,
  withValidationDefaults,
} from "@openzeppelin/upgrades-core";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Mainnets only: testnet layouts drift on purpose. zksync is excluded because it compiles through
 * hardhat.config.zksync.ts into a build-info directory this script does not read.
 */
const NETWORKS = [
  "bscmainnet",
  "ethereum",
  "arbitrumone",
  "opbnbmainnet",
  "basemainnet",
  "opmainnet",
  "unichainmainnet",
];

/** Every other deployments/ directory. A directory in neither list fails the run, so a new chain
 *  has to be placed in one of them rather than going unchecked by default. */
const SKIPPED_NETWORKS = [
  "bsctestnet",
  "sepolia",
  "arbitrumsepolia",
  "opbnbtestnet",
  "basesepolia",
  "opsepolia",
  "unichainsepolia",
  "zksyncmainnet",
  "zksyncsepolia",
];

/** hardhat-deploy writes the implementation behind a proxy under this suffix. */
const SUFFIX = "_Implementation.json";

/**
 * Shared implementations sitting behind an UpgradeableBeacon, named by deployment file.
 *
 * The suffix scan only finds hardhat-deploy's own proxies, which it marks with a matching
 * `_Proxy.json`. A beacon implementation carries no such marker, so nothing in the artifacts tells
 * it apart from an ordinary standalone deployment and it has to be listed by name. Every pool's
 * Comptroller and every market's VToken delegates to one of these, so a slot inserted anywhere in
 * their inheritance chains shifts storage under all of them at once.
 *
 * An omission here is silent: a contract left off the list is never compared at all. Do not add a
 * contract that is merely stateful -- a standalone deployment is replaced by deploying a fresh one,
 * so its layout is free to change. The test is whether something delegatecalls into it.
 */
const BEACON_IMPLS = ["ComptrollerImpl", "VTokenImpl", "RewardsDistributorImpl"];

const ROOT = path.join(__dirname, "..");
const BUILD_INFO_DIR = path.join(ROOT, "artifacts", "build-info");
const ALLOWLIST_PATH = path.join(__dirname, "storage-layout-allowlist.json");

/**
 * Git ref the reference artifacts are read from.
 *
 * GITHUB_BASE_REF holds a bare branch name, so `origin/` is prepended. That only resolves because
 * the workflow checks out with `fetch-depth: 0`. Unset means the working tree, which is the intent
 * locally and a misconfiguration in CI, so assertReferenceIsUsable refuses it there.
 */
const BASE_REF =
  process.env.STORAGE_LAYOUT_BASE_REF || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "");

/** OZ's StorageLayout, inferred from the function we pass it to since the type itself is only
 *  exported from dist/. */
type Layout = Parameters<typeof getStorageUpgradeReport>[0];

interface Target {
  key: string;
  fqName?: string;
  deployed?: Layout;
  isNew?: boolean;
  blocked?: string;
}

/** Deployment artifacts store raw solc output, which gives each storage item a `contract` and an
 *  `astId` but no `src`. OZ requires `src` and only uses it to point at a source location in the
 *  failure report, so a synthesised one is enough. */
const normalize = (raw: { storage?: Record<string, unknown>[]; types?: Record<string, unknown> }): Layout => ({
  storage: (raw.storage ?? []).map(item => ({ ...item, src: item.src ?? `${item.contract}:${item.astId ?? 0}` })),
  types: raw.types ?? {},
});

/**
 * The reference artifact, read from BASE_REF when set. Undefined means the deployment is absent
 * from the reference, which is what makes it new. Only the read is allowed to mean "absent": a
 * malformed artifact throws, because reading a corrupt file as a new deployment would pass it
 * without comparing anything.
 */
function readReference(relPath: string): Record<string, unknown> | undefined {
  let raw: string;
  try {
    raw = BASE_REF
      ? // stderr is dropped: git reports a missing path as fatal, which here just means the
        // deployment is new.
        execFileSync("git", ["show", `${BASE_REF}:${relPath}`], {
          encoding: "utf8",
          maxBuffer: 1 << 28,
          stdio: ["ignore", "pipe", "ignore"],
        })
      : fs.readFileSync(path.join(ROOT, relPath), "utf8");
  } catch {
    return undefined;
  }
  return JSON.parse(raw);
}

/**
 * Refuses to run in any configuration that would compare nothing.
 *
 * Both failure modes pass rather than fail: with no base ref the branch is compared against
 * itself, and with a base ref that does not resolve every deployment looks new. Either way the run
 * reports success having checked nothing, which is worse than not running at all.
 */
function assertReferenceIsUsable(): void {
  if (!BASE_REF) {
    if (!process.env.CI) return;
    console.error(
      "No base ref. GitHub sets GITHUB_BASE_REF on pull_request events only, so this job must be " +
        "gated on `if: github.event_name == 'pull_request'`. Comparing against the working tree " +
        "here would compare the branch with itself.\nSet STORAGE_LAYOUT_BASE_REF to pick a ref explicitly.",
    );
    process.exit(1);
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", `${BASE_REF}^{commit}`], { stdio: "ignore" });
  } catch {
    console.error(
      `Cannot resolve '${BASE_REF}'. Every deployment would look new and this check would pass ` +
        `without comparing anything.\nFetch the base branch (actions/checkout needs fetch-depth: 0) ` +
        `or unset STORAGE_LAYOUT_BASE_REF to compare against the working tree.`,
    );
    process.exit(1);
  }
}

/** The contract a deployment was compiled from, which is often not its deployment name:
 *  ComptrollerImpl is deployed from Comptroller.sol:Comptroller. */
function readFqName(metadata?: string): string | undefined {
  if (!metadata) return undefined;
  const target = JSON.parse(metadata)?.settings?.compilationTarget;
  const source = target && Object.keys(target)[0];
  return source ? `${source}:${target[source]}` : undefined;
}

/** One target from one deployment file, blocked if its artifact cannot be read, so that a single
 *  unreadable artifact fails its own target instead of taking down the whole run. */
function targetFor(key: string, relPath: string): Target {
  try {
    return toTarget(key, readReference(relPath));
  } catch (error) {
    return { key, blocked: `artifact could not be read: ${(error as Error).message}` };
  }
}

function toTarget(key: string, artifact?: Record<string, unknown>): Target {
  if (!artifact) return { key, isNew: true };
  const layout = artifact.storageLayout as { storage?: Record<string, unknown>[] } | undefined;
  if (!layout) return { key, blocked: "deployment artifact records no storageLayout" };
  const fqName = readFqName(artifact.metadata as string | undefined);
  if (!fqName) return { key, blocked: "deployment artifact records no compiler metadata, so its source is unknown" };
  return { key, fqName, deployed: normalize(layout) };
}

/**
 * Every proxied implementation to check, one target per deployment file.
 *
 * Which files exist comes from the working tree, but each file's contents come from the base ref,
 * so a deployment the branch deletes or renames leaves the check rather than failing it.
 */
function collectTargets(): Target[] {
  const targets: Target[] = [];
  const matched = new Set<string>();

  for (const network of NETWORKS) {
    const dir = path.join(ROOT, "deployments", network);
    // A missing directory is a typo in NETWORKS, which would otherwise drop the whole chain.
    if (!fs.existsSync(dir)) {
      targets.push({
        key: `NETWORKS/${network}`,
        blocked: "listed in NETWORKS but deployments/ has no such directory",
      });
      continue;
    }
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(SUFFIX))) {
      const key = `${network}/${file.slice(0, -SUFFIX.length)}`;
      targets.push(targetFor(key, path.posix.join("deployments", network, file)));
    }
    for (const name of BEACON_IMPLS) {
      if (!fs.existsSync(path.join(dir, `${name}.json`))) continue;
      matched.add(name);
      targets.push(targetFor(`${network}/${name}`, path.posix.join("deployments", network, `${name}.json`)));
    }
  }

  // Not every chain has every beacon, but a name that matched nowhere is a typo rather than an
  // absence, and would quietly drop the target the list was added to cover.
  for (const name of BEACON_IMPLS.filter(n => !matched.has(n))) {
    // Keyed off the <network>/<Name> namespace on purpose: this is a config typo, not a deployment,
    // and must not be reachable from the allowlist.
    targets.push({
      key: `BEACON_IMPLS/${name}`,
      blocked: "listed in BEACON_IMPLS but has no deployment file on any network",
    });
  }

  const classified = new Set([...NETWORKS, ...SKIPPED_NETWORKS]);
  for (const entry of fs.readdirSync(path.join(ROOT, "deployments"), { withFileTypes: true })) {
    if (!entry.isDirectory() || classified.has(entry.name)) continue;
    targets.push({
      key: `NETWORKS/${entry.name}`,
      blocked: "deployments/ has this network but it is in neither NETWORKS nor SKIPPED_NETWORKS",
    });
  }
  return targets;
}

/**
 * Current layouts for the contracts we need, keyed by fully qualified name.
 *
 * Stops as soon as every wanted contract is found and never holds two parsed build-info files at
 * once, since a full compile leaves a few hundred MB of them. Files are read newest first so a
 * build-info left by an earlier compile cannot shadow the current one. Going through validate()
 * rather than raw solc output is what makes the `@custom:oz-*` annotations count.
 */
function resolveCurrentLayouts(wanted: Set<string>): Map<string, Layout> {
  const found = new Map<string, Layout>();
  if (!fs.existsSync(BUILD_INFO_DIR)) return found;

  const files = fs
    .readdirSync(BUILD_INFO_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => path.join(BUILD_INFO_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const file of files) {
    if (found.size === wanted.size) break;
    const { input, output, solcVersion } = JSON.parse(fs.readFileSync(file, "utf8"));
    const present = [...wanted].filter(fq => !found.has(fq) && hasContract(output, fq));
    if (present.length === 0) continue;

    const validation = validate(output, solcInputOutputDecoder(input, output), solcVersion, input);
    for (const fqName of present) {
      // Throwing means the contract is in solc's output but not upgrade-validated, an interface or
      // an abstract contract for instance. Leaving it unresolved makes the caller report it.
      try {
        found.set(fqName, getStorageLayout(validation, getContractVersion(validation, fqName)));
      } catch {
        continue;
      }
    }
  }
  return found;
}

function hasContract(output: { contracts?: Record<string, Record<string, unknown>> }, fqName: string): boolean {
  const at = fqName.lastIndexOf(":");
  return Boolean(output.contracts?.[fqName.slice(0, at)]?.[fqName.slice(at + 1)]);
}

const STRICT = withValidationDefaults({});
const LENIENT = withValidationDefaults({ unsafeAllowCustomTypes: true });

/**
 * Deployment artifacts store raw solc output, which records struct members but never enum members,
 * so an enum-typed slot fails as "Insufficient data to compare enums": `Action` in
 * ComptrollerStorage and `AuctionType`/`AuctionStatus` in ShortfallStorage.
 *
 * `unsafeAllowCustomTypes` is the only escape, but it force-approves *any* missing members, structs
 * included, so it is applied per target rather than globally -- only where the deployed layout
 * really does carry a memberless enum, which is 8 of the 28 targets. Struct comparison is never
 * relaxed. What it gives up is enum-only: reordering the members of an existing enum changes what
 * an already-stored value means and has to be caught in review. Growing one past 256 members
 * resizes the slot and still fails.
 */
const hasMemberlessEnum = (layout: Layout): boolean =>
  Object.entries((layout as unknown as { types: Record<string, { members?: unknown }> }).types).some(
    ([name, type]) => name.startsWith("t_enum") && type.members === undefined,
  );

/** Undefined when the layouts are compatible. A contract missing from build-info is a failure
 *  rather than a skip, so a renamed or deleted source cannot drop out of the check unnoticed. */
function check(target: Target, current: Map<string, Layout>): string | undefined {
  const updated = target.fqName ? current.get(target.fqName) : undefined;
  if (!updated) return `${target.fqName} was not found in artifacts/build-info`;
  const deployed = target.deployed as Layout;
  const report = getStorageUpgradeReport(deployed, updated, hasMemberlessEnum(deployed) ? LENIENT : STRICT);
  return report.ok ? undefined : report.explain(false);
}

interface Results {
  failures: string[];
  /** Allowlisted targets that now pass, so their entry has outlived its reason. */
  stale: string[];
}

type Verdict =
  | { kind: "new" }
  | { kind: "ok" }
  /** Not comparable, but allowlisted with a reason. */
  | { kind: "skipped" }
  | { kind: "stale" }
  | { kind: "failed"; detail: string };

/**
 * An allowlist entry excuses a target that cannot be compared. It never excuses one that compares
 * badly: `blocked` means nothing was checked, while a string from check() means the layout was
 * checked and the upgrade would shift storage under a live proxy. Excusing both would put a real
 * break one line of JSON away from green, on a file every PR can edit.
 */
function verdictFor(target: Target, current: Map<string, Layout>, allowlist: Record<string, string>): Verdict {
  if (target.isNew) return { kind: "new" };
  const allowed = target.key in allowlist;
  if (target.blocked) return allowed ? { kind: "skipped" } : { kind: "failed", detail: target.blocked };
  const detail = check(target, current);
  if (detail) return { kind: "failed", detail };
  return allowed ? { kind: "stale" } : { kind: "ok" };
}

const indent = (text: string): string => text.replace(/^/gm, "      ");

/** Prints the targets that need no attention as it goes and collects the ones that do, so failures
 *  print together at the end rather than scattered through the log. */
function classify(targets: Target[], current: Map<string, Layout>, allowlist: Record<string, string>): Results {
  const results: Results = { failures: [], stale: [] };

  for (const target of targets) {
    const verdict = verdictFor(target, current, allowlist);
    if (verdict.kind === "failed") {
      results.failures.push(`  FAILED    ${target.key}  (${target.fqName ?? "unresolved"})\n${indent(verdict.detail)}`);
    } else if (verdict.kind === "stale") {
      results.stale.push(target.key);
    } else {
      const source = verdict.kind === "ok" ? `  (${target.fqName})` : "";
      console.log(`  ${verdict.kind.padEnd(9)} ${target.key}${source}`);
    }
  }
  return results;
}

function main(): void {
  assertReferenceIsUsable();

  const allowlist: Record<string, string> = fs.existsSync(ALLOWLIST_PATH)
    ? JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8")).skip ?? {}
    : {};

  const targets = collectTargets();
  const current = resolveCurrentLayouts(new Set(targets.flatMap(t => t.fqName ?? [])));

  console.log(`Reference: ${BASE_REF || "working tree"} | ${targets.length} deployed implementations\n`);
  const { failures, stale } = classify(targets, current, allowlist);

  failures.forEach(f => console.log(`\n${f}`));
  // A stale entry counts towards the verdict like a real failure: the allowlist is only
  // trustworthy if an entry cannot outlive the problem it documents.
  const verdict = failures.length === 0 && stale.length === 0 ? "PASSED" : "FAILED";
  const staleCount = stale.length > 0 ? `, ${stale.length} stale` : "";
  console.log(`\n${verdict} (${targets.length} checked, ${failures.length} incompatible${staleCount})`);

  if (stale.length > 0) {
    console.log(
      `\nThese now pass -- delete them from storage-layout-allowlist.json:\n${stale.map(s => `  ${s}`).join("\n")}`,
    );
  }
  if (verdict === "FAILED") process.exit(1);
}

main();

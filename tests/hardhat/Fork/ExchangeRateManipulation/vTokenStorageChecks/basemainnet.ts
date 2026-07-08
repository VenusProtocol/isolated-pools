import { runStorageCheckTests } from "./testRunner";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "basemainnet";

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  runStorageCheckTests({
    network: FORKED_NETWORK,
    blockNumber: 43482288,
    vTokenArgs: { timeBased: true, blocksPerYear: 0, maxBorrowRateMantissa: "1666700000000" },
  });
}

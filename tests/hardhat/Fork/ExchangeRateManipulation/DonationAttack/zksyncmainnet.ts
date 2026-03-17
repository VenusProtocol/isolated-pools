import { runDonationAttackTests } from "./testRunner";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "zksyncmainnet";

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  runDonationAttackTests({
    network: FORKED_NETWORK,
    blockNumber: 69120176,
    vTokenArgs: { timeBased: true, blocksPerYear: 0, maxBorrowRateMantissa: "1666700000000" },
  });
}

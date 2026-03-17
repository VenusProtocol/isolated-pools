import { runDonationAttackTests } from "./testRunner";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "opmainnet";

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  runDonationAttackTests({
    network: FORKED_NETWORK,
    blockNumber: 149078360,
    vTokenArgs: { timeBased: true, blocksPerYear: 0, maxBorrowRateMantissa: "1666700000000" },
  });
}

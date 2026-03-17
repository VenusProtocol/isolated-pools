import { runDonationAttackTests } from "./testRunner";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "ethereum";

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  runDonationAttackTests({
    network: FORKED_NETWORK,
    blockNumber: 24676658,
    vTokenArgs: { timeBased: false, blocksPerYear: 2628000, maxBorrowRateMantissa: "5000000000000" },
  });
}

import { runDonationAttackTests } from "./testRunner";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "opbnbmainnet";

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  runDonationAttackTests({
    network: FORKED_NETWORK,
    blockNumber: 122550547,
    vTokenArgs: { timeBased: false, blocksPerYear: 126144000, maxBorrowRateMantissa: "5000000000000" },
  });
}

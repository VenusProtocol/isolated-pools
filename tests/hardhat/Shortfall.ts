import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import {
  Shortfall,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let shortfall: Shortfall;

describe("Rewards: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  // before(async function () {
  //   const ShortfallFactory = await ethers.getContractFactory(
  //     "Shortfall"
  //   );
  //   shortfall = await ShortfallFactory.deploy("0x0000000000000000000000000000000000000000");
  //   await shortfall.deployed();
  // });

  // it("test", async function () {
  //   console.log((await shortfall.test()).toString())
  // });
});

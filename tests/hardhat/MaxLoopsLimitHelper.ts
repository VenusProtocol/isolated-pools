import { MockContract, MockContractFactory, smock } from "@defi-wonderland/smock";
import chai from "chai";

import { HarnessMaxLoopsLimitHelper, HarnessMaxLoopsLimitHelper__factory } from "../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("MaxLoopsLimit: tests", () => {
  let maxLoopsLimitHelperFactory: MockContractFactory<HarnessMaxLoopsLimitHelper__factory>;
  let maxLoopsLimitHelper: MockContract<HarnessMaxLoopsLimitHelper>;

  beforeEach(async () => {
    maxLoopsLimitHelperFactory = await smock.mock<HarnessMaxLoopsLimitHelper__factory>("HarnessMaxLoopsLimitHelper");
    maxLoopsLimitHelper = await maxLoopsLimitHelperFactory.deploy();
  });

  it("Set the maxLoopsLimit cap", async () => {
    const result = await maxLoopsLimitHelper.setMaxLoopsLimit(150);
    await expect(result).to.emit(maxLoopsLimitHelper, "MaxLoopsLimitUpdated").withArgs(0, 150);
  });

  it("Revert on exceeding the max loop limit", async () => {
    await maxLoopsLimitHelper.setMaxLoopsLimit(150);
    await expect(maxLoopsLimitHelper.ensureMaxLoops(200))
      .to.be.revertedWithCustomError(maxLoopsLimitHelper, "MaxLoopsLimitExceeded")
      .withArgs(150, 200);
  });
});

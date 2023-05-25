import { smock } from "@defi-wonderland/smock";
import chai from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  FaucetToken,
  FaucetToken__factory,
  MockToken,
  MockToken__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";

const ADMIN = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
const ORACLE_ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
const ORACLE = "0xfc4e26B7fD56610E84d33372435F0275A359E8eF";

let impersonatedTimelock: Signer;
let impersonatedOracleOwner: Signer;
let accessControlManager: AccessControlManager;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
  impersonatedOracleOwner = await initMainnetUser(ORACLE_ADMIN, ethers.utils.parseUnits("2"));
}

async function configureVToken(vTokenAddress: string) {
  const VToken = VToken__factory.connect(vTokenAddress, impersonatedTimelock);
  return VToken;
}

if (FORK_TESTNET) {
  let priceOracle: ChainlinkOracle;
  let comptroller: Comptroller;
  let vUSDD: VToken;
  let vUSDT: VToken;
  let usdd: MockToken;
  let usdt: FaucetToken;
  const mintAmount = convertToUnit("1", 17);
  let acc1Signer: Signer;
  let acc2Signer: Signer;
  const usdtBorrowAmount = convertToUnit("1", 4);
  let udnerlyingMintAmount;
  const acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
  const acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";

  describe("Liquidate from VToken", async () => {
    async function grantPermissions() {
      accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);

      let tx = await accessControlManager
        .connect(impersonatedTimelock)
        .giveCallPermission(comptroller.address, "setMarketSupplyCaps(address[],uint256[])", ADMIN);
      await tx.wait();

      tx = await accessControlManager
        .connect(impersonatedTimelock)
        .giveCallPermission(comptroller.address, "setMarketBorrowCaps(address[],uint256[])", ADMIN);
      await tx.wait();

      tx = await accessControlManager
        .connect(impersonatedTimelock)
        .giveCallPermission(ORACLE, "setDirectPrice(address,uint256)", ADMIN);
      await tx.wait();

      tx = await accessControlManager
        .connect(impersonatedTimelock)
        .giveCallPermission(comptroller.address, "setMinLiquidatableCollateral(uint256)", ADMIN);
    }

    beforeEach(async () => {
      await setForkBlock(30080357);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));

      usdt = FaucetToken__factory.connect("0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c", impersonatedTimelock);
      usdd = MockToken__factory.connect("0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382", impersonatedTimelock);
      vUSDT = await configureVToken("0x296da137120562c79b26808c1aa142a59ebf31f4");
      vUSDD = await configureVToken("0xeD7401294EBF0A1b0721562a69031565F4a4Bacd");
      comptroller = Comptroller__factory.connect("0x605AA769d14F6Af2E405295FEC2A4d8Baa623d80", impersonatedTimelock);
      priceOracle = ChainlinkOracle__factory.connect(ORACLE, impersonatedOracleOwner);

      await grantPermissions();

      await comptroller.setMarketSupplyCaps(
        [vUSDT.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vUSDT.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );

      await comptroller.connect(acc1Signer).enterMarkets([vUSDT.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vUSDD.address]);

      await usdt.connect(acc1Signer).allocateTo(acc1, mintAmount);
      await usdt.connect(acc1Signer).approve(vUSDT.address, mintAmount);
      await expect(vUSDT.connect(acc1Signer).mint(mintAmount)).to.emit(vUSDT, "Mint");

      await usdd.connect(acc2Signer).faucet(mintAmount);
      await usdd.connect(acc2Signer).approve(vUSDD.address, mintAmount);
      await expect(vUSDD.connect(acc2Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");

      await expect(vUSDT.connect(acc2Signer).borrow(usdtBorrowAmount)).to.emit(vUSDT, "Borrow");

      await usdt.connect(acc1Signer).allocateTo(acc1, convertToUnit("1", 18));
      await usdt.connect(acc1Signer).approve(vUSDT.address, convertToUnit("1", 18));

      await priceOracle.setDirectPrice(vUSDD.address, "159990000000000000000");
      await priceOracle.setDirectPrice(vUSDT.address, "20800000000000000");
    });

    it("Should revert when liquidation is called through vToken and does not met minCollateral Criteria", async function () {
      await expect(
        vUSDT.connect(acc1Signer).liquidateBorrow(acc2, usdtBorrowAmount, vUSDT.address),
      ).to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated");
    });

    it("Should revert when liquidation is called through vToken and no shortfall", async function () {
      // Mint and Increase collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 30);
      await usdd.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await usdd.connect(acc2Signer).approve(vUSDD.address, udnerlyingMintAmount);

      await vUSDD.connect(acc2Signer).mint(udnerlyingMintAmount);

      // Liquidation
      await expect(
        vUSDT.connect(acc1Signer).liquidateBorrow(acc2, usdtBorrowAmount, vUSDT.address),
      ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
    });

    it("Should revert when liquidation is called through vToken and trying to seize more tokens", async function () {
      await comptroller.setMinLiquidatableCollateral(0);
      // Mint and Increase collateral of the user
      await priceOracle.setDirectPrice(usdd.address, convertToUnit("1", 5));
      // Liquidation
      await expect(vUSDT.connect(acc1Signer).liquidateBorrow(acc2, 201, vUSDD.address)).to.be.revertedWith(
        "LIQUIDATE_SEIZE_TOO_MUCH",
      );
    });

    it("Should revert when liquidation is called through vToken and trying to pay too much", async function () {
      // Mint and Incrrease collateral of the user
      await comptroller.setMinLiquidatableCollateral(0);
      udnerlyingMintAmount = convertToUnit("1", 18);
      await usdd.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await usdd.connect(acc2Signer).approve(vUSDD.address, udnerlyingMintAmount);

      await expect(vUSDD.connect(acc2Signer).mint(udnerlyingMintAmount)).to.emit(vUSDD, "Mint");
      // price manipulation and borrow to overcome insufficient shortfall

      await priceOracle.setDirectPrice(usdd.address, convertToUnit("1", 5));
      // Liquidation
      await expect(
        vUSDT.connect(acc1Signer).liquidateBorrow(acc2, convertToUnit("1", 18), vUSDD.address),
      ).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
    });

    it("liquidate user", async () => {
      await comptroller.setMinLiquidatableCollateral(0);
      await priceOracle.setDirectPrice(usdd.address, convertToUnit("100", 15));
      const borrowBalance = await vUSDT.borrowBalanceStored(acc2);
      const closeFactor = await comptroller.closeFactorMantissa();
      const maxClose = (borrowBalance * closeFactor) / 1e18;
      await vUSDT.connect(acc1Signer).liquidateBorrow(acc2, maxClose.toString(), vUSDD.address);
    });
  });
}

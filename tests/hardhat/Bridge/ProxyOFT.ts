import { FakeContract, smock } from "@defi-wonderland/smock";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  LZEndpointMock,
  LZEndpointMock__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  XVS,
  XVSProxyOFTDest,
  XVSProxyOFTDest__factory,
  XVSProxyOFTSrc,
  XVSProxyOFTSrc__factory,
  XVS__factory,
} from "../../../typechain";

describe("Proxy OFTV2: ", function () {
  const localChainId = 1;
  const remoteChainId = 2;
  const name = "Venus XVS";
  const symbol = "XVS";
  const sharedDecimals = 8;
  const singleTransactionLimit = convertToUnit(10, 18);
  const maxDailyTransactionLimit = convertToUnit(100, 18);

  let LZEndpointMock: LZEndpointMock__factory,
    RemoteTokenFactory: XVS__factory,
    LocalTokenFactory: MockToken__factory,
    ProxyOFTV2Src: XVSProxyOFTSrc__factory,
    ProxyOFTV2Dest: XVSProxyOFTDest__factory,
    localEndpoint: LZEndpointMock,
    remoteEndpoint: LZEndpointMock,
    localOFT: XVSProxyOFTSrc,
    remoteOFT: XVSProxyOFTDest,
    localToken: MockToken,
    remoteToken: XVS,
    remotePath: string,
    localPath: string,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    accessControlManager: FakeContract<AccessControlManager>,
    oracle: FakeContract<ResilientOracleInterface>,
    initialAmount: string,
    amount: string;

  before(async function () {
    LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
    ProxyOFTV2Src = await ethers.getContractFactory("XVSProxyOFTSrc");
    ProxyOFTV2Dest = await ethers.getContractFactory("XVSProxyOFTDest");
    LocalTokenFactory = await ethers.getContractFactory("MockToken");
    RemoteTokenFactory = await ethers.getContractFactory("XVS");
    alice = (await ethers.getSigners())[1];
    bob = (await ethers.getSigners())[2];
    accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    accessControlManager.isAllowedToCall.returns(true);
    oracle.getPrice.returns(convertToUnit(1, 18));
  });

  beforeEach(async function () {
    localEndpoint = await LZEndpointMock.deploy(localChainId);
    remoteEndpoint = await LZEndpointMock.deploy(remoteChainId);

    // create two OmnichainFungibleToken instances
    localToken = await LocalTokenFactory.deploy(name, symbol, 18);
    remoteToken = await RemoteTokenFactory.deploy(accessControlManager.address);

    localOFT = await ProxyOFTV2Src.deploy(
      localToken.address,
      sharedDecimals,
      localEndpoint.address,
      accessControlManager.address,
      oracle.address,
    );
    remoteOFT = await ProxyOFTV2Dest.deploy(
      remoteToken.address,
      sharedDecimals,
      remoteEndpoint.address,
      accessControlManager.address,
      oracle.address,
    );

    // internal bookkeeping for endpoints (not part of a real deploy, just for this test)
    await localEndpoint.setDestLzEndpoint(remoteOFT.address, remoteEndpoint.address);
    await remoteEndpoint.setDestLzEndpoint(localOFT.address, localEndpoint.address);

    // set each contracts source address so it can send to each other
    remotePath = ethers.utils.solidityPack(["address", "address"], [remoteOFT.address, localOFT.address]);
    localPath = ethers.utils.solidityPack(["address", "address"], [localOFT.address, remoteOFT.address]);
    await localOFT.setTrustedRemote(remoteChainId, remotePath); // for A, set B
    await remoteOFT.setTrustedRemote(localChainId, localPath); // for B, set A

    await remoteToken.setMintCap(remoteOFT.address, convertToUnit("100000", 18));
    await localOFT.setMaxSingleTransactionLimit(remoteChainId, singleTransactionLimit);
    await localOFT.setMaxDailyLimit(remoteChainId, maxDailyTransactionLimit);

    await remoteOFT.setMaxSingleTransactionLimit(localChainId, singleTransactionLimit);
    await remoteOFT.setMaxDailyLimit(localChainId, maxDailyTransactionLimit);
  });

  it("send tokens from proxy oft and receive them back", async function () {
    initialAmount = ethers.utils.parseEther("1.0000000001", 18); // 1 ether
    amount = ethers.utils.parseEther("1", 18);
    const dust = ethers.utils.parseEther("0.0000000001");
    await localToken.connect(alice).faucet(initialAmount);
    // verify alice has tokens and bob has no tokens on remote chain
    expect(await localToken.balanceOf(alice.address)).to.be.equal(initialAmount);
    expect(await remoteToken.balanceOf(bob.address)).to.be.equal(0);
    // alice sends tokens to bob on remote chain
    // approve the proxy to swap your tokens
    await localToken.connect(alice).approve(localOFT.address, initialAmount);
    // swaps token to remote chain
    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, initialAmount, false, "0x"))
      .nativeFee;
    await localOFT
      .connect(alice)
      .sendFrom(
        alice.address,
        remoteChainId,
        bobAddressBytes32,
        initialAmount,
        [alice.address, ethers.constants.AddressZero, "0x"],
        { value: nativeFee },
      );

    // tokens are now owned by the proxy contract, because this is the original oft chain
    expect(await localToken.balanceOf(localOFT.address)).to.equal(amount);
    expect(await localToken.balanceOf(alice.address)).to.equal(dust);
    // tokens received on the remote chain
    expect(await remoteOFT.circulatingSupply()).to.equal(amount);
    expect(await remoteToken.balanceOf(bob.address)).to.be.equal(amount);
    // bob send tokens back to alice from remote chain
    const aliceAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [alice.address]);
    const halfAmount = amount.div(2);
    nativeFee = (await remoteOFT.estimateSendFee(localChainId, aliceAddressBytes32, halfAmount, false, "0x")).nativeFee;
    await remoteOFT
      .connect(bob)
      .sendFrom(
        bob.address,
        localChainId,
        aliceAddressBytes32,
        halfAmount,
        [bob.address, ethers.constants.AddressZero, "0x"],
        { value: nativeFee },
      );
    // half tokens are burned on the remote chain
    expect(await remoteOFT.circulatingSupply()).to.equal(halfAmount);
    expect(await remoteToken.balanceOf(bob.address)).to.be.equal(halfAmount);
    // tokens received on the local chain and unlocked from the proxy
    expect(await localToken.balanceOf(localOFT.address)).to.be.equal(halfAmount);
    // console.log(halfAmount, dust, typeof halfAmount, typeof dust)
    // console.log(halfAmount.add(dust), typeof halfAmount.add(dust))
    expect(await localToken.balanceOf(alice.address)).to.be.equal(halfAmount.add(dust));
  });

  it("Reverts if single transaction limit exceed", async function () {
    amount = ethers.utils.parseEther("11", 18);
    await localToken.connect(alice).faucet(amount);
    await localToken.connect(alice).approve(localOFT.address, amount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;
    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    )
      .to.be.revertedWithCustomError(localOFT, "MaxSingleTransactionLimitExceed")
      .withArgs(amount, singleTransactionLimit);
  });

  it("Reverts if max daily transaction limit exceed", async function () {
    initialAmount = ethers.utils.parseEther("110", 18);
    amount = ethers.utils.parseEther("10", 18);
    await localToken.connect(alice).faucet(initialAmount);
    await localToken.connect(alice).approve(localOFT.address, initialAmount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    // After 10 transaction it should fail as limit of max daily transaction is 100 USD and price per full token in USD is 1
    for (let i = 0; i < 10; i++) {
      await localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        );
    }
    expect(await localOFT.chainIdToLast24HourTransferred(remoteChainId)).equals(maxDailyTransactionLimit);
    expect(await remoteOFT.circulatingSupply()).equals(maxDailyTransactionLimit);
    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    )
      .to.be.revertedWithCustomError(localOFT, "MaxDailyLimitExceed")
      .withArgs(amount, maxDailyTransactionLimit);
  });

  it("Reset limit if 24hour window passed", async function () {
    initialAmount = ethers.utils.parseEther("110", 18);
    amount = ethers.utils.parseEther("10", 18);
    await localToken.connect(alice).faucet(initialAmount);
    await localToken.connect(alice).approve(localOFT.address, initialAmount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    // After 10 transaction it should fail as limit of max daily transaction is 100 USD and price per full token in USD is 1
    for (let i = 0; i < 10; i++) {
      await localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        );
    }

    // Limit reached
    expect(await localOFT.chainIdToLast24HourTransferred(remoteChainId)).equals(maxDailyTransactionLimit);

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    )
      .to.be.revertedWithCustomError(localOFT, "MaxDailyLimitExceed")
      .withArgs(amount, maxDailyTransactionLimit);

    await time.increase(86400);

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    )
      .to.be.emit(remoteOFT, "ReceiveFromChain")
      .withArgs(localChainId, bob.address, amount);
  });

  it("Reverts on remote chain if minting permission is not granted to remoteOFT", async function () {
    accessControlManager.isAllowedToCall.returns(false);
    expect(await remoteEndpoint.inboundNonce(localChainId, localPath)).lessThanOrEqual(0);
    amount = ethers.utils.parseEther("10", 18);
    await localToken.connect(alice).faucet(amount);
    await localToken.connect(alice).approve(localOFT.address, amount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    ).not.to.emit(remoteOFT, "ReceiveFromChain");

    // Msg should reach remote chain
    expect(await remoteEndpoint.inboundNonce(localChainId, localPath)).equals(1);
    accessControlManager.isAllowedToCall.returns(true);
  });

  it("Reverts on remote chain if minting cap is reached", async function () {
    await remoteToken.setMintCap(remoteOFT.address, convertToUnit(10, 18));
    expect(await remoteEndpoint.inboundNonce(localChainId, localPath)).lessThanOrEqual(0);
    initialAmount = ethers.utils.parseEther("20", 18);
    amount = ethers.utils.parseEther("10", 18);
    await localToken.connect(alice).faucet(initialAmount);
    await localToken.connect(alice).approve(localOFT.address, initialAmount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    await localOFT
      .connect(alice)
      .sendFrom(
        alice.address,
        remoteChainId,
        bobAddressBytes32,
        amount,
        [alice.address, ethers.constants.AddressZero, "0x"],
        { value: nativeFee },
      ),
      // Msg should reach remote chain
      expect(await remoteEndpoint.inboundNonce(localChainId, localPath)).equals(1);

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    ).not.to.emit(remoteOFT, "ReceiveFromChain");

    // Msg should reach remote chain
    expect(await remoteEndpoint.inboundNonce(localChainId, localPath)).equals(2);
  });

  it("Reverts initialy and should success on retry", async function () {
    initialAmount = ethers.utils.parseEther("20", 18);
    amount = ethers.utils.parseEther("10", 18);
    await localToken.connect(alice).faucet(initialAmount);
    await localToken.connect(alice).approve(localOFT.address, initialAmount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;
    // Blocking next message
    await remoteEndpoint.blockNextMsg();
    await localOFT
      .connect(alice)
      .sendFrom(
        alice.address,
        remoteChainId,
        bobAddressBytes32,
        amount,
        [alice.address, ethers.constants.AddressZero, "0x"],
        { value: nativeFee },
      );
    expect(await remoteEndpoint.hasStoredPayload(localChainId, localPath)).equals(true);
    // Initial state
    expect(await remoteOFT.circulatingSupply()).to.equal(0);
    expect(await remoteToken.balanceOf(bob.address)).to.be.equal(0);

    const ld2sdAmount = convertToUnit(10, 8);
    const ptSend = await localOFT.PT_SEND();
    const payload = await ethers.utils.solidityPack(
      ["uint8", "bytes", "uint64"],
      [ptSend, bobAddressBytes32, ld2sdAmount],
    );
    await remoteEndpoint.retryPayload(localChainId, localPath, payload);

    // tokens received on the remote chain
    expect(await remoteOFT.circulatingSupply()).to.equal(amount);
    expect(await remoteToken.balanceOf(bob.address)).to.be.equal(amount);
  });

  it("Reverts on remote chain if bridge is paused", async function () {
    await remoteOFT.pause();
    amount = ethers.utils.parseEther("10", 18);
    await localToken.connect(alice).faucet(amount);
    await localToken.connect(alice).approve(localOFT.address, amount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    ).not.to.emit(remoteOFT, "ReceiveFromChain");
  });

  it("Reverts if amount is too small", async function () {
    amount = ethers.utils.parseEther("0.00000000001", 18);
    await localToken.connect(alice).faucet(amount);
    await localToken.connect(alice).approve(localOFT.address, amount);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    ).to.be.revertedWith("OFTCore: amount too small");
  });

  it("total outbound amount overflow", async function () {
    await localOFT.setMaxSingleTransactionLimit(remoteChainId, ethers.constants.MaxUint256);
    await localOFT.setMaxDailyLimit(remoteChainId, ethers.constants.MaxUint256);

    await localToken.connect(alice).faucet(ethers.constants.MaxUint256);
    const maxUint64 = BigNumber.from(2).pow(64).sub(1);
    let amount = maxUint64.mul(BigNumber.from(10).pow(18 - sharedDecimals)); // sd to ld
    await localToken.connect(alice).approve(localOFT.address, ethers.constants.MaxUint256);

    const bobAddressBytes32 = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);
    let nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;
    await localOFT
      .connect(alice)
      .sendFrom(
        alice.address,
        remoteChainId,
        bobAddressBytes32,
        amount,
        [alice.address, ethers.constants.AddressZero, "0x"],
        { value: nativeFee },
      );

    amount = BigNumber.from(10).pow(18 - sharedDecimals); // min amount without dust

    // fails to send more for cap overflow
    nativeFee = (await localOFT.estimateSendFee(remoteChainId, bobAddressBytes32, amount, false, "0x")).nativeFee;

    await expect(
      localOFT
        .connect(alice)
        .sendFrom(
          alice.address,
          remoteChainId,
          bobAddressBytes32,
          amount,
          [alice.address, ethers.constants.AddressZero, "0x"],
          { value: nativeFee },
        ),
    ).to.be.revertedWith("ProxyOFT: outboundAmount overflow");
  });
});

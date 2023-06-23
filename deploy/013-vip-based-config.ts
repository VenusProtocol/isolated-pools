import { BigNumberish } from "ethers";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  AccessControlEntry,
  DeploymentConfig,
  PoolConfig,
  RewardConfig,
  VTokenConfig,
  getConfig,
  getTokenConfig,
} from "../helpers/deploymentConfig";
import {
  getUnderlyingToken,
  getUnregisteredPools,
  getUnregisteredRewardsDistributors,
  getUnregisteredVTokens,
  toAddress,
} from "../helpers/deploymentUtils";
import { Comptroller, PoolRegistry, RewardsDistributor } from "../typechain";

interface GovernanceCommand {
  contract: string;
  signature: string;
  argTypes: string[];
  parameters: any[];
  value: BigNumberish;
}

interface ProposalActions {
  targets: string[];
  values: BigNumberish[];
  signatures: string[];
  calldatas: string[];
}

const toProposalActions = (commands: GovernanceCommand[]): ProposalActions => {
  const targets = commands.map(c => c.contract);
  const values = commands.map(c => c.value);
  const signatures = commands.map(c => c.signature);
  const calldatas = commands.map(c => ethers.utils.defaultAbiCoder.encode(c.argTypes, c.parameters));
  return { targets, values, signatures, calldatas };
};

const addRewardsDistributor = async (
  rewardsDistributor: RewardsDistributor,
  pool: PoolConfig,
  rewardConfig: RewardConfig,
): Promise<GovernanceCommand> => {
  const comptroller = await ethers.getContract(`Comptroller_${pool.id}`);
  console.log(`Adding a command to add ${rewardConfig.asset} rewards distributor to Comptroller_${pool.id}`);
  return {
    contract: comptroller.address,
    signature: "addRewardsDistributor(address)",
    argTypes: ["address"],
    parameters: [rewardsDistributor.address],
    value: 0,
  };
};

const setRewardSpeed = async (
  pool: PoolConfig,
  rewardsDistributor: RewardsDistributor,
  rewardConfig: RewardConfig,
): Promise<GovernanceCommand> => {
  const vTokenAddresses = await Promise.all(
    rewardConfig.markets.map(async (underlyingSymbol: string) => {
      const vTokenConfig = pool.vtokens.find(vtoken => vtoken.asset === underlyingSymbol);
      if (!vTokenConfig) {
        throw new Error(`Market for ${underlyingSymbol} not found in pool ${pool.name}`);
      }
      const vToken = await ethers.getContract(`VToken_${vTokenConfig.symbol}`);
      console.log(`Found ${underlyingSymbol} at ${vToken.address}`);
      return vToken.address;
    }),
  );

  console.log(`Adding a command to set reward speed of ${rewardConfig.asset} for ${pool.name}`);
  return {
    contract: rewardsDistributor.address,
    signature: "setRewardTokenSpeeds(address[],uint256[],uint256[])",
    argTypes: ["address[]", "uint256[]", "uint256[]"],
    parameters: [vTokenAddresses, rewardConfig.supplySpeeds, rewardConfig.borrowSpeeds],
    value: 0,
  };
};

const configureRewards = async (
  unregisteredRewardDistributors: PoolConfig[],
  hre: HardhatRuntimeEnvironment,
): Promise<GovernanceCommand[]> => {
  const commands = await Promise.all(
    unregisteredRewardDistributors.map(async (pool: PoolConfig) => {
      const rewards = pool.rewards || [];
      const poolCommands = await Promise.all(
        rewards.map(async (rewardConfig: RewardConfig) => {
          const contractName = `RewardsDistributor_${rewardConfig.asset}_${pool.id}`;
          const rewardsDistributor = await ethers.getContract<RewardsDistributor>(contractName);
          return [
            ...(await acceptOwnership(contractName, hre)),
            await addRewardsDistributor(rewardsDistributor, pool, rewardConfig),
            await setRewardSpeed(pool, rewardsDistributor, rewardConfig),
          ];
        }),
      );
      return poolCommands.flat();
    }),
  );
  return commands.flat();
};

const acceptOwnership = async (contractName: string, hre: HardhatRuntimeEnvironment): Promise<GovernanceCommand[]> => {
  if (!hre.network.live) {
    return [];
  }
  console.log(`Adding a command to accept the admin rights over ${contractName}`);
  const contract = await ethers.getContract(contractName);
  return [
    {
      contract: contract.address,
      signature: "acceptOwnership()",
      argTypes: [],
      parameters: [],
      value: 0,
    },
  ];
};

const setOracle = async (comptroller: Comptroller, pool: PoolConfig): Promise<GovernanceCommand> => {
  const oracle = await ethers.getContract("ResilientOracle");
  console.log(`Adding a command to set the price oracle for Comptroller_${pool.id}`);
  return {
    contract: comptroller.address,
    signature: "setPriceOracle(address)",
    argTypes: ["address"],
    parameters: [oracle.address],
    value: 0,
  };
};

const addPool = (poolRegistry: PoolRegistry, comptroller: Comptroller, pool: PoolConfig): GovernanceCommand => {
  console.log(`Adding a command to add Comptroller_${pool.id} to PoolRegistry`);
  return {
    contract: poolRegistry.address,
    signature: "addPool(string,address,uint256,uint256,uint256)",
    argTypes: ["string", "address", "uint256", "uint256", "uint256"],
    parameters: [
      pool.name,
      comptroller.address,
      pool.closeFactor,
      pool.liquidationIncentive,
      pool.minLiquidatableCollateral,
    ],
    value: 0,
  };
};

const addPools = async (
  unregisteredPools: PoolConfig[],
  hre: HardhatRuntimeEnvironment,
): Promise<GovernanceCommand[]> => {
  const poolRegistry = await ethers.getContract<PoolRegistry>("PoolRegistry");
  const commands = await Promise.all(
    unregisteredPools.map(async (pool: PoolConfig) => {
      const comptroller = await ethers.getContract<Comptroller>(`Comptroller_${pool.id}`);
      return [
        ...(await acceptOwnership(`Comptroller_${pool.id}`, hre)),
        await setOracle(comptroller, pool),
        addPool(poolRegistry, comptroller, pool),
      ];
    }),
  );
  return commands.flat();
};

const transferInitialLiquidity = async (
  vTokenConfig: VTokenConfig,
  deploymentConfig: DeploymentConfig,
  hre: HardhatRuntimeEnvironment,
): Promise<GovernanceCommand[]> => {
  const { deployer } = await hre.getNamedAccounts();
  const { preconfiguredAddresses, tokensConfig } = deploymentConfig;
  const { asset, initialSupply } = vTokenConfig;
  const token = getTokenConfig(asset, tokensConfig);
  const tokenContract = await getUnderlyingToken(token.symbol, tokensConfig);

  if (hre.network.name === "bsctestnet") {
    console.log(`Adding a command to transfer ${initialSupply} ${token.symbol} to Timelock`);
    return [
      {
        contract: tokenContract.address,
        signature: "transferFrom(address,address,uint256)",
        argTypes: ["address", "address", "uint256"],
        parameters: [deployer, preconfiguredAddresses.NormalTimelock, initialSupply],
        value: 0,
      },
    ];
  } else if (hre.network.name === "bscmainnet") {
    console.log(`Adding a command to withdraw ${initialSupply} ${token.symbol} to Timelock`);
    return [
      {
        contract: preconfiguredAddresses.VTreasury,
        signature: "withdrawTreasuryBep20(address,uint256,address)",
        argTypes: ["address", "uint256", "address"],
        parameters: [tokenContract.address, initialSupply, preconfiguredAddresses.NormalTimelock],
        value: 0,
      },
    ];
  }
  return [];
};

const approvePoolRegistry = async (
  poolRegistry: PoolRegistry,
  vTokenConfig: VTokenConfig,
  deploymentConfig: DeploymentConfig,
): Promise<GovernanceCommand[]> => {
  const { tokensConfig } = deploymentConfig;
  const { asset, initialSupply } = vTokenConfig;
  const token = getTokenConfig(asset, tokensConfig);
  const tokenContract = await getUnderlyingToken(token.symbol, tokensConfig);

  console.log(`Adding a command to approve ${initialSupply} ${token.symbol} to PoolRegistry`);
  return [
    {
      contract: tokenContract.address,
      signature: "approve(address,uint256)",
      argTypes: ["address", "uint256"],
      parameters: [poolRegistry.address, initialSupply],
      value: 0,
    },
  ];
};

const addMarket = async (
  poolRegistry: PoolRegistry,
  vTokenAddress: string,
  vTokenConfig: VTokenConfig,
  hre: HardhatRuntimeEnvironment,
): Promise<GovernanceCommand> => {
  const { name, collateralFactor, liquidationThreshold, initialSupply, supplyCap, borrowCap } = vTokenConfig;
  console.log("Adding a command to register " + name + " to PoolRegistry");
  const receiver = await toAddress(vTokenConfig.vTokenReceiver, hre);
  return {
    contract: poolRegistry.address,
    signature: "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
    argTypes: ["tuple(address, uint256, uint256, uint256, address, uint256, uint256)"],
    parameters: [
      [vTokenAddress, collateralFactor, liquidationThreshold, initialSupply, receiver, supplyCap, borrowCap],
    ],
    value: 0,
  };
};

const addMarkets = async (
  unregisteredVTokens: PoolConfig[],
  deploymentConfig: DeploymentConfig,
  hre: HardhatRuntimeEnvironment,
) => {
  const poolRegistry = await ethers.getContract<PoolRegistry>("PoolRegistry");
  const poolCommands = await Promise.all(
    unregisteredVTokens.map(async (pool: PoolConfig) => {
      const vTokenCommands = await Promise.all(
        pool.vtokens.map(async (vTokenConfig: VTokenConfig) => {
          const { name, symbol } = vTokenConfig;

          const vToken = await ethers.getContract(`VToken_${symbol}`);

          console.log("Adding market " + name + " to pool " + pool.name);
          return [
            ...(await transferInitialLiquidity(vTokenConfig, deploymentConfig, hre)),
            ...(await approvePoolRegistry(poolRegistry, vTokenConfig, deploymentConfig)),
            await addMarket(poolRegistry, vToken.address, vTokenConfig, hre),
          ];
        }),
      );
      return vTokenCommands.flat();
    }),
  );
  return poolCommands.flat();
};

const configureAccessControls = async (deploymentConfig: DeploymentConfig, hre: HardhatRuntimeEnvironment) => {
  const { accessControlConfig, preconfiguredAddresses } = deploymentConfig;
  const accessControlManager = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );
  return await Promise.all(
    accessControlConfig.map(async (entry: AccessControlEntry) => {
      const { caller, target, method } = entry;
      const callerAddress = await toAddress(caller, hre);
      const targetAddress = await toAddress(target, hre);
      return {
        contract: accessControlManager,
        signature: "giveCallPermission(address,string,address)",
        argTypes: ["address", "string", "address"],
        parameters: [targetAddress, method, callerAddress],
        value: 0,
      };
    }),
  );
};

const logCommand = (prefix: string, command: GovernanceCommand) => {
  const valueStr = command.value == 0 ? "" : "{ value: " + parseEther(command.value.toString()) + " }";
  console.log(`${prefix} ${command.contract}.${command.signature}${valueStr} (`);
  command.parameters.forEach((param: any) => console.log(`  ${param},`));
  console.log(")");
};

const executeCommands = async (commands: GovernanceCommand[], hre: HardhatRuntimeEnvironment) => {
  for (const command of commands) {
    logCommand("Executing", command);
    const methodId = ethers.utils.id(command.signature).substring(0, 10);
    const encodedArgs = defaultAbiCoder.encode(command.argTypes, command.parameters);
    const txdata = methodId + encodedArgs.substring(2);
    const { deployer } = await hre.getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    const tx = await signer.sendTransaction({
      to: command.contract,
      data: txdata,
      value: command.value,
    });
    await tx.wait();
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const deploymentConfig = await getConfig(hre.network.name);
  const { poolConfig, preconfiguredAddresses } = deploymentConfig;

  const unregisteredPools = await getUnregisteredPools(poolConfig, hre);
  const unregisteredVTokens = await getUnregisteredVTokens(poolConfig, hre);
  const unregisteredRewardsDistributors = await getUnregisteredRewardsDistributors(poolConfig, hre);
  const commands = [
    ...(await configureAccessControls(deploymentConfig, hre)),
    ...(await acceptOwnership("PoolRegistry", hre)),
    ...(await addPools(unregisteredPools, hre)),
    ...(await addMarkets(unregisteredVTokens, deploymentConfig, hre)),
    ...(await configureRewards(unregisteredRewardsDistributors, hre)),
  ];

  const proposalActions = toProposalActions(commands);
  console.log("targets", proposalActions.targets);
  console.log("signatures", proposalActions.signatures);
  console.log("calldatas", proposalActions.calldatas);
  console.log("values", proposalActions.values);

  if (hre.network.live) {
    const governorBravo = await ethers.getContractAt("GovernorBravoDelegate", preconfiguredAddresses.GovernorBravo);
    const NORMAL_VIP = 0;
    const meta = {
      version: "v2",
      title: "Isolated lending, phase 1",
      description: ``,
      forDescription: "I agree that Venus Protocol should proceed with IL Phase 1",
      againstDescription: "I do not think that Venus Protocol should proceed with IL Phase 1",
      abstainDescription: "I am indifferent to whether Venus Protocol proceeds with IL Phase 1",
    };
    const signer = await ethers.getSigner(deployer);
    const tx = await governorBravo
      .connect(signer)
      .propose(
        proposalActions.targets,
        proposalActions.values,
        proposalActions.signatures,
        proposalActions.calldatas,
        JSON.stringify(meta),
        NORMAL_VIP,
      );
    await tx.wait();
  } else {
    await executeCommands(commands, hre);
  }
};

func.tags = ["VIP", "il"];

export default func;

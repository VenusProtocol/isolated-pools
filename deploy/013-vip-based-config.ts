import { BigNumberish } from "ethers";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";
import { deployments, ethers, network } from "hardhat";
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
import { AccessControlManager, Comptroller, PoolRegistry, RewardsDistributor } from "../typechain";

interface GovernanceCommand {
  contract: string;
  signature: string;
  argTypes: string[];
  parameters: any[];
  value: BigNumberish;
}

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
  owner: string,
): Promise<GovernanceCommand[]> => {
  const commands = await Promise.all(
    unregisteredRewardDistributors.map(async (pool: PoolConfig) => {
      const rewards = pool.rewards || [];
      const poolCommands = await Promise.all(
        rewards.map(async (rewardConfig: RewardConfig, idx: number) => {
          const contractName = `RewardsDistributor_${pool.id}_${idx}`;
          const rewardsDistributor = await ethers.getContract<RewardsDistributor>(contractName);
          return [
            ...(await acceptOwnership(contractName, owner)),
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

const acceptOwnership = async (contractName: string, targetOwner: string): Promise<GovernanceCommand[]> => {
  if (!network.live) {
    return [];
  }
  const abi = ["function owner() view returns (address)"];
  const deployment = await deployments.get(contractName);
  const contract = await ethers.getContractAt(abi, deployment.address);
  if ((await contract.owner()) === targetOwner) {
    return [];
  }
  console.log(`Adding a command to accept the admin rights over ${contractName}`);
  return [
    {
      contract: deployment.address,
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

const addPools = async (unregisteredPools: PoolConfig[], poolsOwner: string): Promise<GovernanceCommand[]> => {
  const poolRegistry = await ethers.getContract<PoolRegistry>("PoolRegistry");
  const commands = await Promise.all(
    unregisteredPools.map(async (pool: PoolConfig) => {
      const comptroller = await ethers.getContract<Comptroller>(`Comptroller_${pool.id}`);
      return [
        ...(await acceptOwnership(`Comptroller_${pool.id}`, poolsOwner)),
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
): Promise<GovernanceCommand[]> => {
  if (!network.live) {
    return [];
  }
  const { preconfiguredAddresses, tokensConfig } = deploymentConfig;
  const { asset, initialSupply } = vTokenConfig;
  const token = getTokenConfig(asset, tokensConfig);
  const tokenContract = await getUnderlyingToken(token.symbol, tokensConfig);
  console.log(`Adding a command to withdraw ${initialSupply} ${token.symbol} to Timelock from Treasury`);
  return [
    {
      contract: preconfiguredAddresses.VTreasury,
      signature: "withdrawTreasuryToken(address,uint256,address)",
      argTypes: ["address", "uint256", "address"],
      parameters: [tokenContract.address, initialSupply, preconfiguredAddresses.NormalTimelock],
      value: 0,
    },
  ];
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

  console.log(`Adding commands to approve ${initialSupply} ${token.symbol} to PoolRegistry`);
  return [
    {
      contract: tokenContract.address,
      signature: "approve(address,uint256)",
      argTypes: ["address", "uint256"],
      parameters: [poolRegistry.address, 0],
      value: 0,
    },
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
): Promise<GovernanceCommand> => {
  const { name, collateralFactor, liquidationThreshold, initialSupply, supplyCap, borrowCap } = vTokenConfig;
  console.log("Adding a command to register " + name + " to PoolRegistry");
  const receiver = await toAddress(vTokenConfig.vTokenReceiver);
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

const setReduceReservesBlockDelta = async (
  vTokenAddress: string,
  vTokenConfig: VTokenConfig,
): Promise<GovernanceCommand> => {
  const { name, reduceReservesBlockDelta } = vTokenConfig;
  console.log("Adding a command to set reduce reserves blcok delta to " + name);
  return {
    contract: vTokenAddress,
    signature: "setReduceReservesBlockDelta(uint256)",
    argTypes: ["uint256"],
    parameters: [reduceReservesBlockDelta],
    value: 0,
  };
};

const addMarkets = async (unregisteredVTokens: PoolConfig[], deploymentConfig: DeploymentConfig) => {
  const poolRegistry = await ethers.getContract<PoolRegistry>("PoolRegistry");
  const poolCommands = await Promise.all(
    unregisteredVTokens.map(async (pool: PoolConfig) => {
      const vTokenCommands = await Promise.all(
        pool.vtokens.map(async (vTokenConfig: VTokenConfig) => {
          const { name, symbol } = vTokenConfig;

          const vToken = await ethers.getContract(`VToken_${symbol}`);

          console.log("Adding market " + name + " to pool " + pool.name);
          return [
            ...(await transferInitialLiquidity(vTokenConfig, deploymentConfig)),
            ...(await approvePoolRegistry(poolRegistry, vTokenConfig, deploymentConfig)),
            await setReduceReservesBlockDelta(vToken.address, vTokenConfig),
            await addMarket(poolRegistry, vToken.address, vTokenConfig),
          ];
        }),
      );
      return vTokenCommands.flat();
    }),
  );
  return poolCommands.flat();
};

const makeRole = (mainnetBehavior: boolean, targetContract: string, method: string): string => {
  if (mainnetBehavior && targetContract === ethers.constants.AddressZero) {
    return ethers.utils.keccak256(
      ethers.utils.solidityPack(["bytes32", "string"], [ethers.constants.HashZero, method]),
    );
  }
  return ethers.utils.keccak256(ethers.utils.solidityPack(["address", "string"], [targetContract, method]));
};

const hasPermission = async (
  accessControl: AccessControlManager,
  targetContract: string,
  method: string,
  caller: string,
): Promise<boolean> => {
  const role = makeRole(network.live, targetContract, method);
  return accessControl.hasRole(role, caller);
};

const configureAccessControls = async (deploymentConfig: DeploymentConfig): Promise<GovernanceCommand[]> => {
  const { accessControlConfig, preconfiguredAddresses } = deploymentConfig;
  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );
  const accessControlManager = await ethers.getContractAt<AccessControlManager>(
    "AccessControlManager",
    accessControlManagerAddress,
  );
  const commands = await Promise.all(
    accessControlConfig.map(async (entry: AccessControlEntry) => {
      const { caller, target, method } = entry;
      const callerAddress = await toAddress(caller);
      const targetAddress = await toAddress(target);
      if (await hasPermission(accessControlManager, targetAddress, method, callerAddress)) {
        return [];
      }
      return [
        {
          contract: accessControlManagerAddress,
          signature: "giveCallPermission(address,string,address)",
          argTypes: ["address", "string", "address"],
          parameters: [targetAddress, method, callerAddress],
          value: 0,
        },
      ];
    }),
  );
  return commands.flat();
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
  const deploymentConfig = await getConfig(hre.getNetworkName());
  const { poolConfig, preconfiguredAddresses } = deploymentConfig;

  const unregisteredPools = await getUnregisteredPools(poolConfig);
  const unregisteredVTokens = await getUnregisteredVTokens(poolConfig);
  const unregisteredRewardsDistributors = await getUnregisteredRewardsDistributors(poolConfig);
  const owner = preconfiguredAddresses.NormalTimelock || deployer;
  const commands = [
    ...(await configureAccessControls(deploymentConfig)),
    ...(await acceptOwnership("PoolRegistry", owner)),
    ...(await addPools(unregisteredPools, owner)),
    ...(await addMarkets(unregisteredVTokens, deploymentConfig)),
    ...(await configureRewards(unregisteredRewardsDistributors, owner)),
  ];

  if (hre.network.live) {
    console.log("Please propose a VIP with the following commands:");
    console.log(
      JSON.stringify(
        commands.map(c => ({ target: c.contract, signature: c.signature, params: c.parameters, value: c.value })),
      ),
    );
  } else {
    await executeCommands(commands, hre);
  }
};

func.tags = ["VIP", "il"];

export default func;

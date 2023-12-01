import GovernanceBscMainnet from "@venusprotocol/governance-contracts/deployments/bscmainnet.json";
import GovernanceBscTestnet from "@venusprotocol/governance-contracts/deployments/bsctestnet.json";

// TESTNET DEPLOYED CONTRACTS
import { contracts as MainnetContracts } from "../../../deployments/bscmainnet.json";
// MAINNET DEPLOYED CONTRACTS
import { contracts as TestnetContracts } from "../../../deployments/bsctestnet.json";

export const contractAddreseses = {
  sepolia: {
    ADMIN: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    ACM: "0x92587A8799CaC6C0A5184218c050B3E19790ac0B",
    TOKEN1: "0x16ffae6A9b4DcDb4a626Ee35721Aa748F0902D9C", // DAI
    TOKEN2: "0xA33524BeFb504152EFBfB4433501D42BCA90e704", // HAY
    VTOKEN1: "0x7fD0b5fCb967D92BcD8BD5d049919D8D76ADC6f7",
    VTOKEN2: "0x90d2c73D861f53d62358b34f9617FE3f3dC3Bea3",
    COMPTROLLER: "0x289A29573a41D3A181F4Ca238f6967FbDF792D10",
    PSR: "0xcF567bb527ed46969a486DD67a6ba682afA6dcd5",
    SHORTFALL: "0x43745820F84caDCf281C5272CA5bf4f1138E8a42",
    RISKFUND: "0x908607f2649fc5176C502bf4BFf49CD41d4e58cc",
    REWARD_DISTRIBUTOR1: "0x4330074c070AaE192b6fffcB610A6B891B8Ee3Da",
    POOL_REGISTRY: "0x71Ba41E3Ec4e68a02A3F58Bd7829f8B38688439d",
    CHAINLINK_ORACLE: "0xEdaB2b65fD3413d89b6D2a3AeB61E0c9eECA6A76",
    RESILIENT_ORACLE: "0xd44B364a28386a2aa4Df1C54EA32deF3B2b98EeC",
    SWAP_ROUTER_CORE_POOL: "0x83edf1deE1B730b7e8e13C00ba76027D63a51ac0", // picked from bscmainnet
    TREASURY: "0xF5b8d3eD8F666956223ea1618B9680416F3dA936",
    TOKEN2_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    TOKEN1_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    ACC1: "0x3Ac99C7853b58f4AA38b309D372562a5A88bB9C1",
    ACC2: "0xA4a04C2D661bB514bB8B478CaCB61145894563ef",
    ACC3: "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3",
    BLOCK_NUMBER: 4794360,
  },
  bsctestnet: {
    ADMIN: GovernanceBscTestnet.contracts.NormalTimelock.address,
    ACM: GovernanceBscTestnet.contracts.AccessControlManager.address,
    TOKEN1: TestnetContracts.MockUSDD.address,
    TOKEN2: TestnetContracts.MockHAY.address,
    VTOKEN1: TestnetContracts.VToken_vUSDD_StableCoins.address,
    VTOKEN2: TestnetContracts.VToken_vHAY_StableCoins.address,
    VUSDT: TestnetContracts.VToken_vUSDT_StableCoins.address,
    COMPTROLLER: TestnetContracts.Comptroller_StableCoins.address,
    PSR: TestnetContracts.ProtocolShareReserve.address,
    SHORTFALL: TestnetContracts.Shortfall.address,
    RISKFUND: TestnetContracts.RiskFund.address,
    REWARD_DISTRIBUTOR1: TestnetContracts.RewardsDistributor_StableCoins_0.address,
    POOL_REGISTRY: TestnetContracts.PoolRegistry.address,
    RESILIENT_ORACLE: TestnetContracts.ResilientOracle.address,
    CHAINLINK_ORACLE: TestnetContracts.ChainlinkOracle.address,
    BINANCE_ORACLE: TestnetContracts.BinanceOracle.address,
    SWAP_ROUTER_CORE_POOL: TestnetContracts.SwapRouterCorePool.address,
    USDT: TestnetContracts.USDT.address,
    TREASURY: TestnetContracts.VTreasury.address,
    TOKEN1_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    TOKEN2_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    USDT_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    ACC1: "0xe70898180a366F204AA529708fB8f5052ea5723c",
    ACC2: "0xA4a04C2D661bB514bB8B478CaCB61145894563ef",
    ACC3: "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3",
    BLOCK_NUMBER: 34678080,
  },
  bscmainnet: {
    ADMIN: GovernanceBscMainnet.contracts.NormalTimelock.address,
    ACM: GovernanceBscMainnet.contracts.AccessControlManager.address,
    VTOKEN1: MainnetContracts.VToken_vUSDD_Stablecoins.address,
    VTOKEN2: MainnetContracts.VToken_vHAY_Stablecoins.address,
    VUSDT: MainnetContracts.VToken_vUSDT_Stablecoins.address,
    COMPTROLLER: MainnetContracts.Comptroller_Stablecoins.address,
    PSR: MainnetContracts.ProtocolShareReserve.address,
    SHORTFALL: MainnetContracts.Shortfall.address,
    RISKFUND: MainnetContracts.RiskFund.address,
    REWARD_DISTRIBUTOR1: MainnetContracts.RewardsDistributor_Stablecoins_0.address,
    POOL_REGISTRY: MainnetContracts.PoolRegistry.address,
    RESILIENT_ORACLE: MainnetContracts.ResilientOracle.address,
    CHAINLINK_ORACLE: MainnetContracts.ChainlinkOracle.address,
    BINANCE_ORACLE: MainnetContracts.BinanceOracle.address,
    SWAP_ROUTER_CORE_POOL: MainnetContracts.SwapRouterCorePool.address,
    USDT: MainnetContracts.USDT.address,
    TREASURY: MainnetContracts.VTreasury.address,
    TOKEN1: "0xd17479997F34dd9156Deef8F95A52D81D265be9c", // USDD
    TOKEN2: "0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5", // HAY
    TOKEN1_HOLDER: "0x53f78A071d04224B8e254E243fFfc6D9f2f3Fa23",
    TOKEN2_HOLDER: "0x09702Ea135d9D707DD51f530864f2B9220aAD87B",
    USDT_HOLDER: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
    ACC1: "0x3Ac99C7853b58f4AA38b309D372562a5A88bB9C1",
    ACC2: "0xA4a04C2D661bB514bB8B478CaCB61145894563ef",
    ACC3: "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3",
    BLOCK_NUMBER: 33966470,
  },
};

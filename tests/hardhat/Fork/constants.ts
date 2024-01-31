import GovernanceBscMainnet from "@venusprotocol/governance-contracts/deployments/bscmainnet.json";
import GovernanceBscTestnet from "@venusprotocol/governance-contracts/deployments/bsctestnet.json";
import GovernanceEthMainnet from "@venusprotocol/governance-contracts/deployments/ethereum.json";
import GovernanceSepTestnet from "@venusprotocol/governance-contracts/deployments/sepolia.json";
import OracleBscMainnet from "@venusprotocol/oracle/deployments/bscmainnet.json";
import OracleBscTestnet from "@venusprotocol/oracle/deployments/bsctestnet.json";
import OracleEthMainnet from "@venusprotocol/oracle/deployments/ethereum.json";
import OracleSepTestnet from "@venusprotocol/oracle/deployments/sepolia.json";
import PsrBscMainnet from "@venusprotocol/protocol-reserve/deployments/bscmainnet.json";
import PsrBscTestnet from "@venusprotocol/protocol-reserve/deployments/bsctestnet.json";
import PsrSepTestnet from "@venusprotocol/protocol-reserve/deployments/sepolia.json";
import CoreBscMainnet from "@venusprotocol/venus-protocol/deployments/bscmainnet.json";
import CoreBscTestnet from "@venusprotocol/venus-protocol/deployments/bsctestnet.json";
import CoreEthMainnet from "@venusprotocol/venus-protocol/deployments/ethereum.json";

import { contracts as MainnetContracts } from "../../../deployments/bscmainnet.json";
import { contracts as TestnetContracts } from "../../../deployments/bsctestnet.json";
import { contracts as EthereumContracts } from "../../../deployments/ethereum.json";
import { contracts as SepoliaContracts } from "../../../deployments/sepolia.json";

export const contractAddreseses = {
  sepolia: {
    ADMIN: "0x94fa6078b6b8a26F0B6EDFFBE6501B22A10470fB",
    ACM: GovernanceSepTestnet.contracts.AccessControlManager.address,
    TOKEN1: SepoliaContracts.MockcrvUSD.address, // crvUSD
    TOKEN2: SepoliaContracts.MockCRV.address, // CRV
    VTOKEN1: SepoliaContracts.VToken_vcrvUSD_Core.address,
    VTOKEN2: SepoliaContracts.VToken_vCRV_Core.address,
    COMPTROLLER: SepoliaContracts.Comptroller_Core.address,
    PSR: PsrSepTestnet.contracts.ProtocolShareReserve.address,
    SHORTFALL: "",
    RISKFUND: "",
    REWARD_DISTRIBUTOR1: SepoliaContracts.RewardsDistributor_Core_3.address,
    POOL_REGISTRY: SepoliaContracts.PoolRegistry.address,
    CHAINLINK_ORACLE: OracleSepTestnet.contracts.ChainlinkOracle.address,
    RESILIENT_ORACLE: OracleSepTestnet.contracts.ResilientOracle.address,
    SWAP_ROUTER_CORE_POOL: "0x83edf1deE1B730b7e8e13C00ba76027D63a51ac0", // picked from bscmainnet
    TOKEN1_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    TOKEN2_HOLDER: "0x02EB950C215D12d723b44a18CfF098C6E166C531",
    ACC1: "0x3Ac99C7853b58f4AA38b309D372562a5A88bB9C1",
    ACC2: "0xA4a04C2D661bB514bB8B478CaCB61145894563ef",
    ACC3: "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3",
    BLOCK_NUMBER: 5184120,
  },
  ethereum: {
    ADMIN: "0x285960C5B22fD66A736C7136967A3eB15e93CC67",
    ACM: GovernanceEthMainnet.contracts.AccessControlManager.address,
    TOKEN1: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E", // crvUSD
    TOKEN2: "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
    VTOKEN1: EthereumContracts.VToken_vcrvUSD_Curve.address,
    VTOKEN2: EthereumContracts.VToken_vCRV_Curve.address,
    COMPTROLLER: EthereumContracts.Comptroller_Curve.address,
    PSR: CoreEthMainnet.contracts.VTreasuryV8.address, // treasury
    SHORTFALL: "",
    RISKFUND: "",
    REWARD_DISTRIBUTOR1: "",
    POOL_REGISTRY: EthereumContracts.PoolRegistry.address,
    CHAINLINK_ORACLE: OracleEthMainnet.contracts.ChainlinkOracle.address,
    RESILIENT_ORACLE: OracleEthMainnet.contracts.ResilientOracle.address,
    SWAP_ROUTER_CORE_POOL: "",
    TOKEN1_HOLDER: "0xCD9054a152b817C0098fF57c7a407a66736Ef812",
    TOKEN2_HOLDER: "0x28C6c06298d514Db089934071355E5743bf21d60",
    ACC1: "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
    ACC2: "0x29182006a4967e9a50C0A66076dA514993D3B4D4",
    ACC3: "0xa27CEF8aF2B6575903b676e5644657FAe96F491F",
    BLOCK_NUMBER: 19117880,
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
    PSR: PsrBscTestnet.contracts.ProtocolShareReserve.address,
    SHORTFALL: TestnetContracts.Shortfall.address,
    RISKFUND: TestnetContracts.RiskFund.address,
    REWARD_DISTRIBUTOR1: TestnetContracts.RewardsDistributor_StableCoins_0.address,
    POOL_REGISTRY: TestnetContracts.PoolRegistry.address,
    RESILIENT_ORACLE: OracleBscTestnet.contracts.ResilientOracle.address,
    CHAINLINK_ORACLE: OracleBscTestnet.contracts.ChainlinkOracle.address,
    BINANCE_ORACLE: OracleBscTestnet.contracts.BinanceOracle.address,
    SWAP_ROUTER_CORE_POOL: CoreBscTestnet.contracts.SwapRouterCorePool.address,
    USDT: CoreBscTestnet.contracts.USDT.address,
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
    PSR: PsrBscMainnet.contracts.ProtocolShareReserve.address,
    SHORTFALL: MainnetContracts.Shortfall.address,
    RISKFUND: MainnetContracts.RiskFund.address,
    REWARD_DISTRIBUTOR1: MainnetContracts.RewardsDistributor_Stablecoins_0.address,
    POOL_REGISTRY: MainnetContracts.PoolRegistry.address,
    RESILIENT_ORACLE: OracleBscMainnet.contracts.ResilientOracle.address,
    CHAINLINK_ORACLE: OracleBscMainnet.contracts.ChainlinkOracle.address,
    BINANCE_ORACLE: OracleBscMainnet.contracts.BinanceOracle.address,
    SWAP_ROUTER_CORE_POOL: CoreBscMainnet.contracts.SwapRouterCorePool.address,
    USDT: CoreBscMainnet.contracts.USDT.address,
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

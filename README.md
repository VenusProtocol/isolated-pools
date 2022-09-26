# Venus Isolated Pools

### Compound Fork Commit

https://github.com/compound-finance/compound-protocol/tree/a3214f67b73310d547e00fc578e8355911c9d376

### Prerequisites

* NodeJS - 12.x
* Solc - v0.8.13 (https://github.com/ethereum/solidity/releases/tag/v0.8.13)

### Installing

```
yarn install
```

### Run Tests

```
yarn test
yarn hardhat:test
```
* To run fork tests add FORK_MAINNET=true and QUICK_NODE_KEY in the .env file.

### Hardhat Commands

```
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix

MNEMONIC="<>" BSC_API_KEY="<>" npx hardhat run ./script/hardhat/deploy.ts --network testnet

MNEMONIC="<>" BSC_API_KEY="<>" npx hardhat run ./script/hardhat/run/deployOracleProxy.ts --network testnet
```

Current Oracle Proxy Address: 0x345Dfb0554ee638a595eE36F4545192524F8D6D7
Txns: https://testnet.bscscan.com/address/0xb54c8fcf22de29ee1a1a9a78c4465b7d8ed42a8f, https://testnet.bscscan.com/address/0xd88ec1fe1bad482b52464f436141b9bf69a24bb4, https://testnet.bscscan.com/address/0x345dfb0554ee638a595ee36f4545192524f8d6d7

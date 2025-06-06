## [4.3.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0...v4.3.0-dev.1) (2025-06-03)


### Features

* add a contract to resolve wUSDM incident ([9327fb2](https://github.com/VenusProtocol/isolated-pools/commit/9327fb233ea495f60052d96fdbbd106002217d30))
* add a function to sweep tokens from the contract ([8efdb54](https://github.com/VenusProtocol/isolated-pools/commit/8efdb540d763c05f2c2fbb0352b35174095446ca))
* add wusdm and temp comptroller impl deployments ([4acbe3e](https://github.com/VenusProtocol/isolated-pools/commit/4acbe3e0545b35b27013325a91d9d2346465fcbe))
* adjust the test cases for block [#59265626](https://github.com/VenusProtocol/isolated-pools/issues/59265626) ([0c7461c](https://github.com/VenusProtocol/isolated-pools/commit/0c7461c10194159d86476812c75eafcec4bf1774))
* deployed contracts ([7429f11](https://github.com/VenusProtocol/isolated-pools/commit/7429f11fd75e10250cd864229a76d804e6f5837b))
* protect run() with owner restriction ([c57bbf0](https://github.com/VenusProtocol/isolated-pools/commit/c57bbf0ec66f606ede845a3d7820cffcbecbd410))
* redeploy WUSDMLiquidator with the new A2 liquidation logic ([b8c4f25](https://github.com/VenusProtocol/isolated-pools/commit/b8c4f2539c7089bd4c1116771cad54d740e8673b))
* remove exploiter liquidation code ([a8212e3](https://github.com/VenusProtocol/isolated-pools/commit/a8212e3c644008929835e988265998ddebee8e22))
* save original configuration in storage ([f009c03](https://github.com/VenusProtocol/isolated-pools/commit/f009c038b54f5df4c9d616a25adafdc7d1f6c08c))
* transferred ownership to NT ([74ed2f2](https://github.com/VenusProtocol/isolated-pools/commit/74ed2f2f96ce31df2626bb7e81e1b8918d1ffb5e))
* updating deployment files ([58c7653](https://github.com/VenusProtocol/isolated-pools/commit/58c7653380db33bf7db375e41e1672b04934fcea))
* updating deployment files ([5a53f78](https://github.com/VenusProtocol/isolated-pools/commit/5a53f78fc0ffb2bfe1eb009f3ca3fc25fe189952))
* updating deployment files ([320c447](https://github.com/VenusProtocol/isolated-pools/commit/320c447e2d58c127c3784441378f1f10f4a861fd))
* updating deployment files ([c0e15ae](https://github.com/VenusProtocol/isolated-pools/commit/c0e15aeda0f16ede7d26e25a23009d97b2a1bf94))


### Bug Fixes

* added config ([6e5c816](https://github.com/VenusProtocol/isolated-pools/commit/6e5c81693266f6da6d7f7e8055b538661ed62da1))
* impersonate accounts using JsonRpcProvider ([6d09410](https://github.com/VenusProtocol/isolated-pools/commit/6d0941072e4ddffcbfc612248d0d82b0be342111))
* liquidate what we can for A2, keep the rest as A2 debt ([282d208](https://github.com/VenusProtocol/isolated-pools/commit/282d2088fb04c014460bcc07fefbcc3b24481218))
* merge conflict ([72e4da5](https://github.com/VenusProtocol/isolated-pools/commit/72e4da5ff1983267ccdff4bab061f9d4741ed8b5))
* revert Comptroller changes ([5fd76d7](https://github.com/VenusProtocol/isolated-pools/commit/5fd76d7451f50e0fc81c978eae32aac50e2d89db))
* skip wusdm liquidator for unnecessary networlks ([94bda33](https://github.com/VenusProtocol/isolated-pools/commit/94bda33959f4cb084bdea3488b64c06fca3da21f))
* test ([024b6fd](https://github.com/VenusProtocol/isolated-pools/commit/024b6fdb35107b6cca624ad7015a1e54105ffbae))
* use explicit nonces for impersonated signers ([89fb697](https://github.com/VenusProtocol/isolated-pools/commit/89fb6973f906a18979a4daefb7d661b659f96361))

## [4.2.0](https://github.com/VenusProtocol/isolated-pools/compare/v4.1.0...v4.2.0) (2025-06-02)


### Features

* add a script to check interest rate models ([3d96a9c](https://github.com/VenusProtocol/isolated-pools/commit/3d96a9ca557098264fab1af58d426d3c35fe56de))
* add deployment scripts for checkpoint rate models ([b752ea8](https://github.com/VenusProtocol/isolated-pools/commit/b752ea8fc44d55e5ad59718921dc695ce84b1ce9))
* add deployments for sUSDe and USDe on ethereum ([190c018](https://github.com/VenusProtocol/isolated-pools/commit/190c01896adef13ed043f4af4ff7f471a0b3acb1))
* add deployments for sUSDe and USDe on sepolia ([3227327](https://github.com/VenusProtocol/isolated-pools/commit/3227327c92bc43a206a5d3c055d033bfd35a5afa))
* add mainnet deployments on BNB ([f5d102d](https://github.com/VenusProtocol/isolated-pools/commit/f5d102d0b200d4bec5ca33891dcbb69dd7900bda))
* add pool lens deployment on OPBNB with updated Block rate ([054233a](https://github.com/VenusProtocol/isolated-pools/commit/054233ace70965de86792b2dba277b142373c4e1))
* add poolLens deployments with updated block number ([da5e2e6](https://github.com/VenusProtocol/isolated-pools/commit/da5e2e644356f1f0970824797f2cae681a352a1f))
* add UNI deployments on unichain ([a9c6867](https://github.com/VenusProtocol/isolated-pools/commit/a9c6867cda1aa5765a031c4ae6227df7fe8e2be4))
* add UNI deployments on unichain mainnet ([a331b36](https://github.com/VenusProtocol/isolated-pools/commit/a331b36bb3cf930d3b453073d2d847b4455c1275))
* add weETH and wstETH deployments on unichain mainnet ([f5effc4](https://github.com/VenusProtocol/isolated-pools/commit/f5effc4fb600ef50b928092bca4cb6b72488452b))
* add weETH and wstETH deployments on unichain sepolia ([24ae1ab](https://github.com/VenusProtocol/isolated-pools/commit/24ae1ab6e06166af803ce9403b27ee98b012e536))
* add zkETH market on zkSync ([85276ca](https://github.com/VenusProtocol/isolated-pools/commit/85276caf823d1b7c609f21795a17dc9b355ef08d))
* deploy 21024000 blocks per year models to bnb chain ([d681c72](https://github.com/VenusProtocol/isolated-pools/commit/d681c72a26bed9518760d3a863cf2cfcec735521))
* deploy 63072000 blocks per year models to opbnb chain ([9a701a5](https://github.com/VenusProtocol/isolated-pools/commit/9a701a55b55be9a21999c8aa59d89ded04dcb1a0))
* deploy checkpoint rate models to bnb chain ([80e0b4d](https://github.com/VenusProtocol/isolated-pools/commit/80e0b4dfd4703f309988dafd7b2c736adbd35156))
* deploy checkpoint rate models to opbnb chain ([9f91aea](https://github.com/VenusProtocol/isolated-pools/commit/9f91aea5533d89a4c2e6e33cde37032f9d2e61a6))
* deploy mainnet asBNB market ([32b1c62](https://github.com/VenusProtocol/isolated-pools/commit/32b1c62c18bceb7a11ed896fb991b42792450d2b))
* deploy Reward distributor on unichain ([b3054b4](https://github.com/VenusProtocol/isolated-pools/commit/b3054b4001154c3538e543cf19bd80c832b40414))
* deploy vasBNB_LiquidStakedBNB ([26ff915](https://github.com/VenusProtocol/isolated-pools/commit/26ff9159328e6d4913a4938c1bede633dcaf06dc))
* deployed contracts ([a8a9ac0](https://github.com/VenusProtocol/isolated-pools/commit/a8a9ac00ed670fd979ecd7ebe4e5d621219b2085))
* deployed on mainnet ([2b7a3b8](https://github.com/VenusProtocol/isolated-pools/commit/2b7a3b835f6f479ac1d8330e04e561b5c8d1193e))
* deployed PT-clisBNB-24APR2025 market ([8f1aac9](https://github.com/VenusProtocol/isolated-pools/commit/8f1aac9d726f4b232f99d1aa5608045a282e4be2))
* deployment config for wstETH market on base and zksync chains ([85634ba](https://github.com/VenusProtocol/isolated-pools/commit/85634ba14ef4c153f6c0c9c3bafa3880542910d4))
* deployment files for interest rate model on unichain for UNI market ([61bf6da](https://github.com/VenusProtocol/isolated-pools/commit/61bf6daf44fa76c01c8e0cdce6c0a67786ee35a3))
* redeploy impls wrt to change in block rate ([8c08dbd](https://github.com/VenusProtocol/isolated-pools/commit/8c08dbd4bf1c645ce709e7b791c6f850a2e8229f))
* redeploy new vtoken impl ([63f042e](https://github.com/VenusProtocol/isolated-pools/commit/63f042e2e05c895a3394cea208073457ae8ca220))
* redeploy weETH and wstETH on unichain mainnet ([366f62d](https://github.com/VenusProtocol/isolated-pools/commit/366f62d0dd93a20335d4b02804c016f37ffa37e8))
* redeploy weETH and wstETH on unichain sepolia ([b720d30](https://github.com/VenusProtocol/isolated-pools/commit/b720d305afa12350b09089a90c7b7bc9ee62424d))
* redeployed mainnet contracts ([537f4a7](https://github.com/VenusProtocol/isolated-pools/commit/537f4a7764450ffd6af6b913c20a4069d0a7218e))
* reduce supply cap of zkETH following Chaos Labs recommendations ([946f19a](https://github.com/VenusProtocol/isolated-pools/commit/946f19a6718db6655f5e1f2557a4d9f30ac90238))
* revert shortfall implemetation deployment ([7bc8ffc](https://github.com/VenusProtocol/isolated-pools/commit/7bc8ffc11fc8a25353745b797b8f4f0c1ec0274e))
* reward distributor on unichainsepolia ([002d052](https://github.com/VenusProtocol/isolated-pools/commit/002d0527bce24aba1d1322fc1737362ca786ca89))
* update DEFAULT_BLOCKS_PER_YEAR & prime tests ([75b87ab](https://github.com/VenusProtocol/isolated-pools/commit/75b87ab8f364d83f57bb427218e5788be6c8210f))
* update dependencies ([742ef56](https://github.com/VenusProtocol/isolated-pools/commit/742ef5604163eceb5b79dd08c8c9e6a542e3d3b6))
* updating deployment files ([cb769a9](https://github.com/VenusProtocol/isolated-pools/commit/cb769a93d538760773e0a7389d61e14f8a1b1384))
* updating deployment files ([743ff5e](https://github.com/VenusProtocol/isolated-pools/commit/743ff5ea7ec0434a054f7bf00f4b165cf02b79e5))
* updating deployment files ([f03aa40](https://github.com/VenusProtocol/isolated-pools/commit/f03aa40b5c567002e54902d8546034977bf17168))
* updating deployment files ([732c020](https://github.com/VenusProtocol/isolated-pools/commit/732c0205a649ca244fde6ef01073f3d3ac7014c8))
* updating deployment files ([bbcfbbc](https://github.com/VenusProtocol/isolated-pools/commit/bbcfbbcc2e34fe1b69b858fd0276f3e246f3ec52))
* updating deployment files ([c1204b0](https://github.com/VenusProtocol/isolated-pools/commit/c1204b0695934cc6b39f2a53528acfb24428bd95))
* updating deployment files ([3fe67a8](https://github.com/VenusProtocol/isolated-pools/commit/3fe67a8d15c09c79ba97dc469de79d97af2c5d0d))
* updating deployment files ([07732cb](https://github.com/VenusProtocol/isolated-pools/commit/07732cbfd757f6401072f2b8c630c89c9806dc86))
* updating deployment files ([71bc4ea](https://github.com/VenusProtocol/isolated-pools/commit/71bc4ea26ff6cda9689a283575cd5261f1e4e44b))
* updating deployment files ([1caa73b](https://github.com/VenusProtocol/isolated-pools/commit/1caa73be5b6850d1d6297faf301d0b713e702419))
* updating deployment files ([fd26098](https://github.com/VenusProtocol/isolated-pools/commit/fd26098a083754e64ee2d77fc32eb782be6627d7))
* updating deployment files ([8056d6f](https://github.com/VenusProtocol/isolated-pools/commit/8056d6f2a741abf052758ad7e1b350ea8ad9c348))
* updating deployment files ([555cd98](https://github.com/VenusProtocol/isolated-pools/commit/555cd9851c95e773e7a094375d38970935bbfb0e))
* updating deployment files ([1336b3e](https://github.com/VenusProtocol/isolated-pools/commit/1336b3e6974f67d32aeec5d44ee3b3859ee8d662))
* updating deployment files ([91613e1](https://github.com/VenusProtocol/isolated-pools/commit/91613e16992a5e22d02194f5d7c24ea65cec6610))
* updating deployment files ([38b5b0e](https://github.com/VenusProtocol/isolated-pools/commit/38b5b0eeb61292bbf81a536eff8d96c082e372b0))
* updating deployment files ([8bb83b5](https://github.com/VenusProtocol/isolated-pools/commit/8bb83b5c678080b1cd9a45ef4966c11d54c01fa4))
* updating deployment files ([6164026](https://github.com/VenusProtocol/isolated-pools/commit/616402673b47c7a58a5b5c766aa585f038628bd4))
* updating deployment files ([d2bd4d8](https://github.com/VenusProtocol/isolated-pools/commit/d2bd4d8abd2436702cbaeaf0a9b1cb8b43f750b0))
* updating deployment files ([5b4417e](https://github.com/VenusProtocol/isolated-pools/commit/5b4417e4e4dc7df57422313b64ba633de647bf2a))
* updating deployment files ([7d60e0b](https://github.com/VenusProtocol/isolated-pools/commit/7d60e0b3d938ed2323ec5d32c7d3c4644b89c0b7))
* updating deployment files ([ec2017f](https://github.com/VenusProtocol/isolated-pools/commit/ec2017fb53f9d1f9121cf7cde4d78d8f781652e5))
* updating deployment files ([40ea277](https://github.com/VenusProtocol/isolated-pools/commit/40ea2776b3d89fdbe718e39da304ef8539522392))
* updating deployment files ([70fd1b7](https://github.com/VenusProtocol/isolated-pools/commit/70fd1b705848ca13c0bd7a006ae5483f964852fd))
* updating deployment files ([c4aca78](https://github.com/VenusProtocol/isolated-pools/commit/c4aca78a13ce95dd0318aeb4523d84be4c5ffe8c))
* updating deployment files ([0b66d46](https://github.com/VenusProtocol/isolated-pools/commit/0b66d462ed0f8856b7b13b4bc2a08207d7a71896))
* updating deployment files ([3d35cc9](https://github.com/VenusProtocol/isolated-pools/commit/3d35cc959a34646ecf9f7f20de1833b9d93b0435))
* updating deployment files ([509c44e](https://github.com/VenusProtocol/isolated-pools/commit/509c44ea8011266facd622fe444a827de2b53f76))
* updating deployment files ([a21dde7](https://github.com/VenusProtocol/isolated-pools/commit/a21dde79fdc7fe519be5370596ab5d0b87ca1435))
* vtoken and jump rate model deployment files for wstETH on zksync mainnet ([a9c4082](https://github.com/VenusProtocol/isolated-pools/commit/a9c4082d0e96d259eb5b5451aece326a4ae9518f))
* vtoken and mock token deployment files for wstETH on base sepolia ([0edd3bc](https://github.com/VenusProtocol/isolated-pools/commit/0edd3bcd2e979dbdc52c419137129bb5961f94b5))
* vtoken deployment files for wstETH on base mainnet ([4087415](https://github.com/VenusProtocol/isolated-pools/commit/4087415b8a127ec5874996f6777e89bc62ece8b5))
* vtoken, jump rate model, and mock token deployment files for wstETH on zksync sepolia ([a02c78d](https://github.com/VenusProtocol/isolated-pools/commit/a02c78deca24bf06b016f305b4f864cdaa4df931))


### Bug Fixes

* add missing rate model contract ([c6f3143](https://github.com/VenusProtocol/isolated-pools/commit/c6f3143a27a0aedd12dc65fc4e254e3772834134))
* deploy NTG and weth ([42fa051](https://github.com/VenusProtocol/isolated-pools/commit/42fa051d7480292f3e86c91ecb90c201b646cc9f))
* failing integration test ([18fa487](https://github.com/VenusProtocol/isolated-pools/commit/18fa4876eca250860983f4dd0fbdf2683daff2b7))
* fixed lint ([053dc8a](https://github.com/VenusProtocol/isolated-pools/commit/053dc8a4054b357adca407241a08937b7e6b5ffe))
* keep only one vlisUSD_Stablecoins deployment ([b44f5be](https://github.com/VenusProtocol/isolated-pools/commit/b44f5be9732f74e0c3d0739038ac03d89a1cdc08))
* lint issue ([9a3a685](https://github.com/VenusProtocol/isolated-pools/commit/9a3a685a17f35d68f41875777b7562d4996b3d0d))
* redeploy bsctestnet IRM setter with the correct vlisUSD_Stablecoins ([7cd5235](https://github.com/VenusProtocol/isolated-pools/commit/7cd5235ca02d1036e9c5030b6cd3b42e2063ab65))
* redeploy wstETH on unichain mainnet ([fa6bf91](https://github.com/VenusProtocol/isolated-pools/commit/fa6bf91c80f03b97fafe8d546947fea021f59837))
* redeploy wstETH on unichain sepolia ([907d153](https://github.com/VenusProtocol/isolated-pools/commit/907d153524f2faa4585d0da1e4b4d4b2ba14cbb5))
* redeployed with correct name ([6e8d212](https://github.com/VenusProtocol/isolated-pools/commit/6e8d212b57c3830f1e135385e55d51517d80650d))
* revert config ([06c759b](https://github.com/VenusProtocol/isolated-pools/commit/06c759b060dab6fcfbc6471ce598232fdb015b85))
* update bscmainnet interest rate params ([458cc02](https://github.com/VenusProtocol/isolated-pools/commit/458cc027b900853b4e983a24c37a63bcfe17623a))
* use DEFAULT_BLOCKS_PER_YEAR in prime test ([cc88295](https://github.com/VenusProtocol/isolated-pools/commit/cc88295ada437d800756f0c67f5400ffb136b747))
* use Venus-style interest rate multiplier for bsctestnet models ([d137548](https://github.com/VenusProtocol/isolated-pools/commit/d137548215a9b00a98011252638ff9626aecf2b8))

## [4.2.0-dev.14](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.13...v4.2.0-dev.14) (2025-06-02)


### Features

* add deployments for sUSDe and USDe on ethereum ([190c018](https://github.com/VenusProtocol/isolated-pools/commit/190c01896adef13ed043f4af4ff7f471a0b3acb1))
* add deployments for sUSDe and USDe on sepolia ([3227327](https://github.com/VenusProtocol/isolated-pools/commit/3227327c92bc43a206a5d3c055d033bfd35a5afa))
* updating deployment files ([f03aa40](https://github.com/VenusProtocol/isolated-pools/commit/f03aa40b5c567002e54902d8546034977bf17168))

## [4.2.0-dev.13](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.12...v4.2.0-dev.13) (2025-05-23)


### Features

* add weETH and wstETH deployments on unichain mainnet ([f5effc4](https://github.com/VenusProtocol/isolated-pools/commit/f5effc4fb600ef50b928092bca4cb6b72488452b))
* add weETH and wstETH deployments on unichain sepolia ([24ae1ab](https://github.com/VenusProtocol/isolated-pools/commit/24ae1ab6e06166af803ce9403b27ee98b012e536))
* redeploy weETH and wstETH on unichain mainnet ([366f62d](https://github.com/VenusProtocol/isolated-pools/commit/366f62d0dd93a20335d4b02804c016f37ffa37e8))
* redeploy weETH and wstETH on unichain sepolia ([b720d30](https://github.com/VenusProtocol/isolated-pools/commit/b720d305afa12350b09089a90c7b7bc9ee62424d))
* updating deployment files ([cb769a9](https://github.com/VenusProtocol/isolated-pools/commit/cb769a93d538760773e0a7389d61e14f8a1b1384))
* updating deployment files ([743ff5e](https://github.com/VenusProtocol/isolated-pools/commit/743ff5ea7ec0434a054f7bf00f4b165cf02b79e5))
* updating deployment files ([732c020](https://github.com/VenusProtocol/isolated-pools/commit/732c0205a649ca244fde6ef01073f3d3ac7014c8))
* updating deployment files ([bbcfbbc](https://github.com/VenusProtocol/isolated-pools/commit/bbcfbbcc2e34fe1b69b858fd0276f3e246f3ec52))
* updating deployment files ([c1204b0](https://github.com/VenusProtocol/isolated-pools/commit/c1204b0695934cc6b39f2a53528acfb24428bd95))
* updating deployment files ([3fe67a8](https://github.com/VenusProtocol/isolated-pools/commit/3fe67a8d15c09c79ba97dc469de79d97af2c5d0d))


### Bug Fixes

* redeploy wstETH on unichain mainnet ([fa6bf91](https://github.com/VenusProtocol/isolated-pools/commit/fa6bf91c80f03b97fafe8d546947fea021f59837))
* redeploy wstETH on unichain sepolia ([907d153](https://github.com/VenusProtocol/isolated-pools/commit/907d153524f2faa4585d0da1e4b4d4b2ba14cbb5))

## [4.2.0-dev.12](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.11...v4.2.0-dev.12) (2025-05-11)


### Features

* deployment files for interest rate model on unichain for UNI market ([61bf6da](https://github.com/VenusProtocol/isolated-pools/commit/61bf6daf44fa76c01c8e0cdce6c0a67786ee35a3))
* updating deployment files ([07732cb](https://github.com/VenusProtocol/isolated-pools/commit/07732cbfd757f6401072f2b8c630c89c9806dc86))

## [4.2.0-dev.11](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.10...v4.2.0-dev.11) (2025-04-28)


### Features

* add a script to check interest rate models ([3d96a9c](https://github.com/VenusProtocol/isolated-pools/commit/3d96a9ca557098264fab1af58d426d3c35fe56de))
* add deployment scripts for checkpoint rate models ([b752ea8](https://github.com/VenusProtocol/isolated-pools/commit/b752ea8fc44d55e5ad59718921dc695ce84b1ce9))
* add mainnet deployments on BNB ([f5d102d](https://github.com/VenusProtocol/isolated-pools/commit/f5d102d0b200d4bec5ca33891dcbb69dd7900bda))
* add pool lens deployment on OPBNB with updated Block rate ([054233a](https://github.com/VenusProtocol/isolated-pools/commit/054233ace70965de86792b2dba277b142373c4e1))
* add poolLens deployments with updated block number ([da5e2e6](https://github.com/VenusProtocol/isolated-pools/commit/da5e2e644356f1f0970824797f2cae681a352a1f))
* deploy 21024000 blocks per year models to bnb chain ([d681c72](https://github.com/VenusProtocol/isolated-pools/commit/d681c72a26bed9518760d3a863cf2cfcec735521))
* deploy 63072000 blocks per year models to opbnb chain ([9a701a5](https://github.com/VenusProtocol/isolated-pools/commit/9a701a55b55be9a21999c8aa59d89ded04dcb1a0))
* deploy checkpoint rate models to bnb chain ([80e0b4d](https://github.com/VenusProtocol/isolated-pools/commit/80e0b4dfd4703f309988dafd7b2c736adbd35156))
* deploy checkpoint rate models to opbnb chain ([9f91aea](https://github.com/VenusProtocol/isolated-pools/commit/9f91aea5533d89a4c2e6e33cde37032f9d2e61a6))
* redeploy impls wrt to change in block rate ([8c08dbd](https://github.com/VenusProtocol/isolated-pools/commit/8c08dbd4bf1c645ce709e7b791c6f850a2e8229f))
* redeploy new vtoken impl ([63f042e](https://github.com/VenusProtocol/isolated-pools/commit/63f042e2e05c895a3394cea208073457ae8ca220))
* redeployed mainnet contracts ([537f4a7](https://github.com/VenusProtocol/isolated-pools/commit/537f4a7764450ffd6af6b913c20a4069d0a7218e))
* revert shortfall implemetation deployment ([7bc8ffc](https://github.com/VenusProtocol/isolated-pools/commit/7bc8ffc11fc8a25353745b797b8f4f0c1ec0274e))
* update DEFAULT_BLOCKS_PER_YEAR & prime tests ([75b87ab](https://github.com/VenusProtocol/isolated-pools/commit/75b87ab8f364d83f57bb427218e5788be6c8210f))
* updating deployment files ([71bc4ea](https://github.com/VenusProtocol/isolated-pools/commit/71bc4ea26ff6cda9689a283575cd5261f1e4e44b))
* updating deployment files ([1caa73b](https://github.com/VenusProtocol/isolated-pools/commit/1caa73be5b6850d1d6297faf301d0b713e702419))
* updating deployment files ([fd26098](https://github.com/VenusProtocol/isolated-pools/commit/fd26098a083754e64ee2d77fc32eb782be6627d7))
* updating deployment files ([8056d6f](https://github.com/VenusProtocol/isolated-pools/commit/8056d6f2a741abf052758ad7e1b350ea8ad9c348))
* updating deployment files ([1336b3e](https://github.com/VenusProtocol/isolated-pools/commit/1336b3e6974f67d32aeec5d44ee3b3859ee8d662))
* updating deployment files ([91613e1](https://github.com/VenusProtocol/isolated-pools/commit/91613e16992a5e22d02194f5d7c24ea65cec6610))
* updating deployment files ([38b5b0e](https://github.com/VenusProtocol/isolated-pools/commit/38b5b0eeb61292bbf81a536eff8d96c082e372b0))
* updating deployment files ([8bb83b5](https://github.com/VenusProtocol/isolated-pools/commit/8bb83b5c678080b1cd9a45ef4966c11d54c01fa4))


### Bug Fixes

* add missing rate model contract ([c6f3143](https://github.com/VenusProtocol/isolated-pools/commit/c6f3143a27a0aedd12dc65fc4e254e3772834134))
* failing integration test ([18fa487](https://github.com/VenusProtocol/isolated-pools/commit/18fa4876eca250860983f4dd0fbdf2683daff2b7))
* lint issue ([9a3a685](https://github.com/VenusProtocol/isolated-pools/commit/9a3a685a17f35d68f41875777b7562d4996b3d0d))
* redeploy bsctestnet IRM setter with the correct vlisUSD_Stablecoins ([7cd5235](https://github.com/VenusProtocol/isolated-pools/commit/7cd5235ca02d1036e9c5030b6cd3b42e2063ab65))
* update bscmainnet interest rate params ([458cc02](https://github.com/VenusProtocol/isolated-pools/commit/458cc027b900853b4e983a24c37a63bcfe17623a))
* use DEFAULT_BLOCKS_PER_YEAR in prime test ([cc88295](https://github.com/VenusProtocol/isolated-pools/commit/cc88295ada437d800756f0c67f5400ffb136b747))
* use Venus-style interest rate multiplier for bsctestnet models ([d137548](https://github.com/VenusProtocol/isolated-pools/commit/d137548215a9b00a98011252638ff9626aecf2b8))

## [4.2.0-dev.10](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.9...v4.2.0-dev.10) (2025-04-23)


### Features

* updating deployment files ([555cd98](https://github.com/VenusProtocol/isolated-pools/commit/555cd9851c95e773e7a094375d38970935bbfb0e))


### Bug Fixes

* keep only one vlisUSD_Stablecoins deployment ([b44f5be](https://github.com/VenusProtocol/isolated-pools/commit/b44f5be9732f74e0c3d0739038ac03d89a1cdc08))

## [4.2.0-dev.9](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.8...v4.2.0-dev.9) (2025-03-21)


### Features

* deploy mainnet asBNB market ([32b1c62](https://github.com/VenusProtocol/isolated-pools/commit/32b1c62c18bceb7a11ed896fb991b42792450d2b))
* deploy vasBNB_LiquidStakedBNB ([26ff915](https://github.com/VenusProtocol/isolated-pools/commit/26ff9159328e6d4913a4938c1bede633dcaf06dc))
* updating deployment files ([6164026](https://github.com/VenusProtocol/isolated-pools/commit/616402673b47c7a58a5b5c766aa585f038628bd4))
* updating deployment files ([d2bd4d8](https://github.com/VenusProtocol/isolated-pools/commit/d2bd4d8abd2436702cbaeaf0a9b1cb8b43f750b0))

## [4.2.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.7...v4.2.0-dev.8) (2025-03-18)


### Features

* deployed on mainnet ([2b7a3b8](https://github.com/VenusProtocol/isolated-pools/commit/2b7a3b835f6f479ac1d8330e04e561b5c8d1193e))
* deployed PT-clisBNB-24APR2025 market ([8f1aac9](https://github.com/VenusProtocol/isolated-pools/commit/8f1aac9d726f4b232f99d1aa5608045a282e4be2))
* updating deployment files ([5b4417e](https://github.com/VenusProtocol/isolated-pools/commit/5b4417e4e4dc7df57422313b64ba633de647bf2a))
* updating deployment files ([7d60e0b](https://github.com/VenusProtocol/isolated-pools/commit/7d60e0b3d938ed2323ec5d32c7d3c4644b89c0b7))


### Bug Fixes

* fixed lint ([053dc8a](https://github.com/VenusProtocol/isolated-pools/commit/053dc8a4054b357adca407241a08937b7e6b5ffe))
* redeployed with correct name ([6e8d212](https://github.com/VenusProtocol/isolated-pools/commit/6e8d212b57c3830f1e135385e55d51517d80650d))
* revert config ([06c759b](https://github.com/VenusProtocol/isolated-pools/commit/06c759b060dab6fcfbc6471ce598232fdb015b85))

## [4.2.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.6...v4.2.0-dev.7) (2025-03-10)


### Features

* add zkETH market on zkSync ([85276ca](https://github.com/VenusProtocol/isolated-pools/commit/85276caf823d1b7c609f21795a17dc9b355ef08d))
* reduce supply cap of zkETH following Chaos Labs recommendations ([946f19a](https://github.com/VenusProtocol/isolated-pools/commit/946f19a6718db6655f5e1f2557a4d9f30ac90238))
* updating deployment files ([ec2017f](https://github.com/VenusProtocol/isolated-pools/commit/ec2017fb53f9d1f9121cf7cde4d78d8f781652e5))

## [4.2.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.5...v4.2.0-dev.6) (2025-03-10)


### Features

* add UNI deployments on unichain ([a9c6867](https://github.com/VenusProtocol/isolated-pools/commit/a9c6867cda1aa5765a031c4ae6227df7fe8e2be4))
* add UNI deployments on unichain mainnet ([a331b36](https://github.com/VenusProtocol/isolated-pools/commit/a331b36bb3cf930d3b453073d2d847b4455c1275))
* updating deployment files ([70fd1b7](https://github.com/VenusProtocol/isolated-pools/commit/70fd1b705848ca13c0bd7a006ae5483f964852fd))
* updating deployment files ([c4aca78](https://github.com/VenusProtocol/isolated-pools/commit/c4aca78a13ce95dd0318aeb4523d84be4c5ffe8c))

## [4.2.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.4...v4.2.0-dev.5) (2025-03-06)


### Features

* deployment config for wstETH market on base and zksync chains ([85634ba](https://github.com/VenusProtocol/isolated-pools/commit/85634ba14ef4c153f6c0c9c3bafa3880542910d4))
* updating deployment files ([3d35cc9](https://github.com/VenusProtocol/isolated-pools/commit/3d35cc959a34646ecf9f7f20de1833b9d93b0435))
* vtoken and jump rate model deployment files for wstETH on zksync mainnet ([a9c4082](https://github.com/VenusProtocol/isolated-pools/commit/a9c4082d0e96d259eb5b5451aece326a4ae9518f))
* vtoken and mock token deployment files for wstETH on base sepolia ([0edd3bc](https://github.com/VenusProtocol/isolated-pools/commit/0edd3bcd2e979dbdc52c419137129bb5961f94b5))
* vtoken deployment files for wstETH on base mainnet ([4087415](https://github.com/VenusProtocol/isolated-pools/commit/4087415b8a127ec5874996f6777e89bc62ece8b5))
* vtoken, jump rate model, and mock token deployment files for wstETH on zksync sepolia ([a02c78d](https://github.com/VenusProtocol/isolated-pools/commit/a02c78deca24bf06b016f305b4f864cdaa4df931))

## [4.2.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.3...v4.2.0-dev.4) (2025-03-04)


### Features

* deployed contracts ([a8a9ac0](https://github.com/VenusProtocol/isolated-pools/commit/a8a9ac00ed670fd979ecd7ebe4e5d621219b2085))
* updating deployment files ([40ea277](https://github.com/VenusProtocol/isolated-pools/commit/40ea2776b3d89fdbe718e39da304ef8539522392))
* updating deployment files ([0b66d46](https://github.com/VenusProtocol/isolated-pools/commit/0b66d462ed0f8856b7b13b4bc2a08207d7a71896))


### Bug Fixes

* deploy NTG and weth ([42fa051](https://github.com/VenusProtocol/isolated-pools/commit/42fa051d7480292f3e86c91ecb90c201b646cc9f))

## [4.2.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.2...v4.2.0-dev.3) (2025-02-20)


### Features

* deploy Reward distributor on unichain ([b3054b4](https://github.com/VenusProtocol/isolated-pools/commit/b3054b4001154c3538e543cf19bd80c832b40414))
* updating deployment files ([509c44e](https://github.com/VenusProtocol/isolated-pools/commit/509c44ea8011266facd622fe444a827de2b53f76))

## [4.2.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v4.2.0-dev.1...v4.2.0-dev.2) (2025-02-14)


### Features

* update dependencies ([742ef56](https://github.com/VenusProtocol/isolated-pools/commit/742ef5604163eceb5b79dd08c8c9e6a542e3d3b6))

## [4.2.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v4.1.0...v4.2.0-dev.1) (2025-02-13)


### Features

* reward distributor on unichainsepolia ([002d052](https://github.com/VenusProtocol/isolated-pools/commit/002d0527bce24aba1d1322fc1737362ca786ca89))
* updating deployment files ([a21dde7](https://github.com/VenusProtocol/isolated-pools/commit/a21dde79fdc7fe519be5370596ab5d0b87ca1435))

## [4.1.0](https://github.com/VenusProtocol/isolated-pools/compare/v4.0.0...v4.1.0) (2025-02-11)


### Features

* add market deployments on unichain ([7e7f555](https://github.com/VenusProtocol/isolated-pools/commit/7e7f5551db23c91b9e246e8a7d9c700020f741bb))
* deploy pool lens & configure markets on unichain ([de507ba](https://github.com/VenusProtocol/isolated-pools/commit/de507baf707529707395a37b5d57ac675a938626))
* deployed mock tokens and vtokens ([3fa98bd](https://github.com/VenusProtocol/isolated-pools/commit/3fa98bd1ea4eae6f9b846b631cf52178e439cf08))
* deployed on ethereum ([d1e3568](https://github.com/VenusProtocol/isolated-pools/commit/d1e3568abcea3a705f7fcd38566cc9237a4b62cd))
* deployed on sepolia and ethereym ([ead1d0e](https://github.com/VenusProtocol/isolated-pools/commit/ead1d0eb3936717dbde6236b3cdd76c78e7aa319))
* NTG deployment on unichain mainnet ([7207fd1](https://github.com/VenusProtocol/isolated-pools/commit/7207fd10bb14d02eea033dade355b838e7b0a7e8))
* update config & redeploy contracts ([0f1f22f](https://github.com/VenusProtocol/isolated-pools/commit/0f1f22f77189c1788145231ff1da17b907cc2a72))
* updating deployment files ([3df2be1](https://github.com/VenusProtocol/isolated-pools/commit/3df2be19d9628e5f9c856c973006763c5a699809))
* updating deployment files ([e81c07f](https://github.com/VenusProtocol/isolated-pools/commit/e81c07fc211a7113ce04071a8aea5b88cbd2d429))
* updating deployment files ([d0f946c](https://github.com/VenusProtocol/isolated-pools/commit/d0f946c9f6e714f339c24065ded38daef878af15))
* updating deployment files ([f675856](https://github.com/VenusProtocol/isolated-pools/commit/f6758567ca8ff0462da9a43fe65235525b1b4ed1))
* updating deployment files ([880bd6d](https://github.com/VenusProtocol/isolated-pools/commit/880bd6dda9063658c9de25f00375c0e56a50a5ae))
* updating deployment files ([78b1ed7](https://github.com/VenusProtocol/isolated-pools/commit/78b1ed7e54302ef6dc91215e3d90074a5c7e8008))
* updating deployment files ([39da89c](https://github.com/VenusProtocol/isolated-pools/commit/39da89cc12947708f5dba5784303a45616083571))
* updating deployment files ([26159b0](https://github.com/VenusProtocol/isolated-pools/commit/26159b0f08bb7ab0150feeaa8f4b7202b43bdf7e))
* updating deployment files ([90f81e1](https://github.com/VenusProtocol/isolated-pools/commit/90f81e1d96c0b23e7f63896563b3f921b1cacdc8))


### Bug Fixes

* fixed yarn ([576ecd0](https://github.com/VenusProtocol/isolated-pools/commit/576ecd09e058735c32b5d76d6446f99cd91972bc))
* fixed yarn ([6af882c](https://github.com/VenusProtocol/isolated-pools/commit/6af882c8570ce16bffba4ce368c5ac45404a7a4b))
* redeploy NTG on unichainmainnet ([b04ebb8](https://github.com/VenusProtocol/isolated-pools/commit/b04ebb8d48b6f26652aaed026f629512ff1235b9))
* revert script ([333600e](https://github.com/VenusProtocol/isolated-pools/commit/333600eeb89779172941f60fd72c45e4f693126c))
* reverted yarn.lock ([887befc](https://github.com/VenusProtocol/isolated-pools/commit/887befc35b8add3a112abb79cac7e5cedba53bae))

## [4.1.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v4.1.0-dev.3...v4.1.0-dev.4) (2025-02-11)


### Features

* NTG deployment on unichain mainnet ([7207fd1](https://github.com/VenusProtocol/isolated-pools/commit/7207fd10bb14d02eea033dade355b838e7b0a7e8))
* updating deployment files ([3df2be1](https://github.com/VenusProtocol/isolated-pools/commit/3df2be19d9628e5f9c856c973006763c5a699809))
* updating deployment files ([e81c07f](https://github.com/VenusProtocol/isolated-pools/commit/e81c07fc211a7113ce04071a8aea5b88cbd2d429))
* updating deployment files ([880bd6d](https://github.com/VenusProtocol/isolated-pools/commit/880bd6dda9063658c9de25f00375c0e56a50a5ae))


### Bug Fixes

* redeploy NTG on unichainmainnet ([b04ebb8](https://github.com/VenusProtocol/isolated-pools/commit/b04ebb8d48b6f26652aaed026f629512ff1235b9))

## [4.1.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v4.1.0-dev.2...v4.1.0-dev.3) (2025-02-11)


### Features

* add market deployments on unichain ([7e7f555](https://github.com/VenusProtocol/isolated-pools/commit/7e7f5551db23c91b9e246e8a7d9c700020f741bb))
* deploy pool lens & configure markets on unichain ([de507ba](https://github.com/VenusProtocol/isolated-pools/commit/de507baf707529707395a37b5d57ac675a938626))
* update config & redeploy contracts ([0f1f22f](https://github.com/VenusProtocol/isolated-pools/commit/0f1f22f77189c1788145231ff1da17b907cc2a72))
* updating deployment files ([d0f946c](https://github.com/VenusProtocol/isolated-pools/commit/d0f946c9f6e714f339c24065ded38daef878af15))
* updating deployment files ([f675856](https://github.com/VenusProtocol/isolated-pools/commit/f6758567ca8ff0462da9a43fe65235525b1b4ed1))
* updating deployment files ([39da89c](https://github.com/VenusProtocol/isolated-pools/commit/39da89cc12947708f5dba5784303a45616083571))

## [4.1.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v4.1.0-dev.1...v4.1.0-dev.2) (2025-02-11)


### Features

* deployed on sepolia and ethereym ([ead1d0e](https://github.com/VenusProtocol/isolated-pools/commit/ead1d0eb3936717dbde6236b3cdd76c78e7aa319))
* updating deployment files ([78b1ed7](https://github.com/VenusProtocol/isolated-pools/commit/78b1ed7e54302ef6dc91215e3d90074a5c7e8008))

## [4.1.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v4.0.0...v4.1.0-dev.1) (2025-02-09)


### Features

* deployed mock tokens and vtokens ([3fa98bd](https://github.com/VenusProtocol/isolated-pools/commit/3fa98bd1ea4eae6f9b846b631cf52178e439cf08))
* deployed on ethereum ([d1e3568](https://github.com/VenusProtocol/isolated-pools/commit/d1e3568abcea3a705f7fcd38566cc9237a4b62cd))
* updating deployment files ([26159b0](https://github.com/VenusProtocol/isolated-pools/commit/26159b0f08bb7ab0150feeaa8f4b7202b43bdf7e))
* updating deployment files ([90f81e1](https://github.com/VenusProtocol/isolated-pools/commit/90f81e1d96c0b23e7f63896563b3f921b1cacdc8))


### Bug Fixes

* fixed yarn ([576ecd0](https://github.com/VenusProtocol/isolated-pools/commit/576ecd09e058735c32b5d76d6446f99cd91972bc))
* fixed yarn ([6af882c](https://github.com/VenusProtocol/isolated-pools/commit/6af882c8570ce16bffba4ce368c5ac45404a7a4b))
* revert script ([333600e](https://github.com/VenusProtocol/isolated-pools/commit/333600eeb89779172941f60fd72c45e4f693126c))
* reverted yarn.lock ([887befc](https://github.com/VenusProtocol/isolated-pools/commit/887befc35b8add3a112abb79cac7e5cedba53bae))

## [4.0.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.9.0...v4.0.0) (2025-02-07)


### ⚠ BREAKING CHANGES

* rename HAY to lisUSD
* rename agEUR to EURA
* rename vslisbnb

### Features

* add config & deployment for BAL market on sepolia ([519586a](https://github.com/VenusProtocol/isolated-pools/commit/519586ab730b73ebb1ced677d32a1e4d9539fd9e))
* deploy BAL market on ethereum ([7016c99](https://github.com/VenusProtocol/isolated-pools/commit/7016c99b2a9353212d7df595b7791c1978820655))
* IL deployments on unichainsepolia ([6851fa9](https://github.com/VenusProtocol/isolated-pools/commit/6851fa90e369f1e80b35321ebb8498c1640ffcfe))
* NTG deplyment on unichainsepolia ([6faebd3](https://github.com/VenusProtocol/isolated-pools/commit/6faebd3358f70ac8b36b091b25da24eb4262aed2))
* update dependencies ([038ed0e](https://github.com/VenusProtocol/isolated-pools/commit/038ed0efa44af4bf5490146815934e5afbea65d7))
* updating deployment files ([ad493c5](https://github.com/VenusProtocol/isolated-pools/commit/ad493c5e3fe02f05d48be4f46e81b5ba71020a8f))
* updating deployment files ([086657b](https://github.com/VenusProtocol/isolated-pools/commit/086657bcda77f88757ef47c011e6734852d5b04b))
* updating deployment files ([7ad24e0](https://github.com/VenusProtocol/isolated-pools/commit/7ad24e069ab9da40177685250684833288280735))
* updating deployment files ([b4b3f31](https://github.com/VenusProtocol/isolated-pools/commit/b4b3f31fcd9e8d6342a94a98af10fe0711771136))
* updating deployment files ([48407b3](https://github.com/VenusProtocol/isolated-pools/commit/48407b3aa9e7e642b5650f7fa2db0481e95d1457))
* updating deployment files ([34abe6f](https://github.com/VenusProtocol/isolated-pools/commit/34abe6fbda37f9416cc353a1bc5c86d74cd74063))
* updating deployment files ([7ba332a](https://github.com/VenusProtocol/isolated-pools/commit/7ba332a5a9cdbfbefc1663e1464f4840fb17088c))


### Bug Fixes

* rename agEUR to EURA ([b075dd9](https://github.com/VenusProtocol/isolated-pools/commit/b075dd9e54908267d3b1d20d715e363fccadb7ed))
* rename HAY to lisUSD ([645258e](https://github.com/VenusProtocol/isolated-pools/commit/645258eeed6b4d102bb1012a834eaa7e2bea6321))
* rename StableCoins to stablecoins ([6b32bcc](https://github.com/VenusProtocol/isolated-pools/commit/6b32bccb2ae7bbe5eba59ab1549cdba76eb540f3))
* rename vslisbnb ([ecacb34](https://github.com/VenusProtocol/isolated-pools/commit/ecacb34eca59212c2529ae15db8b3dcea0128f7f))
* skip source timelocks on remote chains ([154a2f6](https://github.com/VenusProtocol/isolated-pools/commit/154a2f638652d546705aa07b239117ebef677ecd))
* update core pool token names in deployments ([2773394](https://github.com/VenusProtocol/isolated-pools/commit/2773394b974cc16c617278bfafd537afc68dac81))

## [4.0.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v4.0.0-dev.4...v4.0.0-dev.5) (2025-02-07)


### Features

* update dependencies ([038ed0e](https://github.com/VenusProtocol/isolated-pools/commit/038ed0efa44af4bf5490146815934e5afbea65d7))

## [4.0.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v4.0.0-dev.3...v4.0.0-dev.4) (2025-02-07)


### Features

* NTG deplyment on unichainsepolia ([6faebd3](https://github.com/VenusProtocol/isolated-pools/commit/6faebd3358f70ac8b36b091b25da24eb4262aed2))
* updating deployment files ([ad493c5](https://github.com/VenusProtocol/isolated-pools/commit/ad493c5e3fe02f05d48be4f46e81b5ba71020a8f))

## [4.0.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v4.0.0-dev.2...v4.0.0-dev.3) (2025-02-07)


### Features

* IL deployments on unichainsepolia ([6851fa9](https://github.com/VenusProtocol/isolated-pools/commit/6851fa90e369f1e80b35321ebb8498c1640ffcfe))
* updating deployment files ([086657b](https://github.com/VenusProtocol/isolated-pools/commit/086657bcda77f88757ef47c011e6734852d5b04b))

## [4.0.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v4.0.0-dev.1...v4.0.0-dev.2) (2025-02-05)


### Features

* add config & deployment for BAL market on sepolia ([519586a](https://github.com/VenusProtocol/isolated-pools/commit/519586ab730b73ebb1ced677d32a1e4d9539fd9e))
* deploy BAL market on ethereum ([7016c99](https://github.com/VenusProtocol/isolated-pools/commit/7016c99b2a9353212d7df595b7791c1978820655))
* updating deployment files ([48407b3](https://github.com/VenusProtocol/isolated-pools/commit/48407b3aa9e7e642b5650f7fa2db0481e95d1457))
* updating deployment files ([34abe6f](https://github.com/VenusProtocol/isolated-pools/commit/34abe6fbda37f9416cc353a1bc5c86d74cd74063))

## [4.0.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.9.0...v4.0.0-dev.1) (2025-01-31)


### ⚠ BREAKING CHANGES

* rename HAY to lisUSD
* rename agEUR to EURA
* rename vslisbnb

### Features

* updating deployment files ([7ad24e0](https://github.com/VenusProtocol/isolated-pools/commit/7ad24e069ab9da40177685250684833288280735))
* updating deployment files ([b4b3f31](https://github.com/VenusProtocol/isolated-pools/commit/b4b3f31fcd9e8d6342a94a98af10fe0711771136))
* updating deployment files ([7ba332a](https://github.com/VenusProtocol/isolated-pools/commit/7ba332a5a9cdbfbefc1663e1464f4840fb17088c))


### Bug Fixes

* rename agEUR to EURA ([b075dd9](https://github.com/VenusProtocol/isolated-pools/commit/b075dd9e54908267d3b1d20d715e363fccadb7ed))
* rename HAY to lisUSD ([645258e](https://github.com/VenusProtocol/isolated-pools/commit/645258eeed6b4d102bb1012a834eaa7e2bea6321))
* rename StableCoins to stablecoins ([6b32bcc](https://github.com/VenusProtocol/isolated-pools/commit/6b32bccb2ae7bbe5eba59ab1549cdba76eb540f3))
* rename vslisbnb ([ecacb34](https://github.com/VenusProtocol/isolated-pools/commit/ecacb34eca59212c2529ae15db8b3dcea0128f7f))
* skip source timelocks on remote chains ([154a2f6](https://github.com/VenusProtocol/isolated-pools/commit/154a2f638652d546705aa07b239117ebef677ecd))
* update core pool token names in deployments ([2773394](https://github.com/VenusProtocol/isolated-pools/commit/2773394b974cc16c617278bfafd537afc68dac81))

## [3.9.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.8.0...v3.9.0) (2025-01-30)


### Features

* add USDS & sUSDS market deployments on sepolia ([6319389](https://github.com/VenusProtocol/isolated-pools/commit/6319389266818a6992f9232de374899c7dc72bc1))
* add USDS & sUSDS market mainnet deployments ([9581baf](https://github.com/VenusProtocol/isolated-pools/commit/9581baf7480df847c738024b18f4e201b35a3626))
* added markets ([1840f67](https://github.com/VenusProtocol/isolated-pools/commit/1840f675943534845337c881b22e304a8be56f1d))
* deployed mock token ([1a974c1](https://github.com/VenusProtocol/isolated-pools/commit/1a974c1da90d753c381785a7b2cfe11537b36073))
* deployed on arb sepolia ([c7bcd0e](https://github.com/VenusProtocol/isolated-pools/commit/c7bcd0eb41cef5d10a3fad13ef05e830fd4a116e))
* deployed on arbitrum one ([7aeac7b](https://github.com/VenusProtocol/isolated-pools/commit/7aeac7baced2ba3d2b8b56ec06bfe0eb48f955b1))
* deployed on mainnet ([8163468](https://github.com/VenusProtocol/isolated-pools/commit/81634688382eb5b0ce2540341cfb6e641bd53bb0))
* deployed on testnet ([a10a5b1](https://github.com/VenusProtocol/isolated-pools/commit/a10a5b13011659e11b6b3ecf6aabf38e76c38f76))
* redeployed contracts ([a5982d6](https://github.com/VenusProtocol/isolated-pools/commit/a5982d6125431613c5139268444d4aaa4aa9ddf1))
* redeployed vtokens ([583e652](https://github.com/VenusProtocol/isolated-pools/commit/583e652e1776fc2a358b58e4bb09f6af962bb5f4))
* removed previous deployment ([1fb5ab8](https://github.com/VenusProtocol/isolated-pools/commit/1fb5ab85036b22269eae280e1974fc055c1522cd))
* updating deployment files ([9e7d775](https://github.com/VenusProtocol/isolated-pools/commit/9e7d77525f38f3c43506a6f3b088f7f404384817))
* updating deployment files ([b0e3a1d](https://github.com/VenusProtocol/isolated-pools/commit/b0e3a1de304f23918941937cc8cc31558965594f))
* updating deployment files ([cdb5c90](https://github.com/VenusProtocol/isolated-pools/commit/cdb5c90acd4375d5b1c9e800bd8c04e387cc2322))
* updating deployment files ([3599be0](https://github.com/VenusProtocol/isolated-pools/commit/3599be03c45b892ac2b5038acf87d1d685d6712c))
* updating deployment files ([c46632b](https://github.com/VenusProtocol/isolated-pools/commit/c46632b5e2ce00f80c3efc3bd7b41083f823b939))
* updating deployment files ([b381d79](https://github.com/VenusProtocol/isolated-pools/commit/b381d797b26d7774ac192bfe5497457a2eb354e3))
* updating deployment files ([b7c48d8](https://github.com/VenusProtocol/isolated-pools/commit/b7c48d897b947af8c23bc2151a711486484cdb0e))
* updating deployment files ([503bc70](https://github.com/VenusProtocol/isolated-pools/commit/503bc70ceabbbdc2ad45070345edf6df80a0c6e7))


### Bug Fixes

* merge conflict ([e1f60de](https://github.com/VenusProtocol/isolated-pools/commit/e1f60de4fe756db1be6c5b113169f802f909c5c7))
* redeployed vtokens ([3291460](https://github.com/VenusProtocol/isolated-pools/commit/329146096784dd1c6059081cf8e03e4f7bd5aef1))
* updated timelock addresses ([bfe4cac](https://github.com/VenusProtocol/isolated-pools/commit/bfe4cace9068637368af188045744032d0f7a79a))

## [3.9.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.9.0-dev.2...v3.9.0-dev.3) (2025-01-30)


### Features

* add USDS & sUSDS market deployments on sepolia ([6319389](https://github.com/VenusProtocol/isolated-pools/commit/6319389266818a6992f9232de374899c7dc72bc1))
* add USDS & sUSDS market mainnet deployments ([9581baf](https://github.com/VenusProtocol/isolated-pools/commit/9581baf7480df847c738024b18f4e201b35a3626))
* updating deployment files ([9e7d775](https://github.com/VenusProtocol/isolated-pools/commit/9e7d77525f38f3c43506a6f3b088f7f404384817))
* updating deployment files ([b381d79](https://github.com/VenusProtocol/isolated-pools/commit/b381d797b26d7774ac192bfe5497457a2eb354e3))

## [3.9.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.9.0-dev.1...v3.9.0-dev.2) (2025-01-29)


### Features

* deployed mock token ([1a974c1](https://github.com/VenusProtocol/isolated-pools/commit/1a974c1da90d753c381785a7b2cfe11537b36073))
* deployed on mainnet ([8163468](https://github.com/VenusProtocol/isolated-pools/commit/81634688382eb5b0ce2540341cfb6e641bd53bb0))
* deployed on testnet ([a10a5b1](https://github.com/VenusProtocol/isolated-pools/commit/a10a5b13011659e11b6b3ecf6aabf38e76c38f76))
* redeployed contracts ([a5982d6](https://github.com/VenusProtocol/isolated-pools/commit/a5982d6125431613c5139268444d4aaa4aa9ddf1))
* redeployed vtokens ([583e652](https://github.com/VenusProtocol/isolated-pools/commit/583e652e1776fc2a358b58e4bb09f6af962bb5f4))
* removed previous deployment ([1fb5ab8](https://github.com/VenusProtocol/isolated-pools/commit/1fb5ab85036b22269eae280e1974fc055c1522cd))
* updating deployment files ([b0e3a1d](https://github.com/VenusProtocol/isolated-pools/commit/b0e3a1de304f23918941937cc8cc31558965594f))
* updating deployment files ([cdb5c90](https://github.com/VenusProtocol/isolated-pools/commit/cdb5c90acd4375d5b1c9e800bd8c04e387cc2322))
* updating deployment files ([3599be0](https://github.com/VenusProtocol/isolated-pools/commit/3599be03c45b892ac2b5038acf87d1d685d6712c))
* updating deployment files ([c46632b](https://github.com/VenusProtocol/isolated-pools/commit/c46632b5e2ce00f80c3efc3bd7b41083f823b939))


### Bug Fixes

* merge conflict ([e1f60de](https://github.com/VenusProtocol/isolated-pools/commit/e1f60de4fe756db1be6c5b113169f802f909c5c7))
* redeployed vtokens ([3291460](https://github.com/VenusProtocol/isolated-pools/commit/329146096784dd1c6059081cf8e03e4f7bd5aef1))
* updated timelock addresses ([bfe4cac](https://github.com/VenusProtocol/isolated-pools/commit/bfe4cace9068637368af188045744032d0f7a79a))

## [3.9.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.8.0...v3.9.0-dev.1) (2025-01-28)


### Features

* added markets ([1840f67](https://github.com/VenusProtocol/isolated-pools/commit/1840f675943534845337c881b22e304a8be56f1d))
* deployed on arb sepolia ([c7bcd0e](https://github.com/VenusProtocol/isolated-pools/commit/c7bcd0eb41cef5d10a3fad13ef05e830fd4a116e))
* deployed on arbitrum one ([7aeac7b](https://github.com/VenusProtocol/isolated-pools/commit/7aeac7baced2ba3d2b8b56ec06bfe0eb48f955b1))
* updating deployment files ([b7c48d8](https://github.com/VenusProtocol/isolated-pools/commit/b7c48d897b947af8c23bc2151a711486484cdb0e))
* updating deployment files ([503bc70](https://github.com/VenusProtocol/isolated-pools/commit/503bc70ceabbbdc2ad45070345edf6df80a0c6e7))

## [3.8.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0...v3.8.0) (2025-01-22)


### Features

*  deployed MockERC4626Token ([8d65088](https://github.com/VenusProtocol/isolated-pools/commit/8d650882a5582ea823ab7e3119693729750e8a4e))
* add BTC pool deployments on BNB chain ([7e2dce7](https://github.com/VenusProtocol/isolated-pools/commit/7e2dce7f0d06fcc7f1fadfa3bf7ccc813eea5833))
* add config of Ethena pool on ethereum ([c66c5b5](https://github.com/VenusProtocol/isolated-pools/commit/c66c5b5f6cee88fdb66575d0d9194fb91b2ed6a7))
* add deployments for ethereum ([76f6597](https://github.com/VenusProtocol/isolated-pools/commit/76f6597dd266ee488532885c03981fc015ab6f05))
* add MockUSDe deployment file ([f5f5be9](https://github.com/VenusProtocol/isolated-pools/commit/f5f5be977bfd4cc34b83bb854f12b818ec64ceeb))
* add vwUSDM_Core deployment to zkSync ([feeb90c](https://github.com/VenusProtocol/isolated-pools/commit/feeb90c8c15b207a988b8acdd3e9ac309c84a545))
* added arbitrum IRM ([3ff3310](https://github.com/VenusProtocol/isolated-pools/commit/3ff33101a782d2e863d36638fde64b3124b30e6e))
* deployed arbitrum IRMs ([2188780](https://github.com/VenusProtocol/isolated-pools/commit/21887808706b7ce278e858c853f5476cfbcdfed4))
* deployed bscmainnet IRMs ([c4f388c](https://github.com/VenusProtocol/isolated-pools/commit/c4f388c001ae6537136ea0a6cd5ffc1706feb733))
* deployed ethereum IRM ([39249a0](https://github.com/VenusProtocol/isolated-pools/commit/39249a081e125216c1201af6dd8526af9e4e8433))
* deployed ethereum IRMs ([e57d2be](https://github.com/VenusProtocol/isolated-pools/commit/e57d2be44aca87055eef949269dfae391c34b106))
* deployed zksyncmainnet IRMs ([18d98e2](https://github.com/VenusProtocol/isolated-pools/commit/18d98e295af98a76d1748d94fe01b42d8e4423f1))
* Ethena pool on sepolia ([6a5a1c1](https://github.com/VenusProtocol/isolated-pools/commit/6a5a1c1185e3c55a9617499dde7e00b41a2e73e6))
* support deployment dry run on forked network ([1905f69](https://github.com/VenusProtocol/isolated-pools/commit/1905f69e0b6065309d3975f73626c8a576f6a566))
* support ERC-4626 mock tokens ([37dac6b](https://github.com/VenusProtocol/isolated-pools/commit/37dac6b4319b37f4dd3a5cd32915605ce41bf285))
* tag testnets and deploy mock tokens on testnets ([970486b](https://github.com/VenusProtocol/isolated-pools/commit/970486b17a31d99b33f8f43fa0a19b7e222c1adf))
* update dependencies ([2622a1d](https://github.com/VenusProtocol/isolated-pools/commit/2622a1d1b11260863d9aeca40aa16fee4e6f015e))
* update multifiers for bscmainnet markets ([048996b](https://github.com/VenusProtocol/isolated-pools/commit/048996b9cec4075b4ec6e28806ef40d599b8ae9a))
* updating deployment files ([b62c931](https://github.com/VenusProtocol/isolated-pools/commit/b62c9314ba83c74c311a96b037b0bb8161e5d8ce))
* updating deployment files ([3f418d0](https://github.com/VenusProtocol/isolated-pools/commit/3f418d03db1d1dcc5ae5ebe921852b78e47cf679))
* updating deployment files ([ae189af](https://github.com/VenusProtocol/isolated-pools/commit/ae189af3fb012ec6886562708e11b0cafa49e8f7))
* updating deployment files ([b92379b](https://github.com/VenusProtocol/isolated-pools/commit/b92379b1e734d44b11bac1cfe0047a26b1850b5a))
* updating deployment files ([8ea645c](https://github.com/VenusProtocol/isolated-pools/commit/8ea645c50fc8d119993714020de8c25255917d1f))
* updating deployment files ([fc1ada6](https://github.com/VenusProtocol/isolated-pools/commit/fc1ada665a46f42869a2521d121b489db2ca921c))
* updating deployment files ([4da1b96](https://github.com/VenusProtocol/isolated-pools/commit/4da1b969d3cb61f7cf82ce5c788cceabf3b2363f))
* updating deployment files ([5b1e29b](https://github.com/VenusProtocol/isolated-pools/commit/5b1e29b73ced945f0d0294d854fc895ad493d3db))
* updating deployment files ([322b605](https://github.com/VenusProtocol/isolated-pools/commit/322b6052025144f27a5dbeb315400164f1e65970))
* updating deployment files ([65bf6d2](https://github.com/VenusProtocol/isolated-pools/commit/65bf6d27c8e6ceec880ff74776fc0b86f4f8ec2b))
* updating deployment files ([5ce862b](https://github.com/VenusProtocol/isolated-pools/commit/5ce862bb1e774443cd5dfbddb9e87d9213dfb985))
* updating deployment files ([7477de4](https://github.com/VenusProtocol/isolated-pools/commit/7477de43476c924cf6c9f90fb94d3367ee99f641))
* updating deployment files ([9ddc742](https://github.com/VenusProtocol/isolated-pools/commit/9ddc74298592f622ea527db0f1b339925ca731af))
* updating deployment files ([176c87a](https://github.com/VenusProtocol/isolated-pools/commit/176c87a16678b77c7826218082ae42e9715908cc))
* updating deployment files ([be61772](https://github.com/VenusProtocol/isolated-pools/commit/be617727ce777e7bf486ebce2bc250d4329eeb46))
* updating deployment files ([7f0605d](https://github.com/VenusProtocol/isolated-pools/commit/7f0605dfbe075b1f25ce90ae00a398fdc8296c27))
* use timelocks instead of guardians for zkSync deployments ([b4d72dd](https://github.com/VenusProtocol/isolated-pools/commit/b4d72dd13a43e03486d0be238d72c8676f507de6))


### Bug Fixes

* compare lowercase addresses ([6667a64](https://github.com/VenusProtocol/isolated-pools/commit/6667a645ac397938407bfbaf5cb5604f733aad45))
* correct symbol in crv reward config ([b6adb16](https://github.com/VenusProtocol/isolated-pools/commit/b6adb1648d7d34d28053e5c65c99cabd2d4b1cee))
* fixed lint ([f0945cd](https://github.com/VenusProtocol/isolated-pools/commit/f0945cd85521f10db1c6d7285f9af7883fbe91dd))
* fixed mantissaToBps params ([6a1664c](https://github.com/VenusProtocol/isolated-pools/commit/6a1664c2947193299485c6e329b7a680de29c7c2))
* merge conflict ([5d98ed0](https://github.com/VenusProtocol/isolated-pools/commit/5d98ed083fcbc416e74fef113d0c9359f6371221))
* merge conflict ([9dc73dc](https://github.com/VenusProtocol/isolated-pools/commit/9dc73dc0a3cab4dc2efd2680d48bf558e1438d9f))
* PR comments ([d1546b9](https://github.com/VenusProtocol/isolated-pools/commit/d1546b947ef23e23b6755a6ad44b7f139f9b8d70))
* removed wrong deployments ([dfb6da3](https://github.com/VenusProtocol/isolated-pools/commit/dfb6da3c46fbcce70519aa73098469e54e386718))
* send to treasury only assets that were minted ([3370818](https://github.com/VenusProtocol/isolated-pools/commit/3370818fae202fd7a61fc8c389375a9bdd6a40ba))
* skip networks where PSR hasnt been deployed yet ([b3b84ca](https://github.com/VenusProtocol/isolated-pools/commit/b3b84ca117e8869cb0886f2534e343e8db08280e))
* support breaking changes in protocol reserve deployment scripts ([a30a86a](https://github.com/VenusProtocol/isolated-pools/commit/a30a86abe11cfec55bdf45829856d701db01e9b8))
* support breaking changes in protocol reserve deployment scripts ([ca25f35](https://github.com/VenusProtocol/isolated-pools/commit/ca25f351f3f4bec3e02ffb47e35162bd50b81a73))
* support getNetworkName for zkSync ([3fda9a5](https://github.com/VenusProtocol/isolated-pools/commit/3fda9a55216b34db394b68627e430b5d43afffb4))
* vtoken symbol ([1eca225](https://github.com/VenusProtocol/isolated-pools/commit/1eca2254ea75ffe85182824411d7bd0b3f926049))

## [3.8.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.8.0-dev.4...v3.8.0-dev.5) (2025-01-22)


### Features

* add vwUSDM_Core deployment to zkSync ([feeb90c](https://github.com/VenusProtocol/isolated-pools/commit/feeb90c8c15b207a988b8acdd3e9ac309c84a545))
* support ERC-4626 mock tokens ([37dac6b](https://github.com/VenusProtocol/isolated-pools/commit/37dac6b4319b37f4dd3a5cd32915605ce41bf285))
* tag testnets and deploy mock tokens on testnets ([970486b](https://github.com/VenusProtocol/isolated-pools/commit/970486b17a31d99b33f8f43fa0a19b7e222c1adf))
* updating deployment files ([b62c931](https://github.com/VenusProtocol/isolated-pools/commit/b62c9314ba83c74c311a96b037b0bb8161e5d8ce))
* use timelocks instead of guardians for zkSync deployments ([b4d72dd](https://github.com/VenusProtocol/isolated-pools/commit/b4d72dd13a43e03486d0be238d72c8676f507de6))


### Bug Fixes

* support getNetworkName for zkSync ([3fda9a5](https://github.com/VenusProtocol/isolated-pools/commit/3fda9a55216b34db394b68627e430b5d43afffb4))

## [3.8.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.8.0-dev.3...v3.8.0-dev.4) (2025-01-02)


### Features

* added arbitrum IRM ([3ff3310](https://github.com/VenusProtocol/isolated-pools/commit/3ff33101a782d2e863d36638fde64b3124b30e6e))
* deployed arbitrum IRMs ([2188780](https://github.com/VenusProtocol/isolated-pools/commit/21887808706b7ce278e858c853f5476cfbcdfed4))
* deployed bscmainnet IRMs ([c4f388c](https://github.com/VenusProtocol/isolated-pools/commit/c4f388c001ae6537136ea0a6cd5ffc1706feb733))
* deployed ethereum IRM ([39249a0](https://github.com/VenusProtocol/isolated-pools/commit/39249a081e125216c1201af6dd8526af9e4e8433))
* deployed ethereum IRMs ([e57d2be](https://github.com/VenusProtocol/isolated-pools/commit/e57d2be44aca87055eef949269dfae391c34b106))
* deployed zksyncmainnet IRMs ([18d98e2](https://github.com/VenusProtocol/isolated-pools/commit/18d98e295af98a76d1748d94fe01b42d8e4423f1))
* update multifiers for bscmainnet markets ([048996b](https://github.com/VenusProtocol/isolated-pools/commit/048996b9cec4075b4ec6e28806ef40d599b8ae9a))
* updating deployment files ([3f418d0](https://github.com/VenusProtocol/isolated-pools/commit/3f418d03db1d1dcc5ae5ebe921852b78e47cf679))
* updating deployment files ([ae189af](https://github.com/VenusProtocol/isolated-pools/commit/ae189af3fb012ec6886562708e11b0cafa49e8f7))
* updating deployment files ([b92379b](https://github.com/VenusProtocol/isolated-pools/commit/b92379b1e734d44b11bac1cfe0047a26b1850b5a))
* updating deployment files ([8ea645c](https://github.com/VenusProtocol/isolated-pools/commit/8ea645c50fc8d119993714020de8c25255917d1f))
* updating deployment files ([fc1ada6](https://github.com/VenusProtocol/isolated-pools/commit/fc1ada665a46f42869a2521d121b489db2ca921c))
* updating deployment files ([4da1b96](https://github.com/VenusProtocol/isolated-pools/commit/4da1b969d3cb61f7cf82ce5c788cceabf3b2363f))
* updating deployment files ([5b1e29b](https://github.com/VenusProtocol/isolated-pools/commit/5b1e29b73ced945f0d0294d854fc895ad493d3db))


### Bug Fixes

* fixed lint ([f0945cd](https://github.com/VenusProtocol/isolated-pools/commit/f0945cd85521f10db1c6d7285f9af7883fbe91dd))
* fixed mantissaToBps params ([6a1664c](https://github.com/VenusProtocol/isolated-pools/commit/6a1664c2947193299485c6e329b7a680de29c7c2))
* merge conflict ([5d98ed0](https://github.com/VenusProtocol/isolated-pools/commit/5d98ed083fcbc416e74fef113d0c9359f6371221))
* merge conflict ([9dc73dc](https://github.com/VenusProtocol/isolated-pools/commit/9dc73dc0a3cab4dc2efd2680d48bf558e1438d9f))
* removed wrong deployments ([dfb6da3](https://github.com/VenusProtocol/isolated-pools/commit/dfb6da3c46fbcce70519aa73098469e54e386718))

## [3.8.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.8.0-dev.2...v3.8.0-dev.3) (2024-12-30)


### Features

* add BTC pool deployments on BNB chain ([7e2dce7](https://github.com/VenusProtocol/isolated-pools/commit/7e2dce7f0d06fcc7f1fadfa3bf7ccc813eea5833))
* updating deployment files ([322b605](https://github.com/VenusProtocol/isolated-pools/commit/322b6052025144f27a5dbeb315400164f1e65970))

## [3.8.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.8.0-dev.1...v3.8.0-dev.2) (2024-12-27)


### Features

*  deployed MockERC4626Token ([8d65088](https://github.com/VenusProtocol/isolated-pools/commit/8d650882a5582ea823ab7e3119693729750e8a4e))
* add config of Ethena pool on ethereum ([c66c5b5](https://github.com/VenusProtocol/isolated-pools/commit/c66c5b5f6cee88fdb66575d0d9194fb91b2ed6a7))
* add deployments for ethereum ([76f6597](https://github.com/VenusProtocol/isolated-pools/commit/76f6597dd266ee488532885c03981fc015ab6f05))
* add MockUSDe deployment file ([f5f5be9](https://github.com/VenusProtocol/isolated-pools/commit/f5f5be977bfd4cc34b83bb854f12b818ec64ceeb))
* Ethena pool on sepolia ([6a5a1c1](https://github.com/VenusProtocol/isolated-pools/commit/6a5a1c1185e3c55a9617499dde7e00b41a2e73e6))
* update dependencies ([2622a1d](https://github.com/VenusProtocol/isolated-pools/commit/2622a1d1b11260863d9aeca40aa16fee4e6f015e))
* updating deployment files ([65bf6d2](https://github.com/VenusProtocol/isolated-pools/commit/65bf6d27c8e6ceec880ff74776fc0b86f4f8ec2b))
* updating deployment files ([5ce862b](https://github.com/VenusProtocol/isolated-pools/commit/5ce862bb1e774443cd5dfbddb9e87d9213dfb985))
* updating deployment files ([7477de4](https://github.com/VenusProtocol/isolated-pools/commit/7477de43476c924cf6c9f90fb94d3367ee99f641))
* updating deployment files ([9ddc742](https://github.com/VenusProtocol/isolated-pools/commit/9ddc74298592f622ea527db0f1b339925ca731af))
* updating deployment files ([176c87a](https://github.com/VenusProtocol/isolated-pools/commit/176c87a16678b77c7826218082ae42e9715908cc))
* updating deployment files ([be61772](https://github.com/VenusProtocol/isolated-pools/commit/be617727ce777e7bf486ebce2bc250d4329eeb46))
* updating deployment files ([7f0605d](https://github.com/VenusProtocol/isolated-pools/commit/7f0605dfbe075b1f25ce90ae00a398fdc8296c27))


### Bug Fixes

* PR comments ([d1546b9](https://github.com/VenusProtocol/isolated-pools/commit/d1546b947ef23e23b6755a6ad44b7f139f9b8d70))
* vtoken symbol ([1eca225](https://github.com/VenusProtocol/isolated-pools/commit/1eca2254ea75ffe85182824411d7bd0b3f926049))

## [3.8.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.1-dev.1...v3.8.0-dev.1) (2024-12-26)


### Features

* support deployment dry run on forked network ([1905f69](https://github.com/VenusProtocol/isolated-pools/commit/1905f69e0b6065309d3975f73626c8a576f6a566))


### Bug Fixes

* compare lowercase addresses ([6667a64](https://github.com/VenusProtocol/isolated-pools/commit/6667a645ac397938407bfbaf5cb5604f733aad45))
* correct symbol in crv reward config ([b6adb16](https://github.com/VenusProtocol/isolated-pools/commit/b6adb1648d7d34d28053e5c65c99cabd2d4b1cee))
* send to treasury only assets that were minted ([3370818](https://github.com/VenusProtocol/isolated-pools/commit/3370818fae202fd7a61fc8c389375a9bdd6a40ba))
* skip networks where PSR hasnt been deployed yet ([b3b84ca](https://github.com/VenusProtocol/isolated-pools/commit/b3b84ca117e8869cb0886f2534e343e8db08280e))

## [3.7.1-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0...v3.7.1-dev.1) (2024-12-19)


### Bug Fixes

* support breaking changes in protocol reserve deployment scripts ([a30a86a](https://github.com/VenusProtocol/isolated-pools/commit/a30a86abe11cfec55bdf45829856d701db01e9b8))
* support breaking changes in protocol reserve deployment scripts ([ca25f35](https://github.com/VenusProtocol/isolated-pools/commit/ca25f351f3f4bec3e02ffb47e35162bd50b81a73))

## [3.7.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0...v3.7.0) (2024-12-18)


### Features

* add eth mainnet deployment for pufETH ([38495fb](https://github.com/VenusProtocol/isolated-pools/commit/38495fbae103e446d9edd3de03d6a17a24d1d8cf))
* add LBTC deployments ([f7f2934](https://github.com/VenusProtocol/isolated-pools/commit/f7f2934deb47305553286b1d411190919ddb0632))
* add sepolia deployment for pufETH support ([22c566c](https://github.com/VenusProtocol/isolated-pools/commit/22c566ce2c10e465defbe54550d6d45f76783565))
* add USDC market deployment on zksync mainnet ([5d55389](https://github.com/VenusProtocol/isolated-pools/commit/5d5538985f310c3380624fc03580d306fd1bf61f))
* add USDC market deployments on zksync sepolia ([f698c78](https://github.com/VenusProtocol/isolated-pools/commit/f698c78476049ff34b373e47397da9dc97b70ef7))
* added config ([208fdd5](https://github.com/VenusProtocol/isolated-pools/commit/208fdd5253de76fb999f84c2d2e1dc80efd15251))
* deployed NTG ([78a7ea6](https://github.com/VenusProtocol/isolated-pools/commit/78a7ea60c6a236c4d8ef179a92ea1f28c0f97497))
* deployed pool lens ([4dc31e4](https://github.com/VenusProtocol/isolated-pools/commit/4dc31e40ecb143122ce8d857ecba8735f6f8f8aa))
* partial deployment of pools ([5dd2692](https://github.com/VenusProtocol/isolated-pools/commit/5dd2692234bb78146812fe036a2faa2604555a06))
* update venus dependencies ([643d2f8](https://github.com/VenusProtocol/isolated-pools/commit/643d2f89dac58fcba362b05575acca9b56b2dff2))
* updating deployment files ([e85bc9e](https://github.com/VenusProtocol/isolated-pools/commit/e85bc9e378eff6cfc9d921f77ac026f75a6c7da8))
* updating deployment files ([33d1200](https://github.com/VenusProtocol/isolated-pools/commit/33d1200abf001c5e22fbdc5c4b996885e77c3514))
* updating deployment files ([204fe1d](https://github.com/VenusProtocol/isolated-pools/commit/204fe1d103cd3b0c95a474dc53a80bebdecdf2c4))
* updating deployment files ([4316e93](https://github.com/VenusProtocol/isolated-pools/commit/4316e93d24ff9869a119d913a52935de9a19ab07))
* updating deployment files ([fe9af55](https://github.com/VenusProtocol/isolated-pools/commit/fe9af55b0e94416cee6af63c3c73dbb06cb5acc1))
* updating deployment files ([609d94f](https://github.com/VenusProtocol/isolated-pools/commit/609d94f428d69c20c3a552054a95eb89f19b692f))
* updating deployment files ([12f030e](https://github.com/VenusProtocol/isolated-pools/commit/12f030e29314375d5ccd3a15c977eb3c4e95ba11))
* updating deployment files ([d74c45f](https://github.com/VenusProtocol/isolated-pools/commit/d74c45f31e4f1f47901a06ec305a404304382ece))
* updating deployment files ([e5f4fba](https://github.com/VenusProtocol/isolated-pools/commit/e5f4fbad7a10142adcab0b2d09181277627c7871))
* updating deployment files ([5f1c239](https://github.com/VenusProtocol/isolated-pools/commit/5f1c2398f6e7ca5e3da4b2d05eabd6dd529471b5))
* updating deployment files ([bc3500a](https://github.com/VenusProtocol/isolated-pools/commit/bc3500a894c92ada8ea4f9c16307b6568e092982))
* updating deployment files ([448ce1b](https://github.com/VenusProtocol/isolated-pools/commit/448ce1b338250be5bbf2e1d73ab0a03e66ba8f41))
* updating deployment files ([2f7ee12](https://github.com/VenusProtocol/isolated-pools/commit/2f7ee12778fb5340cd9da2bce23459a19a81dc72))
* updating deployment files ([e5050d7](https://github.com/VenusProtocol/isolated-pools/commit/e5050d712ce1c15dcacfc23424ff1d757a52af24))
* updating deployment files ([5a30371](https://github.com/VenusProtocol/isolated-pools/commit/5a30371b786a40d35280c4a08a5ddc5a48f2ec03))
* updating deployment files ([f4b5a2d](https://github.com/VenusProtocol/isolated-pools/commit/f4b5a2da84de27f33406d05aa3fc31bfc8857937))


### Bug Fixes

* added ci ([26fdd69](https://github.com/VenusProtocol/isolated-pools/commit/26fdd69e3ed37bd05f4e78a8ab9ceccd9dea09b1))
* added config ([8ce8d9c](https://github.com/VenusProtocol/isolated-pools/commit/8ce8d9cd7dcfe98c3352e104c7d361a26af2193e))
* deployed eigen mock and vtoken ([d72cb6b](https://github.com/VenusProtocol/isolated-pools/commit/d72cb6b31495936d85db09cb55eef0266914036a))
* deployed il contracts ([9dbfa8c](https://github.com/VenusProtocol/isolated-pools/commit/9dbfa8c2aef6004080616afb704ded732335ee01))
* deployed irm for ethereum ([be05ef4](https://github.com/VenusProtocol/isolated-pools/commit/be05ef44b30d15b7a858b49b57db41f5a98dfb11))
* deployed mock eBTC ([8dcf6c3](https://github.com/VenusProtocol/isolated-pools/commit/8dcf6c3d67698d17ab66a5128a4ff831160b5734))
* deployed native token gateway ([bc3fcdc](https://github.com/VenusProtocol/isolated-pools/commit/bc3fcdcb6e1912710430ce984b8b5f4f9bf76f5f))
* deployed on arbitrum ([938d5bf](https://github.com/VenusProtocol/isolated-pools/commit/938d5bf6ec9bc42f801e8e4238be2c5bdf4d81da))
* deployed on opbnb and ethereym ([34d05b6](https://github.com/VenusProtocol/isolated-pools/commit/34d05b66f98327c9b16edd45289a77937d84b597))
* deployed veBTC ([7353436](https://github.com/VenusProtocol/isolated-pools/commit/7353436302f0586c3b01e80d391812c578be3f9a))
* deployed vEIGEN on ethereum ([e4bcee9](https://github.com/VenusProtocol/isolated-pools/commit/e4bcee9f611acbef5964b09c68c70b94f902a246))
* deployed vtoken  on ethereum ([e095560](https://github.com/VenusProtocol/isolated-pools/commit/e095560090e5d4fd90f2ab959b2134d1b6124f92))
* deployed vtokens ([46ba2b3](https://github.com/VenusProtocol/isolated-pools/commit/46ba2b3e14ae9b949b1632343bc5e2533549c59e))
* fixed lint ([ac08c09](https://github.com/VenusProtocol/isolated-pools/commit/ac08c09b4dd477fdcbb96e679677e530c9bb6d86))
* fixed lint ([5daa8e8](https://github.com/VenusProtocol/isolated-pools/commit/5daa8e8edd8a4bfa851b3a175d99007cec860176))
* fixed lint ([f77f214](https://github.com/VenusProtocol/isolated-pools/commit/f77f21444c91c4f108ea12705ad542364bb8a47f))
* fixed url ([fbc7947](https://github.com/VenusProtocol/isolated-pools/commit/fbc7947f96283faf64146fdf5506c733d708c292))
* merge conflict ([f96817f](https://github.com/VenusProtocol/isolated-pools/commit/f96817fdf93c8e0f300ae842278c8a0256d48f38))
* remove duplicate config ([fd58eb0](https://github.com/VenusProtocol/isolated-pools/commit/fd58eb00e41830937b47ea217c52cdddbcdc769b))
* revert hardhat config ([62499d7](https://github.com/VenusProtocol/isolated-pools/commit/62499d7f24e8136cddbc5166a275dbd22a7b66db))
* set right address for VTreasury at basesepolia and add missing config for opmainnet ([2716f39](https://github.com/VenusProtocol/isolated-pools/commit/2716f39b648ad3853e20496225712f7cd5620dff))
* updated initial supply ([d6a46eb](https://github.com/VenusProtocol/isolated-pools/commit/d6a46ebe9e789ae2f410cf2304394b0dda593bb0))
* updated IRM params ([240682f](https://github.com/VenusProtocol/isolated-pools/commit/240682ff502323adaf6b0397252abc4e542eca35))
* updated url ([f93042c](https://github.com/VenusProtocol/isolated-pools/commit/f93042c24faa96154c284952dfcdf8a18ec01b3f))

## [3.7.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.7...v3.7.0-dev.8) (2024-12-18)


### Features

* added config ([208fdd5](https://github.com/VenusProtocol/isolated-pools/commit/208fdd5253de76fb999f84c2d2e1dc80efd15251))
* deployed NTG ([78a7ea6](https://github.com/VenusProtocol/isolated-pools/commit/78a7ea60c6a236c4d8ef179a92ea1f28c0f97497))
* partial deployment of pools ([5dd2692](https://github.com/VenusProtocol/isolated-pools/commit/5dd2692234bb78146812fe036a2faa2604555a06))
* update venus dependencies ([643d2f8](https://github.com/VenusProtocol/isolated-pools/commit/643d2f89dac58fcba362b05575acca9b56b2dff2))
* updating deployment files ([e85bc9e](https://github.com/VenusProtocol/isolated-pools/commit/e85bc9e378eff6cfc9d921f77ac026f75a6c7da8))
* updating deployment files ([33d1200](https://github.com/VenusProtocol/isolated-pools/commit/33d1200abf001c5e22fbdc5c4b996885e77c3514))


### Bug Fixes

* added ci ([26fdd69](https://github.com/VenusProtocol/isolated-pools/commit/26fdd69e3ed37bd05f4e78a8ab9ceccd9dea09b1))
* deployed vtokens ([46ba2b3](https://github.com/VenusProtocol/isolated-pools/commit/46ba2b3e14ae9b949b1632343bc5e2533549c59e))
* fixed lint ([ac08c09](https://github.com/VenusProtocol/isolated-pools/commit/ac08c09b4dd477fdcbb96e679677e530c9bb6d86))
* fixed lint ([5daa8e8](https://github.com/VenusProtocol/isolated-pools/commit/5daa8e8edd8a4bfa851b3a175d99007cec860176))
* fixed url ([fbc7947](https://github.com/VenusProtocol/isolated-pools/commit/fbc7947f96283faf64146fdf5506c733d708c292))
* updated url ([f93042c](https://github.com/VenusProtocol/isolated-pools/commit/f93042c24faa96154c284952dfcdf8a18ec01b3f))

## [3.7.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.6...v3.7.0-dev.7) (2024-12-05)


### Features

* add LBTC deployments ([f7f2934](https://github.com/VenusProtocol/isolated-pools/commit/f7f2934deb47305553286b1d411190919ddb0632))
* updating deployment files ([204fe1d](https://github.com/VenusProtocol/isolated-pools/commit/204fe1d103cd3b0c95a474dc53a80bebdecdf2c4))

## [3.7.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.5...v3.7.0-dev.6) (2024-12-03)


### Features

* deployed pool lens ([4dc31e4](https://github.com/VenusProtocol/isolated-pools/commit/4dc31e40ecb143122ce8d857ecba8735f6f8f8aa))
* updating deployment files ([4316e93](https://github.com/VenusProtocol/isolated-pools/commit/4316e93d24ff9869a119d913a52935de9a19ab07))
* updating deployment files ([fe9af55](https://github.com/VenusProtocol/isolated-pools/commit/fe9af55b0e94416cee6af63c3c73dbb06cb5acc1))
* updating deployment files ([609d94f](https://github.com/VenusProtocol/isolated-pools/commit/609d94f428d69c20c3a552054a95eb89f19b692f))


### Bug Fixes

* added config ([8ce8d9c](https://github.com/VenusProtocol/isolated-pools/commit/8ce8d9cd7dcfe98c3352e104c7d361a26af2193e))
* deployed il contracts ([9dbfa8c](https://github.com/VenusProtocol/isolated-pools/commit/9dbfa8c2aef6004080616afb704ded732335ee01))
* deployed native token gateway ([bc3fcdc](https://github.com/VenusProtocol/isolated-pools/commit/bc3fcdcb6e1912710430ce984b8b5f4f9bf76f5f))
* revert hardhat config ([62499d7](https://github.com/VenusProtocol/isolated-pools/commit/62499d7f24e8136cddbc5166a275dbd22a7b66db))
* set right address for VTreasury at basesepolia and add missing config for opmainnet ([2716f39](https://github.com/VenusProtocol/isolated-pools/commit/2716f39b648ad3853e20496225712f7cd5620dff))

## [3.7.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.4...v3.7.0-dev.5) (2024-11-14)


### Features

* updating deployment files ([d74c45f](https://github.com/VenusProtocol/isolated-pools/commit/d74c45f31e4f1f47901a06ec305a404304382ece))
* updating deployment files ([e5f4fba](https://github.com/VenusProtocol/isolated-pools/commit/e5f4fbad7a10142adcab0b2d09181277627c7871))


### Bug Fixes

* deployed irm for ethereum ([be05ef4](https://github.com/VenusProtocol/isolated-pools/commit/be05ef44b30d15b7a858b49b57db41f5a98dfb11))
* deployed on arbitrum ([938d5bf](https://github.com/VenusProtocol/isolated-pools/commit/938d5bf6ec9bc42f801e8e4238be2c5bdf4d81da))
* deployed on opbnb and ethereym ([34d05b6](https://github.com/VenusProtocol/isolated-pools/commit/34d05b66f98327c9b16edd45289a77937d84b597))
* updated IRM params ([240682f](https://github.com/VenusProtocol/isolated-pools/commit/240682ff502323adaf6b0397252abc4e542eca35))

## [3.7.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.3...v3.7.0-dev.4) (2024-11-14)


### Features

* add eth mainnet deployment for pufETH ([38495fb](https://github.com/VenusProtocol/isolated-pools/commit/38495fbae103e446d9edd3de03d6a17a24d1d8cf))
* add sepolia deployment for pufETH support ([22c566c](https://github.com/VenusProtocol/isolated-pools/commit/22c566ce2c10e465defbe54550d6d45f76783565))
* updating deployment files ([12f030e](https://github.com/VenusProtocol/isolated-pools/commit/12f030e29314375d5ccd3a15c977eb3c4e95ba11))

## [3.7.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.2...v3.7.0-dev.3) (2024-11-08)


### Features

* updating deployment files ([448ce1b](https://github.com/VenusProtocol/isolated-pools/commit/448ce1b338250be5bbf2e1d73ab0a03e66ba8f41))
* updating deployment files ([2f7ee12](https://github.com/VenusProtocol/isolated-pools/commit/2f7ee12778fb5340cd9da2bce23459a19a81dc72))
* updating deployment files ([e5050d7](https://github.com/VenusProtocol/isolated-pools/commit/e5050d712ce1c15dcacfc23424ff1d757a52af24))


### Bug Fixes

* deployed mock eBTC ([8dcf6c3](https://github.com/VenusProtocol/isolated-pools/commit/8dcf6c3d67698d17ab66a5128a4ff831160b5734))
* deployed veBTC ([7353436](https://github.com/VenusProtocol/isolated-pools/commit/7353436302f0586c3b01e80d391812c578be3f9a))
* deployed vtoken  on ethereum ([e095560](https://github.com/VenusProtocol/isolated-pools/commit/e095560090e5d4fd90f2ab959b2134d1b6124f92))
* fixed lint ([f77f214](https://github.com/VenusProtocol/isolated-pools/commit/f77f21444c91c4f108ea12705ad542364bb8a47f))
* merge conflict ([f96817f](https://github.com/VenusProtocol/isolated-pools/commit/f96817fdf93c8e0f300ae842278c8a0256d48f38))
* remove duplicate config ([fd58eb0](https://github.com/VenusProtocol/isolated-pools/commit/fd58eb00e41830937b47ea217c52cdddbcdc769b))
* updated initial supply ([d6a46eb](https://github.com/VenusProtocol/isolated-pools/commit/d6a46ebe9e789ae2f410cf2304394b0dda593bb0))

## [3.7.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.7.0-dev.1...v3.7.0-dev.2) (2024-11-07)


### Features

* updating deployment files ([5a30371](https://github.com/VenusProtocol/isolated-pools/commit/5a30371b786a40d35280c4a08a5ddc5a48f2ec03))
* updating deployment files ([f4b5a2d](https://github.com/VenusProtocol/isolated-pools/commit/f4b5a2da84de27f33406d05aa3fc31bfc8857937))


### Bug Fixes

* deployed eigen mock and vtoken ([d72cb6b](https://github.com/VenusProtocol/isolated-pools/commit/d72cb6b31495936d85db09cb55eef0266914036a))
* deployed vEIGEN on ethereum ([e4bcee9](https://github.com/VenusProtocol/isolated-pools/commit/e4bcee9f611acbef5964b09c68c70b94f902a246))

## [3.7.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0...v3.7.0-dev.1) (2024-11-06)


### Features

* add USDC market deployment on zksync mainnet ([5d55389](https://github.com/VenusProtocol/isolated-pools/commit/5d5538985f310c3380624fc03580d306fd1bf61f))
* add USDC market deployments on zksync sepolia ([f698c78](https://github.com/VenusProtocol/isolated-pools/commit/f698c78476049ff34b373e47397da9dc97b70ef7))
* updating deployment files ([5f1c239](https://github.com/VenusProtocol/isolated-pools/commit/5f1c2398f6e7ca5e3da4b2d05eabd6dd529471b5))
* updating deployment files ([bc3500a](https://github.com/VenusProtocol/isolated-pools/commit/bc3500a894c92ada8ea4f9c16307b6568e092982))

## [3.6.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0...v3.6.0) (2024-10-10)


### Features

* add core pool config for opmainnet ([54ee35a](https://github.com/VenusProtocol/isolated-pools/commit/54ee35a69136cddd21daec53365816cecdf2a30d))
* add deployments of Rewards distributor on zksync mainnet ([4654b32](https://github.com/VenusProtocol/isolated-pools/commit/4654b3216369dd80fad8c41a129cb2499de8bbcd))
* add LST ETH pool deployment on BNB chain ([4e94bff](https://github.com/VenusProtocol/isolated-pools/commit/4e94bff85b3aa42547695e7b1d90eb95ad9bdae2))
* add new interest rate model for weth with  .3% multiplier ([def6496](https://github.com/VenusProtocol/isolated-pools/commit/def6496707d02b2f6734c1ad35e39cea6c35cbfb))
* add reward distributor to core pool on opsepolia ([bf235af](https://github.com/VenusProtocol/isolated-pools/commit/bf235af6f4f5509d6d8309c003cebad416f1c731))
* deployment file for USDC vtoken for core pool on opmainnet ([b6a89d3](https://github.com/VenusProtocol/isolated-pools/commit/b6a89d32d517a4bc918294585f0dcb8468d60694))
* deployment files for pool registry on opmainnet ([9c21206](https://github.com/VenusProtocol/isolated-pools/commit/9c21206dc6694d9aa93877c66658e0e373c59c6e))
* deployment files for the NTG ([711894d](https://github.com/VenusProtocol/isolated-pools/commit/711894d7da85c76c9b61cc6005b99285085cccb3))
* deployment files for the pool lens on the op mainnet ([c6ef501](https://github.com/VenusProtocol/isolated-pools/commit/c6ef501c2ad64ec9a9d0af772a60ccf84b410e2b))
* deployment files for the pool registry on opsepolia: ([e9148ef](https://github.com/VenusProtocol/isolated-pools/commit/e9148ef6be1792a1e786d3f371af9afb955eb6ba))
* deployment files of  pool lens on op sepolia ([24b25b4](https://github.com/VenusProtocol/isolated-pools/commit/24b25b42c408bc241c6ab1f4f2584e2fd28adafe))
* deployment files of core comptroller on opmainnet ([0ee2bd2](https://github.com/VenusProtocol/isolated-pools/commit/0ee2bd2260cc1051a106c99955049c9cb3dfee6d))
* deployment files of core pool vtokens on opmainnet ([4b120ae](https://github.com/VenusProtocol/isolated-pools/commit/4b120aee48483226c263378c09682d6ad6cdab92))
* deployment files of mock tokens on opsepolia ([20370ea](https://github.com/VenusProtocol/isolated-pools/commit/20370ea429e29579d24829dda8f33344dd55b003))
* deployment files of NTG for core pool on opmainnet ([a30718a](https://github.com/VenusProtocol/isolated-pools/commit/a30718a92b0792c919ae3b83bdc6d5b864f0324f))
* deployment files of the vTokens of core pool on opsepolia ([c1fbaf7](https://github.com/VenusProtocol/isolated-pools/commit/c1fbaf79557c4ae195d8ca7f0f0bc74aabc59cd1))
* deplyment config and files for the core pool on opsepolia ([fe14b03](https://github.com/VenusProtocol/isolated-pools/commit/fe14b033ea563ba0f4f7ddf7a93e620571111031))
* updating deployment files ([86e7f82](https://github.com/VenusProtocol/isolated-pools/commit/86e7f829c9906629934d5d88998490ba77441e2c))
* updating deployment files ([6fe7fe8](https://github.com/VenusProtocol/isolated-pools/commit/6fe7fe8f9955fd083df358d9a7df36aa3c9fffb4))
* updating deployment files ([c9d88f3](https://github.com/VenusProtocol/isolated-pools/commit/c9d88f3f93501842af9e504561ab67a837f4c4a4))
* updating deployment files ([4ba011e](https://github.com/VenusProtocol/isolated-pools/commit/4ba011e97798cda1cf2cba43d8f2d28fd8eb1377))
* updating deployment files ([3bacef9](https://github.com/VenusProtocol/isolated-pools/commit/3bacef9392c30266d17cedb357509b166a4b3b12))
* updating deployment files ([75180af](https://github.com/VenusProtocol/isolated-pools/commit/75180af22e0ba363896c2e2fde7c01234e01994a))
* updating deployment files ([1bb27b7](https://github.com/VenusProtocol/isolated-pools/commit/1bb27b7008b48df6ff0e3df8e10cd1d54e450930))
* updating deployment files ([d9d08d7](https://github.com/VenusProtocol/isolated-pools/commit/d9d08d74f544d4f3a8f186ee65fcc1833c1d0f7e))
* updating deployment files ([990e608](https://github.com/VenusProtocol/isolated-pools/commit/990e6085bd8edaa65a45094dd4dd5d2b7950b271))
* updating deployment files ([7f21e24](https://github.com/VenusProtocol/isolated-pools/commit/7f21e2427523bfabc2074e6d52ea68dbd266323e))
* updating deployment files ([8bc19ee](https://github.com/VenusProtocol/isolated-pools/commit/8bc19ee888877ca1b05df58ec6e77f98a34511e8))
* updating deployment files ([021a787](https://github.com/VenusProtocol/isolated-pools/commit/021a78770d28c6e2aeaafaec1a4996d56c9fcdb8))
* updating deployment files ([17d0f17](https://github.com/VenusProtocol/isolated-pools/commit/17d0f178ff1e9252670c9f428f85240d401734bb))
* updating deployment files ([56e0d44](https://github.com/VenusProtocol/isolated-pools/commit/56e0d449ab624d9d326a51a3e8c45265d2a7b569))
* updating deployment files ([1bf4b12](https://github.com/VenusProtocol/isolated-pools/commit/1bf4b125c894af05396d88ad1c10d7679b43e60a))
* updating deployment files ([4010ada](https://github.com/VenusProtocol/isolated-pools/commit/4010ada1068459023eb5d6a8e7fe2bebe83b9c2c))
* use packages that include the Optimism deployment ([f22e450](https://github.com/VenusProtocol/isolated-pools/commit/f22e45033a6bac637ee1073bb568d85f690ccccd))


### Bug Fixes

* added op config ([d012a2a](https://github.com/VenusProtocol/isolated-pools/commit/d012a2a29df50a6860ed52069d799fce47e16194))
* deployed on bnb and opbnb ([8b49ed8](https://github.com/VenusProtocol/isolated-pools/commit/8b49ed8e7fbf6badb16a00e1f11a8c3c2c24e308))
* deployed on bsctestnet and opbnbtestnet ([8d8b5e9](https://github.com/VenusProtocol/isolated-pools/commit/8d8b5e907910ab60e8535b8e6b36219c7b061ade))
* deployed on ethereum ([07ea2f2](https://github.com/VenusProtocol/isolated-pools/commit/07ea2f2586eacbd4f1b1226a65060e89a18d601e))
* deployed on sepolia ([33cd49a](https://github.com/VenusProtocol/isolated-pools/commit/33cd49a659f9c39932242b17c5b2feafeac87a20))
* revert changes ([7ed8c8a](https://github.com/VenusProtocol/isolated-pools/commit/7ed8c8a2def9a0d98fdc035daabec1e4bc24f86b))
* use correct risk parameters ([fbf2584](https://github.com/VenusProtocol/isolated-pools/commit/fbf25843f3adea0630814aabbb3ad326e25539ee))
* use the right decimals for USDC on Optimism ([b83fbc3](https://github.com/VenusProtocol/isolated-pools/commit/b83fbc322ab2093f3264ab06f7db730b17c31b15))

## [3.6.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0-dev.6...v3.6.0-dev.7) (2024-10-10)


### Features

* add core pool config for opmainnet ([54ee35a](https://github.com/VenusProtocol/isolated-pools/commit/54ee35a69136cddd21daec53365816cecdf2a30d))
* deployment file for USDC vtoken for core pool on opmainnet ([b6a89d3](https://github.com/VenusProtocol/isolated-pools/commit/b6a89d32d517a4bc918294585f0dcb8468d60694))
* deployment files for pool registry on opmainnet ([9c21206](https://github.com/VenusProtocol/isolated-pools/commit/9c21206dc6694d9aa93877c66658e0e373c59c6e))
* deployment files for the pool lens on the op mainnet ([c6ef501](https://github.com/VenusProtocol/isolated-pools/commit/c6ef501c2ad64ec9a9d0af772a60ccf84b410e2b))
* deployment files of core comptroller on opmainnet ([0ee2bd2](https://github.com/VenusProtocol/isolated-pools/commit/0ee2bd2260cc1051a106c99955049c9cb3dfee6d))
* deployment files of core pool vtokens on opmainnet ([4b120ae](https://github.com/VenusProtocol/isolated-pools/commit/4b120aee48483226c263378c09682d6ad6cdab92))
* deployment files of NTG for core pool on opmainnet ([a30718a](https://github.com/VenusProtocol/isolated-pools/commit/a30718a92b0792c919ae3b83bdc6d5b864f0324f))
* updating deployment files ([86e7f82](https://github.com/VenusProtocol/isolated-pools/commit/86e7f829c9906629934d5d88998490ba77441e2c))
* updating deployment files ([4ba011e](https://github.com/VenusProtocol/isolated-pools/commit/4ba011e97798cda1cf2cba43d8f2d28fd8eb1377))
* updating deployment files ([3bacef9](https://github.com/VenusProtocol/isolated-pools/commit/3bacef9392c30266d17cedb357509b166a4b3b12))
* updating deployment files ([75180af](https://github.com/VenusProtocol/isolated-pools/commit/75180af22e0ba363896c2e2fde7c01234e01994a))
* updating deployment files ([1bb27b7](https://github.com/VenusProtocol/isolated-pools/commit/1bb27b7008b48df6ff0e3df8e10cd1d54e450930))
* use packages that include the Optimism deployment ([f22e450](https://github.com/VenusProtocol/isolated-pools/commit/f22e45033a6bac637ee1073bb568d85f690ccccd))


### Bug Fixes

* use the right decimals for USDC on Optimism ([b83fbc3](https://github.com/VenusProtocol/isolated-pools/commit/b83fbc322ab2093f3264ab06f7db730b17c31b15))

## [3.6.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0-dev.5...v3.6.0-dev.6) (2024-10-02)


### Features

* updating deployment files ([6fe7fe8](https://github.com/VenusProtocol/isolated-pools/commit/6fe7fe8f9955fd083df358d9a7df36aa3c9fffb4))
* updating deployment files ([c9d88f3](https://github.com/VenusProtocol/isolated-pools/commit/c9d88f3f93501842af9e504561ab67a837f4c4a4))
* updating deployment files ([d9d08d7](https://github.com/VenusProtocol/isolated-pools/commit/d9d08d74f544d4f3a8f186ee65fcc1833c1d0f7e))
* updating deployment files ([990e608](https://github.com/VenusProtocol/isolated-pools/commit/990e6085bd8edaa65a45094dd4dd5d2b7950b271))


### Bug Fixes

* added op config ([d012a2a](https://github.com/VenusProtocol/isolated-pools/commit/d012a2a29df50a6860ed52069d799fce47e16194))
* deployed on bnb and opbnb ([8b49ed8](https://github.com/VenusProtocol/isolated-pools/commit/8b49ed8e7fbf6badb16a00e1f11a8c3c2c24e308))
* deployed on bsctestnet and opbnbtestnet ([8d8b5e9](https://github.com/VenusProtocol/isolated-pools/commit/8d8b5e907910ab60e8535b8e6b36219c7b061ade))
* deployed on ethereum ([07ea2f2](https://github.com/VenusProtocol/isolated-pools/commit/07ea2f2586eacbd4f1b1226a65060e89a18d601e))
* deployed on sepolia ([33cd49a](https://github.com/VenusProtocol/isolated-pools/commit/33cd49a659f9c39932242b17c5b2feafeac87a20))
* revert changes ([7ed8c8a](https://github.com/VenusProtocol/isolated-pools/commit/7ed8c8a2def9a0d98fdc035daabec1e4bc24f86b))

## [3.6.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0-dev.4...v3.6.0-dev.5) (2024-10-01)


### Features

* add new interest rate model for weth with  .3% multiplier ([def6496](https://github.com/VenusProtocol/isolated-pools/commit/def6496707d02b2f6734c1ad35e39cea6c35cbfb))
* updating deployment files ([7f21e24](https://github.com/VenusProtocol/isolated-pools/commit/7f21e2427523bfabc2074e6d52ea68dbd266323e))

## [3.6.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0-dev.3...v3.6.0-dev.4) (2024-09-24)


### Features

* add LST ETH pool deployment on BNB chain ([4e94bff](https://github.com/VenusProtocol/isolated-pools/commit/4e94bff85b3aa42547695e7b1d90eb95ad9bdae2))
* updating deployment files ([56e0d44](https://github.com/VenusProtocol/isolated-pools/commit/56e0d449ab624d9d326a51a3e8c45265d2a7b569))


### Bug Fixes

* use correct risk parameters ([fbf2584](https://github.com/VenusProtocol/isolated-pools/commit/fbf25843f3adea0630814aabbb3ad326e25539ee))

## [3.6.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0-dev.2...v3.6.0-dev.3) (2024-09-23)


### Features

* add deployments of Rewards distributor on zksync mainnet ([4654b32](https://github.com/VenusProtocol/isolated-pools/commit/4654b3216369dd80fad8c41a129cb2499de8bbcd))
* updating deployment files ([8bc19ee](https://github.com/VenusProtocol/isolated-pools/commit/8bc19ee888877ca1b05df58ec6e77f98a34511e8))

## [3.6.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.6.0-dev.1...v3.6.0-dev.2) (2024-09-19)


### Features

* add reward distributor to core pool on opsepolia ([bf235af](https://github.com/VenusProtocol/isolated-pools/commit/bf235af6f4f5509d6d8309c003cebad416f1c731))
* updating deployment files ([021a787](https://github.com/VenusProtocol/isolated-pools/commit/021a78770d28c6e2aeaafaec1a4996d56c9fcdb8))

## [3.6.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0...v3.6.0-dev.1) (2024-09-13)


### Features

* deployment files for the NTG ([711894d](https://github.com/VenusProtocol/isolated-pools/commit/711894d7da85c76c9b61cc6005b99285085cccb3))
* deployment files for the pool registry on opsepolia: ([e9148ef](https://github.com/VenusProtocol/isolated-pools/commit/e9148ef6be1792a1e786d3f371af9afb955eb6ba))
* deployment files of  pool lens on op sepolia ([24b25b4](https://github.com/VenusProtocol/isolated-pools/commit/24b25b42c408bc241c6ab1f4f2584e2fd28adafe))
* deployment files of mock tokens on opsepolia ([20370ea](https://github.com/VenusProtocol/isolated-pools/commit/20370ea429e29579d24829dda8f33344dd55b003))
* deployment files of the vTokens of core pool on opsepolia ([c1fbaf7](https://github.com/VenusProtocol/isolated-pools/commit/c1fbaf79557c4ae195d8ca7f0f0bc74aabc59cd1))
* deplyment config and files for the core pool on opsepolia ([fe14b03](https://github.com/VenusProtocol/isolated-pools/commit/fe14b033ea563ba0f4f7ddf7a93e620571111031))
* updating deployment files ([17d0f17](https://github.com/VenusProtocol/isolated-pools/commit/17d0f178ff1e9252670c9f428f85240d401734bb))
* updating deployment files ([1bf4b12](https://github.com/VenusProtocol/isolated-pools/commit/1bf4b125c894af05396d88ad1c10d7679b43e60a))
* updating deployment files ([4010ada](https://github.com/VenusProtocol/isolated-pools/commit/4010ada1068459023eb5d6a8e7fe2bebe83b9c2c))

## [3.5.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0...v3.5.0) (2024-09-10)


### Features

* add config for liquid staked ETH pool for arbitrum one ([a9fb3d7](https://github.com/VenusProtocol/isolated-pools/commit/a9fb3d7e8544ed2690571315d118c9705f80856c))
* add config for Liquid Staked ETH pool for arbitrum sepolia ([a25a43c](https://github.com/VenusProtocol/isolated-pools/commit/a25a43ca3a15d82bec1cd3620865c5eb0d783572))
* add deployment files for Liquid Staked ETH pool for arbitrum sepolia ([9028873](https://github.com/VenusProtocol/isolated-pools/commit/90288734f6ec58c6d1fb45c0d3b1b56db209f6b0))
* add deployment files for NTG on arbitrum one for liquid staked ETH pool ([3849676](https://github.com/VenusProtocol/isolated-pools/commit/3849676704951138f870d109f4ea211fecbd259d))
* add deployment files for NTG on arbitrum sepolia for liquid staked ETH pool ([44f17e0](https://github.com/VenusProtocol/isolated-pools/commit/44f17e0f2b3e80a4898224ae1a291b85817500f4))
* add deployments of Reward distributor ([3dfba03](https://github.com/VenusProtocol/isolated-pools/commit/3dfba033de819f7c1daeaaca29f245b5d011bf4e))
* add ethereum addresses ([cfdcf00](https://github.com/VenusProtocol/isolated-pools/commit/cfdcf00f7aa2b39aac751c67c0c1f2777deeb825))
* add IL deployments on zksync mainnet ([ec7303f](https://github.com/VenusProtocol/isolated-pools/commit/ec7303fe8eb63fe31b0237085d5c5c551753bd27))
* add interest rate model deployments for Chaos recs ([3205565](https://github.com/VenusProtocol/isolated-pools/commit/32055654b94088fa92c1b61a5a7a0ba72af8df4e))
* add ZK token ([fc33b47](https://github.com/VenusProtocol/isolated-pools/commit/fc33b47e8491df31551417b1b4b8dab58b5d2fcb))
* bump dependencies with venus packages ([8d71a4d](https://github.com/VenusProtocol/isolated-pools/commit/8d71a4d72b59f8076245b5f68875631dd1e105c4))
* deploy mock tokens on zksync sepolia ([6f4f70e](https://github.com/VenusProtocol/isolated-pools/commit/6f4f70e4a7a2725ec5489d62bc81719f4a217172))
* deployment files for liquid staked ETH for arbitrum one ([2ce558a](https://github.com/VenusProtocol/isolated-pools/commit/2ce558ab6e622e8951c48152340b9ac2f62c09a9))
* deployment files for the reward distributor for LSETH pool on arbitrumone ([8c41986](https://github.com/VenusProtocol/isolated-pools/commit/8c419866f346c7a0c9cdf0949743292ec9fe8de8))
* deployments of NTG on zksync ([9e78b8d](https://github.com/VenusProtocol/isolated-pools/commit/9e78b8d892b45c1f33cfda8804bae46d417b8b2f))
* export deployment ([d4bdbe2](https://github.com/VenusProtocol/isolated-pools/commit/d4bdbe2752d181b9b20f621ec57430adc5f06962))
* IL deployment on zksync sepolia ([2bc1be0](https://github.com/VenusProtocol/isolated-pools/commit/2bc1be0fe0954906923d0d05270958748eba519a))
* NTG deployment on zksync sepolia ([c41ce20](https://github.com/VenusProtocol/isolated-pools/commit/c41ce20b5dab0526bbc7e99a3b6bdc4eb550a4f8))
* redeploy IL with updated zksolc & new comptroller implementation ([8ef42d6](https://github.com/VenusProtocol/isolated-pools/commit/8ef42d62c2b01158c8af7a7982ba055aa70fa8eb))
* redeploy NTG with updated zksolc version ([b93f63e](https://github.com/VenusProtocol/isolated-pools/commit/b93f63e67d6f1f556085b0ee56ad672eaf6ebcd8))
* updating deployment files ([e87caaa](https://github.com/VenusProtocol/isolated-pools/commit/e87caaad46b3774774e7f8d499f4cdca69f20637))
* updating deployment files ([74c4112](https://github.com/VenusProtocol/isolated-pools/commit/74c4112ab0e25b00a51598a610bb9c8a1e2cea05))
* updating deployment files ([537def1](https://github.com/VenusProtocol/isolated-pools/commit/537def123109e667a26c02af052b4c3002255ace))
* updating deployment files ([4665e93](https://github.com/VenusProtocol/isolated-pools/commit/4665e93e2905abf0ef50f81cbcbf558bb2e04360))
* updating deployment files ([581c592](https://github.com/VenusProtocol/isolated-pools/commit/581c5922096da418c99ae928251660e8c7d0fe98))
* updating deployment files ([7d25caf](https://github.com/VenusProtocol/isolated-pools/commit/7d25caf803e48480368515edc5d0805136ed194f))
* updating deployment files ([1286259](https://github.com/VenusProtocol/isolated-pools/commit/12862592d7193e7c85391d45a2fa4a892740e778))
* updating deployment files ([d9873c5](https://github.com/VenusProtocol/isolated-pools/commit/d9873c55961f9c930ebee07272ae11caf3bb966d))
* updating deployment files ([89b9e3f](https://github.com/VenusProtocol/isolated-pools/commit/89b9e3f7807cd73be3373fae673f4871df45533b))
* updating deployment files ([0ad2acc](https://github.com/VenusProtocol/isolated-pools/commit/0ad2acce2cea9879ea3837dc42f0e67502bee67a))
* updating deployment files ([20b8086](https://github.com/VenusProtocol/isolated-pools/commit/20b8086a7da7cf14e58a9d057bfca90d846cf7b3))
* updating deployment files ([54a2520](https://github.com/VenusProtocol/isolated-pools/commit/54a25207f7ddb532ac1680adef175d078bb16ddf))
* updating deployment files ([44abed1](https://github.com/VenusProtocol/isolated-pools/commit/44abed15cf210f5e6d6cd1a857db1af2f0871876))
* updating deployment files ([29f152e](https://github.com/VenusProtocol/isolated-pools/commit/29f152efbe74f7e77927cfdcbdea442abe647c43))
* updating deployment files ([cbde010](https://github.com/VenusProtocol/isolated-pools/commit/cbde01099f52872024736ad41efb9003b7b262e1))
* updating deployment files ([f1c5e80](https://github.com/VenusProtocol/isolated-pools/commit/f1c5e808ae3b202e772eb2c4f2f3f39c09a930b2))
* updating deployment files ([68021c9](https://github.com/VenusProtocol/isolated-pools/commit/68021c97695548e0c776b3c2dad64e0574642691))
* updating deployment files ([f725336](https://github.com/VenusProtocol/isolated-pools/commit/f7253365e4bbc6504fb0341527225bb0d2d6b7ea))
* updating deployment files ([4516940](https://github.com/VenusProtocol/isolated-pools/commit/4516940822a6d5cdf41a9d71b700ae7172cd5950))
* updating deployment files ([f99a7f8](https://github.com/VenusProtocol/isolated-pools/commit/f99a7f85c891a18f2abd45ef78dde28c0236fedf))
* updating deployment files ([8aceb7a](https://github.com/VenusProtocol/isolated-pools/commit/8aceb7a9fbc12b8b335d0b74560a471c4b7bba8f))
* updating deployment files ([56ac0dc](https://github.com/VenusProtocol/isolated-pools/commit/56ac0dc822efbd87c8fb21044d00483ed43b3bdc))
* updating deployment files ([b1c4131](https://github.com/VenusProtocol/isolated-pools/commit/b1c4131d531c1b88ed37642544521802e468ea01))
* updating deployment files ([2e64131](https://github.com/VenusProtocol/isolated-pools/commit/2e64131d2ec1f322161ded7d243b67d851fbfe10))
* updating deployment files ([43cda83](https://github.com/VenusProtocol/isolated-pools/commit/43cda8306281f2613bb0e2cf3815399ce349c44b))
* updating deployment files ([a4d470c](https://github.com/VenusProtocol/isolated-pools/commit/a4d470ca4cf846e1ea651482573ec110128fea9b))
* updating deployment files ([6ee64eb](https://github.com/VenusProtocol/isolated-pools/commit/6ee64eb1026d55b22813514dfdeb9be2b9f5f78e))
* updating deployment files ([5959aed](https://github.com/VenusProtocol/isolated-pools/commit/5959aeddbda41018d8b7af2ac74073183abbe02c))
* updating deployment files ([f6b23d2](https://github.com/VenusProtocol/isolated-pools/commit/f6b23d23a9a7c8ff292e35e2425f69ac0af3fa6f))
* updating deployment files ([fd00e09](https://github.com/VenusProtocol/isolated-pools/commit/fd00e09b0e5621f68ba45b0f0314a76b2e308495))


### Bug Fixes

* added checks for negative value ([686e170](https://github.com/VenusProtocol/isolated-pools/commit/686e1702e15a83b17ef4c3b4640990c117cf34bf))
* added indexed to event ([622cb17](https://github.com/VenusProtocol/isolated-pools/commit/622cb1736374703865ea0fa7ca5f9ce677b8dd9a))
* added missing solcinputs ([0d4f2e3](https://github.com/VenusProtocol/isolated-pools/commit/0d4f2e39454bec903890238e414ba5deefd995bf))
* added test for negative values ([5a93f4d](https://github.com/VenusProtocol/isolated-pools/commit/5a93f4d1b4d23d93b33b027f3aa72bd47e05d987))
* added tests for above kink2 utilization rate ([43bf1e8](https://github.com/VenusProtocol/isolated-pools/commit/43bf1e896dfe9775b31baaa6fb838a1a7f231292))
* added unlist function ([9999eda](https://github.com/VenusProtocol/isolated-pools/commit/9999eda0633ae52f1562355d442fa13207eee02b))
* below kink1 test ([852760c](https://github.com/VenusProtocol/isolated-pools/commit/852760c73b9fb4a6e85490937696a05efe06c43e))
* change storage to memory ([9584519](https://github.com/VenusProtocol/isolated-pools/commit/95845196dc97f66ed44469113848e47551a5221b))
* ci.yaml ([4ff3df8](https://github.com/VenusProtocol/isolated-pools/commit/4ff3df8f69fabcde59219d8f782610c1a679f229))
* CVP-01 ([9fd7543](https://github.com/VenusProtocol/isolated-pools/commit/9fd7543e8dd541f4a29c8cf76ef574ec573a3f7a))
* deploy mock exETH ([0fe8e51](https://github.com/VenusProtocol/isolated-pools/commit/0fe8e51a11110e79ea66a96c770fd8a636e60225))
* deployed comptroller in bsctestnet ([ac789d2](https://github.com/VenusProtocol/isolated-pools/commit/ac789d2536753dc22942e61f97642ff9e3724daa))
* deployed IRM ([8a531a7](https://github.com/VenusProtocol/isolated-pools/commit/8a531a7f0436819105b42622682e330489ab4d31))
* deployed mock weETHs ([49dc4e8](https://github.com/VenusProtocol/isolated-pools/commit/49dc4e886110b7689af5aef4018010f8aa2dcec5))
* deployed on arb sepolia ([e25fc16](https://github.com/VenusProtocol/isolated-pools/commit/e25fc16bbd28bd38e5b71138c56de40e548d3b34))
* deployed on eth ([7fc2913](https://github.com/VenusProtocol/isolated-pools/commit/7fc2913accb19c90c768ae5794163a2248ed9dc7))
* deployed on ethereum and arbitrumone ([c5d4db7](https://github.com/VenusProtocol/isolated-pools/commit/c5d4db72cbb9eba1f50f861be8ad980d7ba0b77d))
* deployed on sepolia and opbnb testnet ([e36b799](https://github.com/VenusProtocol/isolated-pools/commit/e36b799cadae975a78f9668081a18d29fec00b62))
* deployed vtoken ([040088e](https://github.com/VenusProtocol/isolated-pools/commit/040088e17b31bb95e927f462dd8591c7df3adeec))
* deployed vtoken on ethereum ([bbfddc7](https://github.com/VenusProtocol/isolated-pools/commit/bbfddc71c7aaec5ec15f67576df1f038446f4817))
* deployed vtoken on sepolia ([f7726a0](https://github.com/VenusProtocol/isolated-pools/commit/f7726a0a09b89434c1f0aa347a7f7f4502b91ec4))
* deployment on testnets - wip ([ebed4aa](https://github.com/VenusProtocol/isolated-pools/commit/ebed4aaa4ea7feeb885eed55e56bcea42c74ff65))
* fix CI ([dddcd83](https://github.com/VenusProtocol/isolated-pools/commit/dddcd832ce777aa40c719255c8efc7806b8c415f))
* fixed compile error ([bba744b](https://github.com/VenusProtocol/isolated-pools/commit/bba744b2241123867debe7cefaaf7285b26599f8))
* fixed lint ([cc97eb0](https://github.com/VenusProtocol/isolated-pools/commit/cc97eb0f7067bc50d3f17ac363b06b4379558b81))
* fixed lint ([3e957f1](https://github.com/VenusProtocol/isolated-pools/commit/3e957f159f27f17828018af849c036bfe8722bf1))
* fixed yarn.lock ([b03cb62](https://github.com/VenusProtocol/isolated-pools/commit/b03cb62c9c2dd9bc5f792b31a574ee35ecb8c8d5))
* fork tests for all chains ([5beeda7](https://github.com/VenusProtocol/isolated-pools/commit/5beeda7490c7a1e03a4d0fe04bd66651516ccf65))
* fork tests for all networks ([230e80e](https://github.com/VenusProtocol/isolated-pools/commit/230e80e0ac31ebc24bd06995be9a82335a8ae118))
* nativeTokenGateway, liquidation and reduceReserves fork tests ([a47277f](https://github.com/VenusProtocol/isolated-pools/commit/a47277fa5a37d39f9c94b32519345946984064ff))
* negative multiplier ([5e7f6e5](https://github.com/VenusProtocol/isolated-pools/commit/5e7f6e5617af70b3a0793754f2c9ff9d0f77f31e))
* only unlist without updating state ([0b3a26b](https://github.com/VenusProtocol/isolated-pools/commit/0b3a26bb23a359af6435f3d3b95a116bd1301a88))
* optimised getAssetsIn ([7e1902a](https://github.com/VenusProtocol/isolated-pools/commit/7e1902aecbf7afc9842bcb15c2dbf6e0deb25d63))
* pr comments ([3dc571e](https://github.com/VenusProtocol/isolated-pools/commit/3dc571e86438747cd2695b1adca4f8f916ffdaad))
* prettier and linter ([f051ad1](https://github.com/VenusProtocol/isolated-pools/commit/f051ad1e89bb00f2069c23ee654482c61c5bec79))
* rebased ([6dacce2](https://github.com/VenusProtocol/isolated-pools/commit/6dacce26423d08c47f681163f96922bcb30f7add))
* redeployed contracts ([03519d6](https://github.com/VenusProtocol/isolated-pools/commit/03519d63dede56dc0b7be184bd1262ddf492626b))
* remove maxFeePerGas param, as needed occasionally ([310033a](https://github.com/VenusProtocol/isolated-pools/commit/310033ab2e08ddde1bc2bd8f807b76f1cf0e57ed))
* remove unused func ([147e6d0](https://github.com/VenusProtocol/isolated-pools/commit/147e6d0ff168dc193049840aced2188b48887187))
* removed deployments ([5fd036c](https://github.com/VenusProtocol/isolated-pools/commit/5fd036c73d95e67b2c638ba59427e24f9bc11caf))
* removed unwanted deployment file ([cb1826e](https://github.com/VenusProtocol/isolated-pools/commit/cb1826ea8ff6919f2dd4eaa57d0ef17ac630ae6c))
* removed update and acm ([9a10ba0](https://github.com/VenusProtocol/isolated-pools/commit/9a10ba031d82156a0efa7a9a8195d122f9e844e1))
* rename USDC to USDC.e ([97ceecb](https://github.com/VenusProtocol/isolated-pools/commit/97ceecbacd5e991f8703fa6cd39bae6e252742dd))
* resolved conflict ([54ad9ee](https://github.com/VenusProtocol/isolated-pools/commit/54ad9ee304deabeae268c13442e93b28fef27949))
* resolved conflict ([89dc5f4](https://github.com/VenusProtocol/isolated-pools/commit/89dc5f446c5a008b1ec8b8b6154b81222427791d))
* resolved conflict ([26070c2](https://github.com/VenusProtocol/isolated-pools/commit/26070c23795862f7249c787b9f101888ca1a0464))
* resolved conflict ([f85f96e](https://github.com/VenusProtocol/isolated-pools/commit/f85f96e85b571ba2ec6103c2217640c2be001ab8))
* resolved conflict ([1b21f05](https://github.com/VenusProtocol/isolated-pools/commit/1b21f05afd655d3e2c9e6db3da9d1fea03c60f30))
* resolved conflicts ([dbc5584](https://github.com/VenusProtocol/isolated-pools/commit/dbc5584fbb40f3dad5c7196b466021d0541c23e2))
* run prettier ([f6011c7](https://github.com/VenusProtocol/isolated-pools/commit/f6011c708c449ac843dd388584063c7b30ef1810))
* test above kink1 and below kink2 ([5d01bb0](https://github.com/VenusProtocol/isolated-pools/commit/5d01bb0dc462b6dc2c68ed090b8d99687bba850a))
* test description ([97871b8](https://github.com/VenusProtocol/isolated-pools/commit/97871b8c0cdf7f7e310ea0d90350242713c072d1))
* tests ([3e943c3](https://github.com/VenusProtocol/isolated-pools/commit/3e943c383af65feca87ceda58443a5311f993c00))
* tests ([51b66c9](https://github.com/VenusProtocol/isolated-pools/commit/51b66c9c48b0771a96ecb4a1903a53332f5e2203))
* tests for unlist ([8ad5761](https://github.com/VenusProtocol/isolated-pools/commit/8ad5761ad04247c9888cc19ceb16a08a13858f63))
* update vToken receiver addresses for the arbitrumone LSETH pool ([636f717](https://github.com/VenusProtocol/isolated-pools/commit/636f717b9383755ad65f7ae8ccbdb79f7614a3f7))
* updated borrow rate ([3225de5](https://github.com/VenusProtocol/isolated-pools/commit/3225de5968fd4f2dbe7e9ae070e74e7576d9147c))
* updated comment ([8492092](https://github.com/VenusProtocol/isolated-pools/commit/8492092f6276bcc46671e6bf23fdb42085142416))
* updated vars ([b0242c7](https://github.com/VenusProtocol/isolated-pools/commit/b0242c7bf86e2f29a4f17b8d255c894a266035f4))
* updated yarn lock ([d2a0403](https://github.com/VenusProtocol/isolated-pools/commit/d2a0403b683aa93e8c9c2410f8494d815ad4f536))
* updates getAssetsIn ([99e8dd8](https://github.com/VenusProtocol/isolated-pools/commit/99e8dd8f44dc56b8ba41fa50900f7f5f1b77f3b3))
* ven-s2 ([499a6bb](https://github.com/VenusProtocol/isolated-pools/commit/499a6bb3f52ef6df174f1e5f4bec51455801227f))
* ven-s3 ([2044826](https://github.com/VenusProtocol/isolated-pools/commit/2044826425fbf80d1e6877741c260c49707a68f6))
* vpb-01 ([455533e](https://github.com/VenusProtocol/isolated-pools/commit/455533e0eb2213fc8ec29a983389868e25f42038))
* vpb-01 ([66662d1](https://github.com/VenusProtocol/isolated-pools/commit/66662d1338ad5e46dbb0c2090296d4b705b1d7d2))
* VPB-01 ([144cb97](https://github.com/VenusProtocol/isolated-pools/commit/144cb9761cc3da4215dda2240b68d939c2e586f7))
* vpb-02 ([00fdcdb](https://github.com/VenusProtocol/isolated-pools/commit/00fdcdbbe86608a8c8d4783a4818c0c94e2c7bf8))
* vpb-03 ([ece3379](https://github.com/VenusProtocol/isolated-pools/commit/ece33796e826a15b70df06a5a1d2385e80feaa92))
* vpb-03 alleviation ([37ffc79](https://github.com/VenusProtocol/isolated-pools/commit/37ffc7963b209a61d2afc92bd061398268f163ae))
* vpb-05 ([dd52dc9](https://github.com/VenusProtocol/isolated-pools/commit/dd52dc9e40ddd60af5246a0eb65c52cbf27ce7fd))
* VPB-05 ([f038e3e](https://github.com/VenusProtocol/isolated-pools/commit/f038e3edbfae79b2c5fa9eafbf8f7f2b1767cec7))

## [3.5.0-dev.14](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.13...v3.5.0-dev.14) (2024-09-10)


### Features

* bump dependencies with venus packages ([8d71a4d](https://github.com/VenusProtocol/isolated-pools/commit/8d71a4d72b59f8076245b5f68875631dd1e105c4))

## [3.5.0-dev.13](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.12...v3.5.0-dev.13) (2024-09-10)


### Features

* add IL deployments on zksync mainnet ([ec7303f](https://github.com/VenusProtocol/isolated-pools/commit/ec7303fe8eb63fe31b0237085d5c5c551753bd27))
* deployments of NTG on zksync ([9e78b8d](https://github.com/VenusProtocol/isolated-pools/commit/9e78b8d892b45c1f33cfda8804bae46d417b8b2f))
* export deployment ([d4bdbe2](https://github.com/VenusProtocol/isolated-pools/commit/d4bdbe2752d181b9b20f621ec57430adc5f06962))
* redeploy IL with updated zksolc & new comptroller implementation ([8ef42d6](https://github.com/VenusProtocol/isolated-pools/commit/8ef42d62c2b01158c8af7a7982ba055aa70fa8eb))
* redeploy NTG with updated zksolc version ([b93f63e](https://github.com/VenusProtocol/isolated-pools/commit/b93f63e67d6f1f556085b0ee56ad672eaf6ebcd8))
* updating deployment files ([e87caaa](https://github.com/VenusProtocol/isolated-pools/commit/e87caaad46b3774774e7f8d499f4cdca69f20637))
* updating deployment files ([74c4112](https://github.com/VenusProtocol/isolated-pools/commit/74c4112ab0e25b00a51598a610bb9c8a1e2cea05))
* updating deployment files ([1286259](https://github.com/VenusProtocol/isolated-pools/commit/12862592d7193e7c85391d45a2fa4a892740e778))
* updating deployment files ([d9873c5](https://github.com/VenusProtocol/isolated-pools/commit/d9873c55961f9c930ebee07272ae11caf3bb966d))

## [3.5.0-dev.12](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.11...v3.5.0-dev.12) (2024-09-10)


### Features

* add config for liquid staked ETH pool for arbitrum one ([a9fb3d7](https://github.com/VenusProtocol/isolated-pools/commit/a9fb3d7e8544ed2690571315d118c9705f80856c))
* add deployment files for NTG on arbitrum one for liquid staked ETH pool ([3849676](https://github.com/VenusProtocol/isolated-pools/commit/3849676704951138f870d109f4ea211fecbd259d))
* add deployment files for NTG on arbitrum sepolia for liquid staked ETH pool ([44f17e0](https://github.com/VenusProtocol/isolated-pools/commit/44f17e0f2b3e80a4898224ae1a291b85817500f4))
* deployment files for liquid staked ETH for arbitrum one ([2ce558a](https://github.com/VenusProtocol/isolated-pools/commit/2ce558ab6e622e8951c48152340b9ac2f62c09a9))
* deployment files for the reward distributor for LSETH pool on arbitrumone ([8c41986](https://github.com/VenusProtocol/isolated-pools/commit/8c419866f346c7a0c9cdf0949743292ec9fe8de8))
* updating deployment files ([537def1](https://github.com/VenusProtocol/isolated-pools/commit/537def123109e667a26c02af052b4c3002255ace))
* updating deployment files ([4665e93](https://github.com/VenusProtocol/isolated-pools/commit/4665e93e2905abf0ef50f81cbcbf558bb2e04360))
* updating deployment files ([89b9e3f](https://github.com/VenusProtocol/isolated-pools/commit/89b9e3f7807cd73be3373fae673f4871df45533b))


### Bug Fixes

* pr comments ([3dc571e](https://github.com/VenusProtocol/isolated-pools/commit/3dc571e86438747cd2695b1adca4f8f916ffdaad))
* prettier and linter ([f051ad1](https://github.com/VenusProtocol/isolated-pools/commit/f051ad1e89bb00f2069c23ee654482c61c5bec79))
* update vToken receiver addresses for the arbitrumone LSETH pool ([636f717](https://github.com/VenusProtocol/isolated-pools/commit/636f717b9383755ad65f7ae8ccbdb79f7614a3f7))

## [3.5.0-dev.11](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.10...v3.5.0-dev.11) (2024-09-05)


### Features

* updating deployment files ([581c592](https://github.com/VenusProtocol/isolated-pools/commit/581c5922096da418c99ae928251660e8c7d0fe98))
* updating deployment files ([7d25caf](https://github.com/VenusProtocol/isolated-pools/commit/7d25caf803e48480368515edc5d0805136ed194f))
* updating deployment files ([2e64131](https://github.com/VenusProtocol/isolated-pools/commit/2e64131d2ec1f322161ded7d243b67d851fbfe10))
* updating deployment files ([43cda83](https://github.com/VenusProtocol/isolated-pools/commit/43cda8306281f2613bb0e2cf3815399ce349c44b))
* updating deployment files ([a4d470c](https://github.com/VenusProtocol/isolated-pools/commit/a4d470ca4cf846e1ea651482573ec110128fea9b))
* updating deployment files ([6ee64eb](https://github.com/VenusProtocol/isolated-pools/commit/6ee64eb1026d55b22813514dfdeb9be2b9f5f78e))
* updating deployment files ([5959aed](https://github.com/VenusProtocol/isolated-pools/commit/5959aeddbda41018d8b7af2ac74073183abbe02c))


### Bug Fixes

* added indexed to event ([622cb17](https://github.com/VenusProtocol/isolated-pools/commit/622cb1736374703865ea0fa7ca5f9ce677b8dd9a))
* added missing solcinputs ([0d4f2e3](https://github.com/VenusProtocol/isolated-pools/commit/0d4f2e39454bec903890238e414ba5deefd995bf))
* added unlist function ([9999eda](https://github.com/VenusProtocol/isolated-pools/commit/9999eda0633ae52f1562355d442fa13207eee02b))
* change storage to memory ([9584519](https://github.com/VenusProtocol/isolated-pools/commit/95845196dc97f66ed44469113848e47551a5221b))
* CVP-01 ([9fd7543](https://github.com/VenusProtocol/isolated-pools/commit/9fd7543e8dd541f4a29c8cf76ef574ec573a3f7a))
* deployed comptroller in bsctestnet ([ac789d2](https://github.com/VenusProtocol/isolated-pools/commit/ac789d2536753dc22942e61f97642ff9e3724daa))
* deployed on arb sepolia ([e25fc16](https://github.com/VenusProtocol/isolated-pools/commit/e25fc16bbd28bd38e5b71138c56de40e548d3b34))
* deployed on ethereum and arbitrumone ([c5d4db7](https://github.com/VenusProtocol/isolated-pools/commit/c5d4db72cbb9eba1f50f861be8ad980d7ba0b77d))
* deployed on sepolia and opbnb testnet ([e36b799](https://github.com/VenusProtocol/isolated-pools/commit/e36b799cadae975a78f9668081a18d29fec00b62))
* deployment on testnets - wip ([ebed4aa](https://github.com/VenusProtocol/isolated-pools/commit/ebed4aaa4ea7feeb885eed55e56bcea42c74ff65))
* fix CI ([dddcd83](https://github.com/VenusProtocol/isolated-pools/commit/dddcd832ce777aa40c719255c8efc7806b8c415f))
* fixed compile error ([bba744b](https://github.com/VenusProtocol/isolated-pools/commit/bba744b2241123867debe7cefaaf7285b26599f8))
* fixed lint ([3e957f1](https://github.com/VenusProtocol/isolated-pools/commit/3e957f159f27f17828018af849c036bfe8722bf1))
* fixed yarn.lock ([b03cb62](https://github.com/VenusProtocol/isolated-pools/commit/b03cb62c9c2dd9bc5f792b31a574ee35ecb8c8d5))
* only unlist without updating state ([0b3a26b](https://github.com/VenusProtocol/isolated-pools/commit/0b3a26bb23a359af6435f3d3b95a116bd1301a88))
* optimised getAssetsIn ([7e1902a](https://github.com/VenusProtocol/isolated-pools/commit/7e1902aecbf7afc9842bcb15c2dbf6e0deb25d63))
* rebased ([6dacce2](https://github.com/VenusProtocol/isolated-pools/commit/6dacce26423d08c47f681163f96922bcb30f7add))
* redeployed contracts ([03519d6](https://github.com/VenusProtocol/isolated-pools/commit/03519d63dede56dc0b7be184bd1262ddf492626b))
* removed deployments ([5fd036c](https://github.com/VenusProtocol/isolated-pools/commit/5fd036c73d95e67b2c638ba59427e24f9bc11caf))
* removed unwanted deployment file ([cb1826e](https://github.com/VenusProtocol/isolated-pools/commit/cb1826ea8ff6919f2dd4eaa57d0ef17ac630ae6c))
* resolved conflict ([54ad9ee](https://github.com/VenusProtocol/isolated-pools/commit/54ad9ee304deabeae268c13442e93b28fef27949))
* resolved conflict ([89dc5f4](https://github.com/VenusProtocol/isolated-pools/commit/89dc5f446c5a008b1ec8b8b6154b81222427791d))
* resolved conflict ([26070c2](https://github.com/VenusProtocol/isolated-pools/commit/26070c23795862f7249c787b9f101888ca1a0464))
* resolved conflict ([f85f96e](https://github.com/VenusProtocol/isolated-pools/commit/f85f96e85b571ba2ec6103c2217640c2be001ab8))
* resolved conflict ([1b21f05](https://github.com/VenusProtocol/isolated-pools/commit/1b21f05afd655d3e2c9e6db3da9d1fea03c60f30))
* test description ([97871b8](https://github.com/VenusProtocol/isolated-pools/commit/97871b8c0cdf7f7e310ea0d90350242713c072d1))
* tests for unlist ([8ad5761](https://github.com/VenusProtocol/isolated-pools/commit/8ad5761ad04247c9888cc19ceb16a08a13858f63))
* updated yarn lock ([d2a0403](https://github.com/VenusProtocol/isolated-pools/commit/d2a0403b683aa93e8c9c2410f8494d815ad4f536))
* updates getAssetsIn ([99e8dd8](https://github.com/VenusProtocol/isolated-pools/commit/99e8dd8f44dc56b8ba41fa50900f7f5f1b77f3b3))
* VPB-01 ([144cb97](https://github.com/VenusProtocol/isolated-pools/commit/144cb9761cc3da4215dda2240b68d939c2e586f7))
* VPB-05 ([f038e3e](https://github.com/VenusProtocol/isolated-pools/commit/f038e3edbfae79b2c5fa9eafbf8f7f2b1767cec7))

## [3.5.0-dev.10](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.9...v3.5.0-dev.10) (2024-08-23)


### Features

* add config for Liquid Staked ETH pool for arbitrum sepolia ([a25a43c](https://github.com/VenusProtocol/isolated-pools/commit/a25a43ca3a15d82bec1cd3620865c5eb0d783572))
* add deployment files for Liquid Staked ETH pool for arbitrum sepolia ([9028873](https://github.com/VenusProtocol/isolated-pools/commit/90288734f6ec58c6d1fb45c0d3b1b56db209f6b0))
* updating deployment files ([f1c5e80](https://github.com/VenusProtocol/isolated-pools/commit/f1c5e808ae3b202e772eb2c4f2f3f39c09a930b2))

## [3.5.0-dev.9](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.8...v3.5.0-dev.9) (2024-08-23)


### Features

* updating deployment files ([0ad2acc](https://github.com/VenusProtocol/isolated-pools/commit/0ad2acce2cea9879ea3837dc42f0e67502bee67a))
* updating deployment files ([54a2520](https://github.com/VenusProtocol/isolated-pools/commit/54a25207f7ddb532ac1680adef175d078bb16ddf))
* updating deployment files ([44abed1](https://github.com/VenusProtocol/isolated-pools/commit/44abed15cf210f5e6d6cd1a857db1af2f0871876))


### Bug Fixes

* deployed mock weETHs ([49dc4e8](https://github.com/VenusProtocol/isolated-pools/commit/49dc4e886110b7689af5aef4018010f8aa2dcec5))
* deployed vtoken ([040088e](https://github.com/VenusProtocol/isolated-pools/commit/040088e17b31bb95e927f462dd8591c7df3adeec))
* deployed vtoken on ethereum ([bbfddc7](https://github.com/VenusProtocol/isolated-pools/commit/bbfddc71c7aaec5ec15f67576df1f038446f4817))

## [3.5.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.7...v3.5.0-dev.8) (2024-08-23)


### Features

* add interest rate model deployments for Chaos recs ([3205565](https://github.com/VenusProtocol/isolated-pools/commit/32055654b94088fa92c1b61a5a7a0ba72af8df4e))
* updating deployment files ([20b8086](https://github.com/VenusProtocol/isolated-pools/commit/20b8086a7da7cf14e58a9d057bfca90d846cf7b3))

## [3.5.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.6...v3.5.0-dev.7) (2024-08-21)


### Bug Fixes

* added checks for negative value ([686e170](https://github.com/VenusProtocol/isolated-pools/commit/686e1702e15a83b17ef4c3b4640990c117cf34bf))
* added test for negative values ([5a93f4d](https://github.com/VenusProtocol/isolated-pools/commit/5a93f4d1b4d23d93b33b027f3aa72bd47e05d987))
* added tests for above kink2 utilization rate ([43bf1e8](https://github.com/VenusProtocol/isolated-pools/commit/43bf1e896dfe9775b31baaa6fb838a1a7f231292))
* below kink1 test ([852760c](https://github.com/VenusProtocol/isolated-pools/commit/852760c73b9fb4a6e85490937696a05efe06c43e))
* negative multiplier ([5e7f6e5](https://github.com/VenusProtocol/isolated-pools/commit/5e7f6e5617af70b3a0793754f2c9ff9d0f77f31e))
* remove unused func ([147e6d0](https://github.com/VenusProtocol/isolated-pools/commit/147e6d0ff168dc193049840aced2188b48887187))
* removed update and acm ([9a10ba0](https://github.com/VenusProtocol/isolated-pools/commit/9a10ba031d82156a0efa7a9a8195d122f9e844e1))
* test above kink1 and below kink2 ([5d01bb0](https://github.com/VenusProtocol/isolated-pools/commit/5d01bb0dc462b6dc2c68ed090b8d99687bba850a))
* updated borrow rate ([3225de5](https://github.com/VenusProtocol/isolated-pools/commit/3225de5968fd4f2dbe7e9ae070e74e7576d9147c))
* updated comment ([8492092](https://github.com/VenusProtocol/isolated-pools/commit/8492092f6276bcc46671e6bf23fdb42085142416))
* updated vars ([b0242c7](https://github.com/VenusProtocol/isolated-pools/commit/b0242c7bf86e2f29a4f17b8d255c894a266035f4))
* ven-s2 ([499a6bb](https://github.com/VenusProtocol/isolated-pools/commit/499a6bb3f52ef6df174f1e5f4bec51455801227f))
* ven-s3 ([2044826](https://github.com/VenusProtocol/isolated-pools/commit/2044826425fbf80d1e6877741c260c49707a68f6))
* vpb-01 ([455533e](https://github.com/VenusProtocol/isolated-pools/commit/455533e0eb2213fc8ec29a983389868e25f42038))
* vpb-01 ([66662d1](https://github.com/VenusProtocol/isolated-pools/commit/66662d1338ad5e46dbb0c2090296d4b705b1d7d2))
* vpb-02 ([00fdcdb](https://github.com/VenusProtocol/isolated-pools/commit/00fdcdbbe86608a8c8d4783a4818c0c94e2c7bf8))
* vpb-03 ([ece3379](https://github.com/VenusProtocol/isolated-pools/commit/ece33796e826a15b70df06a5a1d2385e80feaa92))
* vpb-03 alleviation ([37ffc79](https://github.com/VenusProtocol/isolated-pools/commit/37ffc7963b209a61d2afc92bd061398268f163ae))
* vpb-05 ([dd52dc9](https://github.com/VenusProtocol/isolated-pools/commit/dd52dc9e40ddd60af5246a0eb65c52cbf27ce7fd))

## [3.5.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.5...v3.5.0-dev.6) (2024-08-16)


### Features

* updating deployment files ([29f152e](https://github.com/VenusProtocol/isolated-pools/commit/29f152efbe74f7e77927cfdcbdea442abe647c43))


### Bug Fixes

* deployed IRM ([8a531a7](https://github.com/VenusProtocol/isolated-pools/commit/8a531a7f0436819105b42622682e330489ab4d31))

## [3.5.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.4...v3.5.0-dev.5) (2024-08-14)


### Features

* add deployments of Reward distributor ([3dfba03](https://github.com/VenusProtocol/isolated-pools/commit/3dfba033de819f7c1daeaaca29f245b5d011bf4e))
* updating deployment files ([cbde010](https://github.com/VenusProtocol/isolated-pools/commit/cbde01099f52872024736ad41efb9003b7b262e1))

## [3.5.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.3...v3.5.0-dev.4) (2024-08-08)


### Features

* NTG deployment on zksync sepolia ([c41ce20](https://github.com/VenusProtocol/isolated-pools/commit/c41ce20b5dab0526bbc7e99a3b6bdc4eb550a4f8))
* updating deployment files ([f725336](https://github.com/VenusProtocol/isolated-pools/commit/f7253365e4bbc6504fb0341527225bb0d2d6b7ea))


### Bug Fixes

* remove maxFeePerGas param, as needed occasionally ([310033a](https://github.com/VenusProtocol/isolated-pools/commit/310033ab2e08ddde1bc2bd8f807b76f1cf0e57ed))

## [3.5.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.2...v3.5.0-dev.3) (2024-08-02)


### Features

* add ZK token ([fc33b47](https://github.com/VenusProtocol/isolated-pools/commit/fc33b47e8491df31551417b1b4b8dab58b5d2fcb))
* deploy mock tokens on zksync sepolia ([6f4f70e](https://github.com/VenusProtocol/isolated-pools/commit/6f4f70e4a7a2725ec5489d62bc81719f4a217172))
* IL deployment on zksync sepolia ([2bc1be0](https://github.com/VenusProtocol/isolated-pools/commit/2bc1be0fe0954906923d0d05270958748eba519a))
* updating deployment files ([68021c9](https://github.com/VenusProtocol/isolated-pools/commit/68021c97695548e0c776b3c2dad64e0574642691))
* updating deployment files ([4516940](https://github.com/VenusProtocol/isolated-pools/commit/4516940822a6d5cdf41a9d71b700ae7172cd5950))
* updating deployment files ([f99a7f8](https://github.com/VenusProtocol/isolated-pools/commit/f99a7f85c891a18f2abd45ef78dde28c0236fedf))
* updating deployment files ([b1c4131](https://github.com/VenusProtocol/isolated-pools/commit/b1c4131d531c1b88ed37642544521802e468ea01))


### Bug Fixes

* ci.yaml ([4ff3df8](https://github.com/VenusProtocol/isolated-pools/commit/4ff3df8f69fabcde59219d8f782610c1a679f229))
* rename USDC to USDC.e ([97ceecb](https://github.com/VenusProtocol/isolated-pools/commit/97ceecbacd5e991f8703fa6cd39bae6e252742dd))
* run prettier ([f6011c7](https://github.com/VenusProtocol/isolated-pools/commit/f6011c708c449ac843dd388584063c7b30ef1810))

## [3.5.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.5.0-dev.1...v3.5.0-dev.2) (2024-07-29)


### Features

* updating deployment files ([8aceb7a](https://github.com/VenusProtocol/isolated-pools/commit/8aceb7a9fbc12b8b335d0b74560a471c4b7bba8f))
* updating deployment files ([56ac0dc](https://github.com/VenusProtocol/isolated-pools/commit/56ac0dc822efbd87c8fb21044d00483ed43b3bdc))


### Bug Fixes

* deploy mock exETH ([0fe8e51](https://github.com/VenusProtocol/isolated-pools/commit/0fe8e51a11110e79ea66a96c770fd8a636e60225))
* deployed on eth ([7fc2913](https://github.com/VenusProtocol/isolated-pools/commit/7fc2913accb19c90c768ae5794163a2248ed9dc7))
* deployed vtoken on sepolia ([f7726a0](https://github.com/VenusProtocol/isolated-pools/commit/f7726a0a09b89434c1f0aa347a7f7f4502b91ec4))
* fixed lint ([cc97eb0](https://github.com/VenusProtocol/isolated-pools/commit/cc97eb0f7067bc50d3f17ac363b06b4379558b81))

## [3.5.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0...v3.5.0-dev.1) (2024-07-26)


### Features

* add ethereum addresses ([cfdcf00](https://github.com/VenusProtocol/isolated-pools/commit/cfdcf00f7aa2b39aac751c67c0c1f2777deeb825))
* updating deployment files ([f6b23d2](https://github.com/VenusProtocol/isolated-pools/commit/f6b23d23a9a7c8ff292e35e2425f69ac0af3fa6f))
* updating deployment files ([fd00e09](https://github.com/VenusProtocol/isolated-pools/commit/fd00e09b0e5621f68ba45b0f0314a76b2e308495))


### Bug Fixes

* fork tests for all chains ([5beeda7](https://github.com/VenusProtocol/isolated-pools/commit/5beeda7490c7a1e03a4d0fe04bd66651516ccf65))
* fork tests for all networks ([230e80e](https://github.com/VenusProtocol/isolated-pools/commit/230e80e0ac31ebc24bd06995be9a82335a8ae118))
* nativeTokenGateway, liquidation and reduceReserves fork tests ([a47277f](https://github.com/VenusProtocol/isolated-pools/commit/a47277fa5a37d39f9c94b32519345946984064ff))
* resolved conflicts ([dbc5584](https://github.com/VenusProtocol/isolated-pools/commit/dbc5584fbb40f3dad5c7196b466021d0541c23e2))
* tests ([3e943c3](https://github.com/VenusProtocol/isolated-pools/commit/3e943c383af65feca87ceda58443a5311f993c00))
* tests ([51b66c9](https://github.com/VenusProtocol/isolated-pools/commit/51b66c9c48b0771a96ecb4a1903a53332f5e2203))

## [3.4.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.3.0...v3.4.0) (2024-07-18)


### Features

* add bootstrap liquidity and vtoken receiver for rsETH on Ethereum ([562a165](https://github.com/VenusProtocol/isolated-pools/commit/562a165994dd223b7cc677546d0422382efe0f77))
* add rsETH market deployment on Ethereum ([1fc4580](https://github.com/VenusProtocol/isolated-pools/commit/1fc45803e14c9169678e51bd6ca503bb325e7142))
* add rsETH market on sepolia ([7d91a18](https://github.com/VenusProtocol/isolated-pools/commit/7d91a1871605680b38647dfa5bfd39ee340c45b4))
* deploy comptroller implementation to ethereum ([9f7a7f0](https://github.com/VenusProtocol/isolated-pools/commit/9f7a7f09c587626980270e3d9e6798ae6f09913d))
* deploy comptroller implementation to sepolia ([63b8f77](https://github.com/VenusProtocol/isolated-pools/commit/63b8f77c56eed2484e30580e2376c85dcbb39d06))
* deploy new ETH rewards distributors ([5b08633](https://github.com/VenusProtocol/isolated-pools/commit/5b08633e4bb66c2b5ccf88ae9b851e93fc08e985))
* updating deployment files ([56c1ca4](https://github.com/VenusProtocol/isolated-pools/commit/56c1ca4a82e807b1c2cb3fe5857c1c1047899928))
* updating deployment files ([9eea189](https://github.com/VenusProtocol/isolated-pools/commit/9eea189c69dc9357d9ea35bbd0cfe9eb5d844a6a))
* updating deployment files ([387bb21](https://github.com/VenusProtocol/isolated-pools/commit/387bb214d8f61544eb8f09e71d7e1fed68ffd02b))
* updating deployment files ([ee77794](https://github.com/VenusProtocol/isolated-pools/commit/ee7779431e194d8f464412fcebeeb0f3af5ca5aa))
* updating deployment files ([0133f57](https://github.com/VenusProtocol/isolated-pools/commit/0133f579dafe2a87ce4aac33d5488eba1466bbcd))
* updating deployment files ([dfbba43](https://github.com/VenusProtocol/isolated-pools/commit/dfbba43b86c992aacd570acfc37f31a9400ae7c9))
* updating deployment files ([24e06de](https://github.com/VenusProtocol/isolated-pools/commit/24e06de57d1b281a9f7278ee8917903f9f17cc66))
* updating deployment files ([cbb3af0](https://github.com/VenusProtocol/isolated-pools/commit/cbb3af087b74d855d320c884b7348b15746bf82b))


### Bug Fixes

* add id to configuration deployment script setting pool ownership ([68937b6](https://github.com/VenusProtocol/isolated-pools/commit/68937b666bf0977fe286c4cef99a0cb6f08285b0))
* add initial supply & vTokenReceiver on sepolia ([5d4cbf2](https://github.com/VenusProtocol/isolated-pools/commit/5d4cbf21469d7a0d5b92e3ddf11c2adf0e257e5b))
* added vtoken config ([ae481dd](https://github.com/VenusProtocol/isolated-pools/commit/ae481ddb84ae4833c95e37ff518c312056e3cb07))
* deploy new implementation when implementation contract changes ([5d40422](https://github.com/VenusProtocol/isolated-pools/commit/5d404229cb612c1558bb107e5cbb1a08efea23d1))
* deployed IR on ethereum ([7d9e2b5](https://github.com/VenusProtocol/isolated-pools/commit/7d9e2b52fd3ec302edf88d6476cf6ad2bfa62067))
* deployed mock sfrxETH ([a4bf7ac](https://github.com/VenusProtocol/isolated-pools/commit/a4bf7ac0dfb8aa1b6abd4457f28388bf2f5726f4))
* deployed vtoken on ethereum ([07407d2](https://github.com/VenusProtocol/isolated-pools/commit/07407d22594a07cfb0f30c4f41a75233065b3815))
* deployed vtoken` ([1484602](https://github.com/VenusProtocol/isolated-pools/commit/1484602c70ceeba7b6cab50c64bba076f1585ab6))
* deployed vtokens ([dd85cb7](https://github.com/VenusProtocol/isolated-pools/commit/dd85cb7b3e91ed3bda181c0ace3c097673ff4555))
* fixed initial supply ([c7b0f18](https://github.com/VenusProtocol/isolated-pools/commit/c7b0f188ddf6abd8c805c754e807f58666962552))
* fixed initialSupply ([4f1b80c](https://github.com/VenusProtocol/isolated-pools/commit/4f1b80cfacc35f24fd7680ad8d29072076d96564))
* fixed rewards ([9ea00ee](https://github.com/VenusProtocol/isolated-pools/commit/9ea00ee01dd3f783629b1db658c6b59ff7412153))
* fixed speed ([00afcb9](https://github.com/VenusProtocol/isolated-pools/commit/00afcb9415e5735fa13dc9dc532a00cee8ca4fdf))
* fixed vTokenReceiver ([f255cfe](https://github.com/VenusProtocol/isolated-pools/commit/f255cfee601107c6bb8842694e173a5002531f01))
* remove commented code ([cf718f3](https://github.com/VenusProtocol/isolated-pools/commit/cf718f30ed005d1aef35738a9383850794a012a1))
* removed deployments ([10b53e6](https://github.com/VenusProtocol/isolated-pools/commit/10b53e6db9af2a7a234affbbf670e7bdd62e139a))
* resolved conflict ([6d95945](https://github.com/VenusProtocol/isolated-pools/commit/6d959459c8839fca35107516b470469de85fa593))
* resolved conflict ([f04433e](https://github.com/VenusProtocol/isolated-pools/commit/f04433e6460b87d687a1f74a8396ce071acfe06b))
* resolved conflict ([0b82507](https://github.com/VenusProtocol/isolated-pools/commit/0b82507d2803bda2c66347ca62803cf6bc95d913))
* skip non existant comptroller on bsctestnet ([d3b0581](https://github.com/VenusProtocol/isolated-pools/commit/d3b058163c6a0609c813af7b45613e9185635908))
* uncommented code ([fcae00f](https://github.com/VenusProtocol/isolated-pools/commit/fcae00f928bdc0079675b0df93679ce38f97ef2b))
* uncommented code ([706ea77](https://github.com/VenusProtocol/isolated-pools/commit/706ea77d97215b195d0855e359b4f6ea2f9f6b4a))
* updated caps ([8ecf76f](https://github.com/VenusProtocol/isolated-pools/commit/8ecf76f8dcd681380db6386ff38658678b5bf931))
* updated deployment config ([87483bd](https://github.com/VenusProtocol/isolated-pools/commit/87483bdda3171a71e5b6b8f16993adc1f590301f))


### Reverts

* Revert "fix: remove initial liquidity commands from deploymets" ([3d2002f](https://github.com/VenusProtocol/isolated-pools/commit/3d2002f9cfa5f89b670c222b5b575df01b60857a))

## [3.4.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0-dev.5...v3.4.0-dev.6) (2024-07-15)


### Features

* deploy comptroller implementation to ethereum ([9f7a7f0](https://github.com/VenusProtocol/isolated-pools/commit/9f7a7f09c587626980270e3d9e6798ae6f09913d))
* deploy comptroller implementation to sepolia ([63b8f77](https://github.com/VenusProtocol/isolated-pools/commit/63b8f77c56eed2484e30580e2376c85dcbb39d06))
* updating deployment files ([56c1ca4](https://github.com/VenusProtocol/isolated-pools/commit/56c1ca4a82e807b1c2cb3fe5857c1c1047899928))


### Bug Fixes

* add id to configuration deployment script setting pool ownership ([68937b6](https://github.com/VenusProtocol/isolated-pools/commit/68937b666bf0977fe286c4cef99a0cb6f08285b0))
* deploy new implementation when implementation contract changes ([5d40422](https://github.com/VenusProtocol/isolated-pools/commit/5d404229cb612c1558bb107e5cbb1a08efea23d1))
* skip non existant comptroller on bsctestnet ([d3b0581](https://github.com/VenusProtocol/isolated-pools/commit/d3b058163c6a0609c813af7b45613e9185635908))


### Reverts

* Revert "fix: remove initial liquidity commands from deploymets" ([3d2002f](https://github.com/VenusProtocol/isolated-pools/commit/3d2002f9cfa5f89b670c222b5b575df01b60857a))

## [3.4.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0-dev.4...v3.4.0-dev.5) (2024-07-05)


### Features

* deploy new ETH rewards distributors ([5b08633](https://github.com/VenusProtocol/isolated-pools/commit/5b08633e4bb66c2b5ccf88ae9b851e93fc08e985))
* updating deployment files ([9eea189](https://github.com/VenusProtocol/isolated-pools/commit/9eea189c69dc9357d9ea35bbd0cfe9eb5d844a6a))

## [3.4.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0-dev.3...v3.4.0-dev.4) (2024-06-21)


### Features

* updating deployment files ([387bb21](https://github.com/VenusProtocol/isolated-pools/commit/387bb214d8f61544eb8f09e71d7e1fed68ffd02b))


### Bug Fixes

* deployed vtokens ([dd85cb7](https://github.com/VenusProtocol/isolated-pools/commit/dd85cb7b3e91ed3bda181c0ace3c097673ff4555))
* fixed initial supply ([c7b0f18](https://github.com/VenusProtocol/isolated-pools/commit/c7b0f188ddf6abd8c805c754e807f58666962552))
* fixed rewards ([9ea00ee](https://github.com/VenusProtocol/isolated-pools/commit/9ea00ee01dd3f783629b1db658c6b59ff7412153))
* fixed speed ([00afcb9](https://github.com/VenusProtocol/isolated-pools/commit/00afcb9415e5735fa13dc9dc532a00cee8ca4fdf))
* removed deployments ([10b53e6](https://github.com/VenusProtocol/isolated-pools/commit/10b53e6db9af2a7a234affbbf670e7bdd62e139a))
* updated deployment config ([87483bd](https://github.com/VenusProtocol/isolated-pools/commit/87483bdda3171a71e5b6b8f16993adc1f590301f))

## [3.4.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0-dev.2...v3.4.0-dev.3) (2024-06-20)


### Features

* updating deployment files ([ee77794](https://github.com/VenusProtocol/isolated-pools/commit/ee7779431e194d8f464412fcebeeb0f3af5ca5aa))
* updating deployment files ([0133f57](https://github.com/VenusProtocol/isolated-pools/commit/0133f579dafe2a87ce4aac33d5488eba1466bbcd))


### Bug Fixes

* added vtoken config ([ae481dd](https://github.com/VenusProtocol/isolated-pools/commit/ae481ddb84ae4833c95e37ff518c312056e3cb07))
* deployed IR on ethereum ([7d9e2b5](https://github.com/VenusProtocol/isolated-pools/commit/7d9e2b52fd3ec302edf88d6476cf6ad2bfa62067))
* deployed mock sfrxETH ([a4bf7ac](https://github.com/VenusProtocol/isolated-pools/commit/a4bf7ac0dfb8aa1b6abd4457f28388bf2f5726f4))
* deployed vtoken on ethereum ([07407d2](https://github.com/VenusProtocol/isolated-pools/commit/07407d22594a07cfb0f30c4f41a75233065b3815))
* deployed vtoken` ([1484602](https://github.com/VenusProtocol/isolated-pools/commit/1484602c70ceeba7b6cab50c64bba076f1585ab6))
* fixed initialSupply ([4f1b80c](https://github.com/VenusProtocol/isolated-pools/commit/4f1b80cfacc35f24fd7680ad8d29072076d96564))
* fixed vTokenReceiver ([f255cfe](https://github.com/VenusProtocol/isolated-pools/commit/f255cfee601107c6bb8842694e173a5002531f01))
* remove commented code ([cf718f3](https://github.com/VenusProtocol/isolated-pools/commit/cf718f30ed005d1aef35738a9383850794a012a1))
* resolved conflict ([6d95945](https://github.com/VenusProtocol/isolated-pools/commit/6d959459c8839fca35107516b470469de85fa593))
* resolved conflict ([f04433e](https://github.com/VenusProtocol/isolated-pools/commit/f04433e6460b87d687a1f74a8396ce071acfe06b))
* resolved conflict ([0b82507](https://github.com/VenusProtocol/isolated-pools/commit/0b82507d2803bda2c66347ca62803cf6bc95d913))
* uncommented code ([fcae00f](https://github.com/VenusProtocol/isolated-pools/commit/fcae00f928bdc0079675b0df93679ce38f97ef2b))
* uncommented code ([706ea77](https://github.com/VenusProtocol/isolated-pools/commit/706ea77d97215b195d0855e359b4f6ea2f9f6b4a))
* updated caps ([8ecf76f](https://github.com/VenusProtocol/isolated-pools/commit/8ecf76f8dcd681380db6386ff38658678b5bf931))

## [3.4.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.4.0-dev.1...v3.4.0-dev.2) (2024-06-18)


### Features

* updating deployment files ([24e06de](https://github.com/VenusProtocol/isolated-pools/commit/24e06de57d1b281a9f7278ee8917903f9f17cc66))

## [3.4.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.3.0...v3.4.0-dev.1) (2024-06-18)


### Features

* add bootstrap liquidity and vtoken receiver for rsETH on Ethereum ([562a165](https://github.com/VenusProtocol/isolated-pools/commit/562a165994dd223b7cc677546d0422382efe0f77))
* add rsETH market deployment on Ethereum ([1fc4580](https://github.com/VenusProtocol/isolated-pools/commit/1fc45803e14c9169678e51bd6ca503bb325e7142))
* add rsETH market on sepolia ([7d91a18](https://github.com/VenusProtocol/isolated-pools/commit/7d91a1871605680b38647dfa5bfd39ee340c45b4))
* updating deployment files ([dfbba43](https://github.com/VenusProtocol/isolated-pools/commit/dfbba43b86c992aacd570acfc37f31a9400ae7c9))
* updating deployment files ([cbb3af0](https://github.com/VenusProtocol/isolated-pools/commit/cbb3af087b74d855d320c884b7348b15746bf82b))


### Bug Fixes

* add initial supply & vTokenReceiver on sepolia ([5d4cbf2](https://github.com/VenusProtocol/isolated-pools/commit/5d4cbf21469d7a0d5b92e3ddf11c2adf0e257e5b))

## [3.3.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0...v3.3.0) (2024-06-04)


### Features

* updating deployment files ([7186a8f](https://github.com/VenusProtocol/isolated-pools/commit/7186a8f8000a13e0d6ef7ec5ce7c21e434f5dbca))
* updating deployment files ([85677c7](https://github.com/VenusProtocol/isolated-pools/commit/85677c7320cb7196f4687a70183dd3afae33d712))
* updating deployment files ([1992fdf](https://github.com/VenusProtocol/isolated-pools/commit/1992fdf202ed54fff5c2ebff6984eccc1611145b))
* updating deployment files ([83c3358](https://github.com/VenusProtocol/isolated-pools/commit/83c3358fa37a11ed77150b3684e815de82774e39))


### Bug Fixes

* deployed IR model ([6f907fd](https://github.com/VenusProtocol/isolated-pools/commit/6f907fd8e134e17a1e80f1d2f747597132deee01))
* fixed lint ([ee593a8](https://github.com/VenusProtocol/isolated-pools/commit/ee593a8b8e7df71ab2868476a4b526eacfa3ae2d))
* fixed multiplier and removed deployment ([b75c500](https://github.com/VenusProtocol/isolated-pools/commit/b75c500d6c43c7674d9d1a5b9a8927d3fb788560))
* redeployed ir ([35956ef](https://github.com/VenusProtocol/isolated-pools/commit/35956ef7bc99063fd69f2448e6056b49b8bbaf2f))
* Revert update deployment config ([1ec1528](https://github.com/VenusProtocol/isolated-pools/commit/1ec1528e6334d1773129015461602d31eccbce04))
* update deployment config ([a17d115](https://github.com/VenusProtocol/isolated-pools/commit/a17d115d7059d4da9896834b3f666ae2550a9bbb))

## [3.3.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.3.0-dev.2...v3.3.0-dev.3) (2024-06-04)


### Features

* updating deployment files ([1992fdf](https://github.com/VenusProtocol/isolated-pools/commit/1992fdf202ed54fff5c2ebff6984eccc1611145b))

## [3.3.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.3.0-dev.1...v3.3.0-dev.2) (2024-06-04)


### Features

* updating deployment files ([83c3358](https://github.com/VenusProtocol/isolated-pools/commit/83c3358fa37a11ed77150b3684e815de82774e39))

## [3.3.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0...v3.3.0-dev.1) (2024-06-03)


### Features

* updating deployment files ([7186a8f](https://github.com/VenusProtocol/isolated-pools/commit/7186a8f8000a13e0d6ef7ec5ce7c21e434f5dbca))
* updating deployment files ([85677c7](https://github.com/VenusProtocol/isolated-pools/commit/85677c7320cb7196f4687a70183dd3afae33d712))


### Bug Fixes

* deployed IR model ([6f907fd](https://github.com/VenusProtocol/isolated-pools/commit/6f907fd8e134e17a1e80f1d2f747597132deee01))
* fixed lint ([ee593a8](https://github.com/VenusProtocol/isolated-pools/commit/ee593a8b8e7df71ab2868476a4b526eacfa3ae2d))
* fixed multiplier and removed deployment ([b75c500](https://github.com/VenusProtocol/isolated-pools/commit/b75c500d6c43c7674d9d1a5b9a8927d3fb788560))
* redeployed ir ([35956ef](https://github.com/VenusProtocol/isolated-pools/commit/35956ef7bc99063fd69f2448e6056b49b8bbaf2f))
* Revert update deployment config ([1ec1528](https://github.com/VenusProtocol/isolated-pools/commit/1ec1528e6334d1773129015461602d31eccbce04))
* update deployment config ([a17d115](https://github.com/VenusProtocol/isolated-pools/commit/a17d115d7059d4da9896834b3f666ae2550a9bbb))

## [3.2.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0...v3.2.0) (2024-05-31)


### Features

* add archive of old Pool lens deployments ([ab510e8](https://github.com/VenusProtocol/isolated-pools/commit/ab510e88666cec2296f8a29843d4d12c27464c15))
* add deployment of NativeTokenGateway for WETH core pool on arbitrum sepolia ([32aa382](https://github.com/VenusProtocol/isolated-pools/commit/32aa382d7fe7b5a2d4b2a7bd80f908e97ac38e6f))
* updating deployment files ([64d9d20](https://github.com/VenusProtocol/isolated-pools/commit/64d9d2026c54e14b9c3ce46331f8993ae360a502))
* updating deployment files ([055e2d9](https://github.com/VenusProtocol/isolated-pools/commit/055e2d90042382ae0f6f5e5fc9bb9c7547987e41))
* updating deployment files ([aa0fba8](https://github.com/VenusProtocol/isolated-pools/commit/aa0fba8b4c3b21ebaa6365e057eb19303adc4945))
* updating deployment files ([7b4aada](https://github.com/VenusProtocol/isolated-pools/commit/7b4aadaebc50f5bc24e7fb951a79e557cfad3de8))
* updating deployment files ([72f8d43](https://github.com/VenusProtocol/isolated-pools/commit/72f8d4364ff0c8e5636ecb444385bcff97c30678))
* updating deployment files ([1d22924](https://github.com/VenusProtocol/isolated-pools/commit/1d22924eedd39432a89bfb900e4b817cc5f96f50))
* updating deployment files ([f7bbd05](https://github.com/VenusProtocol/isolated-pools/commit/f7bbd05f891748062b31044725489e676ba12cfa))
* updating deployment files ([67a5c7c](https://github.com/VenusProtocol/isolated-pools/commit/67a5c7c7344a7f7a317093658638acb800838094))
* updating deployment files ([60e70e7](https://github.com/VenusProtocol/isolated-pools/commit/60e70e76212029c7417f151ec36f68989689634c))
* updating deployment files ([c435d8e](https://github.com/VenusProtocol/isolated-pools/commit/c435d8e005d7c1d53139e9939da1541a83242e76))
* updating deployment files ([af20d24](https://github.com/VenusProtocol/isolated-pools/commit/af20d2414246f0f404ce5a5f47a3c7b6774163b7))
* updating deployment files ([4357bb2](https://github.com/VenusProtocol/isolated-pools/commit/4357bb2bbcbcb455d476db7c0f60a87f8c08dd8d))
* updating deployment files ([16a9b3a](https://github.com/VenusProtocol/isolated-pools/commit/16a9b3a80b032b1a4fd97c83edd89b96ae888506))
* updating deployment files ([46d3170](https://github.com/VenusProtocol/isolated-pools/commit/46d3170b0bdf39b63e76f4f95f7afb31fe71fe1f))
* updating deployment files ([aa2ad32](https://github.com/VenusProtocol/isolated-pools/commit/aa2ad32043eb38bff75a22dc68f9712c81075359))
* updating deployment files ([c0e00ab](https://github.com/VenusProtocol/isolated-pools/commit/c0e00abb8282e85ca48c7d508c48fd3d4d74f219))
* updating deployment files ([a57e51d](https://github.com/VenusProtocol/isolated-pools/commit/a57e51d96090026982ecddb8922a15a5aae04cb3))
* updating deployment files ([e17c9e5](https://github.com/VenusProtocol/isolated-pools/commit/e17c9e50e2927ca7c654b664dcaac7dff7522fe1))
* updating deployment files ([84caa4f](https://github.com/VenusProtocol/isolated-pools/commit/84caa4f12bd6269510749af6321559de4233bed5))
* updating deployment files ([5d5f606](https://github.com/VenusProtocol/isolated-pools/commit/5d5f60638aba61df8f3dbba8d62fd13fa0eebb9e))
* updating deployment files ([dce31af](https://github.com/VenusProtocol/isolated-pools/commit/dce31af5201f5ea35606e0685dc4a785e1c1cf95))
* updating deployment files ([788a888](https://github.com/VenusProtocol/isolated-pools/commit/788a88892dc5273255989111922289b50d8970f1))
* updating deployment files ([e319d30](https://github.com/VenusProtocol/isolated-pools/commit/e319d30e1e09ae3725845ff9ed2f636e79f05f91))
* updating deployment files ([2a334b8](https://github.com/VenusProtocol/isolated-pools/commit/2a334b8e7d379bb56baa4d43765bee9761651e6e))
* updating deployment files ([42302fe](https://github.com/VenusProtocol/isolated-pools/commit/42302fed327756d818d2f1445ea0361541e944a5))
* updating deployment files ([9450d80](https://github.com/VenusProtocol/isolated-pools/commit/9450d80f62f8e24e69883dd6d5664a5065672691))
* updating deployment files ([147a0a5](https://github.com/VenusProtocol/isolated-pools/commit/147a0a50bf4bed4bfa8366472b57316b292bc172))


### Bug Fixes

* added mock sFrax token ([d4c1e55](https://github.com/VenusProtocol/isolated-pools/commit/d4c1e55234e5eb25d4ce99756d51c40d1eece3d0))
* added pool  config ([8db6958](https://github.com/VenusProtocol/isolated-pools/commit/8db6958e2f59670ea189cba9f6934a22ce362d62))
* added rewards distributor ([4d0c10c](https://github.com/VenusProtocol/isolated-pools/commit/4d0c10cb771e6ded404b7cd34c272de1d0d591a7))
* change address of vTokenReceiver ([be6a504](https://github.com/VenusProtocol/isolated-pools/commit/be6a50486711324929aec07f3ef397039df0fdd9))
* change address of vTokenReceiver ([256844b](https://github.com/VenusProtocol/isolated-pools/commit/256844bc8e6922913cdb67896c2a99b1548bf649))
* changed decimals ([2695901](https://github.com/VenusProtocol/isolated-pools/commit/2695901013418fd497df0e787228ed4ef6121881))
* create bsc account from private key instead of mnemonic ([ea1ce8d](https://github.com/VenusProtocol/isolated-pools/commit/ea1ce8dd51bd2de7e675e509e4ff498f240dd5c5))
* deployed comptroller and swap router ([e99cbdf](https://github.com/VenusProtocol/isolated-pools/commit/e99cbdf86a8ed2764562cc334d764ebe6682f86b))
* deployed contracts ([fdd9999](https://github.com/VenusProtocol/isolated-pools/commit/fdd999968d1ee44c589a32194c93c31ebc21bf01))
* deployed mock Frax token ([8dc80b4](https://github.com/VenusProtocol/isolated-pools/commit/8dc80b44d20253f6f91183cef8a18b53cba51f0e))
* deployed on ethereum ([1fb3387](https://github.com/VenusProtocol/isolated-pools/commit/1fb33871bed24f01eb48d49658526c8b3dbee626))
* deployed rewards distributor ([1593765](https://github.com/VenusProtocol/isolated-pools/commit/1593765e090f8b1a3a543af296d760df6a2ff27d))
* deployed rewards distributor ([89e3ccc](https://github.com/VenusProtocol/isolated-pools/commit/89e3ccc4aba3b5779931c6a4ab2d90568d01876e))
* deployed swap router ([6924ad6](https://github.com/VenusProtocol/isolated-pools/commit/6924ad66aab55630e620b608dbdc5085e119deea))
* deployed vtoken proxies on ethereum ([c51c50f](https://github.com/VenusProtocol/isolated-pools/commit/c51c50fd79defa4830a70596e5e1a9de97739ad6))
* deployed vtokens ([d11775f](https://github.com/VenusProtocol/isolated-pools/commit/d11775f8ddb4e7bb40870ce870f625b21d634eff))
* deployed vTokens ([dfe5c51](https://github.com/VenusProtocol/isolated-pools/commit/dfe5c5141a43871fd84b809369ab5bce92378284))
* deployment script for IRM ([b36a7d3](https://github.com/VenusProtocol/isolated-pools/commit/b36a7d381ff09ce903109f2a1ad1ba7376fded83))
* distribution values ([b6c0883](https://github.com/VenusProtocol/isolated-pools/commit/b6c0883d9db0866a72645ed5d31fdefe7cb20bd4))
* failing integration test ([9a12b29](https://github.com/VenusProtocol/isolated-pools/commit/9a12b29e23f579db6c8b7429977ea3d74b86907f))
* fix xvs amount ([c1e1408](https://github.com/VenusProtocol/isolated-pools/commit/c1e1408132d25b3653cb0577891478304395c513))
* integration tests for time-based contracts ([3d41ff5](https://github.com/VenusProtocol/isolated-pools/commit/3d41ff5c4a53275ad31cf29f1d71ce0f102c1401))
* IRiskFund import ([8df8a7a](https://github.com/VenusProtocol/isolated-pools/commit/8df8a7a6bd418d95de5f3b68fd3b916fa61d639e))
* pool lens contract ([b770f4d](https://github.com/VenusProtocol/isolated-pools/commit/b770f4d7e6e8b1bdf5cf75b8cf8ee7f9a0e24355))
* rebased ([789f3a7](https://github.com/VenusProtocol/isolated-pools/commit/789f3a700d959741421ce4ff2d64923f63194943))
* remove console.log ([1b8118f](https://github.com/VenusProtocol/isolated-pools/commit/1b8118f049f8ba787d5e27940c62e3346cef3625))
* removed addresses of rewards distributor ([178fe43](https://github.com/VenusProtocol/isolated-pools/commit/178fe4368b0ee7448f02c17f52cf3e34e03f482e))
* removed rewards distributor ([0fb7c7c](https://github.com/VenusProtocol/isolated-pools/commit/0fb7c7c7264362d85ecefd04d57b99cc6dc504ed))
* removed unwanted file ([f946e14](https://github.com/VenusProtocol/isolated-pools/commit/f946e144de08de329e5c1c8c6761c0395cdf51f7))
* resolved conflict ([8b531b0](https://github.com/VenusProtocol/isolated-pools/commit/8b531b0d44bc5e68b18dc3b3cc21f91fd3620442))
* resolved conflicts ([4d3a5ef](https://github.com/VenusProtocol/isolated-pools/commit/4d3a5effe82160140b51aaf3e731d278a2e9378e))
* reuse rewards distributor ([95f2e81](https://github.com/VenusProtocol/isolated-pools/commit/95f2e8114e18fe16be16fe079b5670de32497db5))
* reuse rewards distributor ([91c1456](https://github.com/VenusProtocol/isolated-pools/commit/91c14567b0c5da01a7af6ab73ea54ca1c81be2cc))
* revert - removed addresses of rewards distributor ([8429cbb](https://github.com/VenusProtocol/isolated-pools/commit/8429cbbeaad6d075f599c7d7ba19b5aa3096e118))
* revert - reuse rewards distributor ([27141bd](https://github.com/VenusProtocol/isolated-pools/commit/27141bd1583bf712ea25f461e9397abdfcf653c6))
* reverted addresses ([64a77bc](https://github.com/VenusProtocol/isolated-pools/commit/64a77bc0f5f91af70383ec646e58ee9ca809ab61))
* reverted configx ([0cf1d98](https://github.com/VenusProtocol/isolated-pools/commit/0cf1d98fb595107cda8731c6b2533e0d89678f0e))
* reverted deployments ([866696e](https://github.com/VenusProtocol/isolated-pools/commit/866696e027989d5d8ac221f91d8b71d9b28adea8))
* reverted hardhat config ([c47bc6f](https://github.com/VenusProtocol/isolated-pools/commit/c47bc6f258d4e387f371b5a783a1f214cc0a9158))
* shortfall deployment ([58bd85c](https://github.com/VenusProtocol/isolated-pools/commit/58bd85c43e70c5494a0789fde9cd257cc5a3460e))
* uncommented code ([da9b7a7](https://github.com/VenusProtocol/isolated-pools/commit/da9b7a7b3835710e88c85e7eb770e9f76c601a1c))
* uncommented vip commands ([a623d07](https://github.com/VenusProtocol/isolated-pools/commit/a623d0759b555e91b2164b32d8d60f7ce8928305))
* update borrow cap ([c493cf0](https://github.com/VenusProtocol/isolated-pools/commit/c493cf0b386fab3128e5e7e10a91b616f4c21bea))
* update supply cap ([86a0c83](https://github.com/VenusProtocol/isolated-pools/commit/86a0c83f4bdeda19b9240b13bbfe9294e0976ef8))
* updated rewards ([ef60546](https://github.com/VenusProtocol/isolated-pools/commit/ef6054679e8e9acef723383bb7447c58d1245fea))
* use ethereum treasury ([7463f10](https://github.com/VenusProtocol/isolated-pools/commit/7463f10a24ecc51dfd828281c4a4b5f6be68c6e9))
* yarn lock ([62593da](https://github.com/VenusProtocol/isolated-pools/commit/62593da3db26291d359dc4b028a34113a866cdeb))
* yarn.lock ([f2f5c95](https://github.com/VenusProtocol/isolated-pools/commit/f2f5c950e74e71f7782afb3c2d16e758cf06ac47))

## [3.2.0-dev.11](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.10...v3.2.0-dev.11) (2024-05-28)

## [3.2.0-dev.10](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.9...v3.2.0-dev.10) (2024-05-23)


### Features

* updating deployment files ([64d9d20](https://github.com/VenusProtocol/isolated-pools/commit/64d9d2026c54e14b9c3ce46331f8993ae360a502))


### Bug Fixes

* deployment script for IRM ([b36a7d3](https://github.com/VenusProtocol/isolated-pools/commit/b36a7d381ff09ce903109f2a1ad1ba7376fded83))

## [3.2.0-dev.9](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.8...v3.2.0-dev.9) (2024-05-20)


### Features

* updating deployment files ([aa0fba8](https://github.com/VenusProtocol/isolated-pools/commit/aa0fba8b4c3b21ebaa6365e057eb19303adc4945))
* updating deployment files ([7b4aada](https://github.com/VenusProtocol/isolated-pools/commit/7b4aadaebc50f5bc24e7fb951a79e557cfad3de8))
* updating deployment files ([72f8d43](https://github.com/VenusProtocol/isolated-pools/commit/72f8d4364ff0c8e5636ecb444385bcff97c30678))
* updating deployment files ([67a5c7c](https://github.com/VenusProtocol/isolated-pools/commit/67a5c7c7344a7f7a317093658638acb800838094))
* updating deployment files ([60e70e7](https://github.com/VenusProtocol/isolated-pools/commit/60e70e76212029c7417f151ec36f68989689634c))
* updating deployment files ([c435d8e](https://github.com/VenusProtocol/isolated-pools/commit/c435d8e005d7c1d53139e9939da1541a83242e76))
* updating deployment files ([af20d24](https://github.com/VenusProtocol/isolated-pools/commit/af20d2414246f0f404ce5a5f47a3c7b6774163b7))
* updating deployment files ([42302fe](https://github.com/VenusProtocol/isolated-pools/commit/42302fed327756d818d2f1445ea0361541e944a5))


### Bug Fixes

* added pool  config ([8db6958](https://github.com/VenusProtocol/isolated-pools/commit/8db6958e2f59670ea189cba9f6934a22ce362d62))
* changed decimals ([2695901](https://github.com/VenusProtocol/isolated-pools/commit/2695901013418fd497df0e787228ed4ef6121881))
* deployed comptroller and swap router ([e99cbdf](https://github.com/VenusProtocol/isolated-pools/commit/e99cbdf86a8ed2764562cc334d764ebe6682f86b))
* deployed contracts ([fdd9999](https://github.com/VenusProtocol/isolated-pools/commit/fdd999968d1ee44c589a32194c93c31ebc21bf01))
* deployed on ethereum ([1fb3387](https://github.com/VenusProtocol/isolated-pools/commit/1fb33871bed24f01eb48d49658526c8b3dbee626))
* deployed rewards distributor ([1593765](https://github.com/VenusProtocol/isolated-pools/commit/1593765e090f8b1a3a543af296d760df6a2ff27d))
* deployed rewards distributor ([89e3ccc](https://github.com/VenusProtocol/isolated-pools/commit/89e3ccc4aba3b5779931c6a4ab2d90568d01876e))
* deployed swap router ([6924ad6](https://github.com/VenusProtocol/isolated-pools/commit/6924ad66aab55630e620b608dbdc5085e119deea))
* deployed vtokens ([d11775f](https://github.com/VenusProtocol/isolated-pools/commit/d11775f8ddb4e7bb40870ce870f625b21d634eff))
* remove console.log ([1b8118f](https://github.com/VenusProtocol/isolated-pools/commit/1b8118f049f8ba787d5e27940c62e3346cef3625))
* removed unwanted file ([f946e14](https://github.com/VenusProtocol/isolated-pools/commit/f946e144de08de329e5c1c8c6761c0395cdf51f7))
* resolved conflict ([8b531b0](https://github.com/VenusProtocol/isolated-pools/commit/8b531b0d44bc5e68b18dc3b3cc21f91fd3620442))
* reverted addresses ([64a77bc](https://github.com/VenusProtocol/isolated-pools/commit/64a77bc0f5f91af70383ec646e58ee9ca809ab61))
* reverted deployments ([866696e](https://github.com/VenusProtocol/isolated-pools/commit/866696e027989d5d8ac221f91d8b71d9b28adea8))
* uncommented code ([da9b7a7](https://github.com/VenusProtocol/isolated-pools/commit/da9b7a7b3835710e88c85e7eb770e9f76c601a1c))
* uncommented vip commands ([a623d07](https://github.com/VenusProtocol/isolated-pools/commit/a623d0759b555e91b2164b32d8d60f7ce8928305))
* update borrow cap ([c493cf0](https://github.com/VenusProtocol/isolated-pools/commit/c493cf0b386fab3128e5e7e10a91b616f4c21bea))
* update supply cap ([86a0c83](https://github.com/VenusProtocol/isolated-pools/commit/86a0c83f4bdeda19b9240b13bbfe9294e0976ef8))
* updated rewards ([ef60546](https://github.com/VenusProtocol/isolated-pools/commit/ef6054679e8e9acef723383bb7447c58d1245fea))
* use ethereum treasury ([7463f10](https://github.com/VenusProtocol/isolated-pools/commit/7463f10a24ecc51dfd828281c4a4b5f6be68c6e9))

## [3.2.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.7...v3.2.0-dev.8) (2024-05-17)


### Features

* updating deployment files ([055e2d9](https://github.com/VenusProtocol/isolated-pools/commit/055e2d90042382ae0f6f5e5fc9bb9c7547987e41))
* updating deployment files ([4357bb2](https://github.com/VenusProtocol/isolated-pools/commit/4357bb2bbcbcb455d476db7c0f60a87f8c08dd8d))
* updating deployment files ([5d5f606](https://github.com/VenusProtocol/isolated-pools/commit/5d5f60638aba61df8f3dbba8d62fd13fa0eebb9e))
* updating deployment files ([dce31af](https://github.com/VenusProtocol/isolated-pools/commit/dce31af5201f5ea35606e0685dc4a785e1c1cf95))
* updating deployment files ([2a334b8](https://github.com/VenusProtocol/isolated-pools/commit/2a334b8e7d379bb56baa4d43765bee9761651e6e))


### Bug Fixes

* pool lens contract ([b770f4d](https://github.com/VenusProtocol/isolated-pools/commit/b770f4d7e6e8b1bdf5cf75b8cf8ee7f9a0e24355))
* resolved conflicts ([4d3a5ef](https://github.com/VenusProtocol/isolated-pools/commit/4d3a5effe82160140b51aaf3e731d278a2e9378e))

## [3.2.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.6...v3.2.0-dev.7) (2024-05-16)


### Features

* updating deployment files ([1d22924](https://github.com/VenusProtocol/isolated-pools/commit/1d22924eedd39432a89bfb900e4b817cc5f96f50))
* updating deployment files ([f7bbd05](https://github.com/VenusProtocol/isolated-pools/commit/f7bbd05f891748062b31044725489e676ba12cfa))

## [3.2.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.5...v3.2.0-dev.6) (2024-05-09)


### Features

* updating deployment files ([16a9b3a](https://github.com/VenusProtocol/isolated-pools/commit/16a9b3a80b032b1a4fd97c83edd89b96ae888506))


### Bug Fixes

* failing integration test ([9a12b29](https://github.com/VenusProtocol/isolated-pools/commit/9a12b29e23f579db6c8b7429977ea3d74b86907f))
* IRiskFund import ([8df8a7a](https://github.com/VenusProtocol/isolated-pools/commit/8df8a7a6bd418d95de5f3b68fd3b916fa61d639e))
* shortfall deployment ([58bd85c](https://github.com/VenusProtocol/isolated-pools/commit/58bd85c43e70c5494a0789fde9cd257cc5a3460e))
* yarn lock ([62593da](https://github.com/VenusProtocol/isolated-pools/commit/62593da3db26291d359dc4b028a34113a866cdeb))
* yarn.lock ([f2f5c95](https://github.com/VenusProtocol/isolated-pools/commit/f2f5c950e74e71f7782afb3c2d16e758cf06ac47))

## [3.2.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.4...v3.2.0-dev.5) (2024-05-08)


### Features

* updating deployment files ([46d3170](https://github.com/VenusProtocol/isolated-pools/commit/46d3170b0bdf39b63e76f4f95f7afb31fe71fe1f))


### Bug Fixes

* change address of vTokenReceiver ([be6a504](https://github.com/VenusProtocol/isolated-pools/commit/be6a50486711324929aec07f3ef397039df0fdd9))
* change address of vTokenReceiver ([256844b](https://github.com/VenusProtocol/isolated-pools/commit/256844bc8e6922913cdb67896c2a99b1548bf649))
* deployed vtoken proxies on ethereum ([c51c50f](https://github.com/VenusProtocol/isolated-pools/commit/c51c50fd79defa4830a70596e5e1a9de97739ad6))
* reverted hardhat config ([c47bc6f](https://github.com/VenusProtocol/isolated-pools/commit/c47bc6f258d4e387f371b5a783a1f214cc0a9158))

## [3.2.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.3...v3.2.0-dev.4) (2024-05-06)


### Features

* updating deployment files ([c0e00ab](https://github.com/VenusProtocol/isolated-pools/commit/c0e00abb8282e85ca48c7d508c48fd3d4d74f219))
* updating deployment files ([a57e51d](https://github.com/VenusProtocol/isolated-pools/commit/a57e51d96090026982ecddb8922a15a5aae04cb3))
* updating deployment files ([e17c9e5](https://github.com/VenusProtocol/isolated-pools/commit/e17c9e50e2927ca7c654b664dcaac7dff7522fe1))
* updating deployment files ([84caa4f](https://github.com/VenusProtocol/isolated-pools/commit/84caa4f12bd6269510749af6321559de4233bed5))


### Bug Fixes

* added mock sFrax token ([d4c1e55](https://github.com/VenusProtocol/isolated-pools/commit/d4c1e55234e5eb25d4ce99756d51c40d1eece3d0))
* added rewards distributor ([4d0c10c](https://github.com/VenusProtocol/isolated-pools/commit/4d0c10cb771e6ded404b7cd34c272de1d0d591a7))
* deployed mock Frax token ([8dc80b4](https://github.com/VenusProtocol/isolated-pools/commit/8dc80b44d20253f6f91183cef8a18b53cba51f0e))
* deployed vTokens ([dfe5c51](https://github.com/VenusProtocol/isolated-pools/commit/dfe5c5141a43871fd84b809369ab5bce92378284))
* fix xvs amount ([c1e1408](https://github.com/VenusProtocol/isolated-pools/commit/c1e1408132d25b3653cb0577891478304395c513))
* rebased ([789f3a7](https://github.com/VenusProtocol/isolated-pools/commit/789f3a700d959741421ce4ff2d64923f63194943))
* removed addresses of rewards distributor ([178fe43](https://github.com/VenusProtocol/isolated-pools/commit/178fe4368b0ee7448f02c17f52cf3e34e03f482e))
* removed rewards distributor ([0fb7c7c](https://github.com/VenusProtocol/isolated-pools/commit/0fb7c7c7264362d85ecefd04d57b99cc6dc504ed))
* reuse rewards distributor ([95f2e81](https://github.com/VenusProtocol/isolated-pools/commit/95f2e8114e18fe16be16fe079b5670de32497db5))
* reuse rewards distributor ([91c1456](https://github.com/VenusProtocol/isolated-pools/commit/91c14567b0c5da01a7af6ab73ea54ca1c81be2cc))
* revert - removed addresses of rewards distributor ([8429cbb](https://github.com/VenusProtocol/isolated-pools/commit/8429cbbeaad6d075f599c7d7ba19b5aa3096e118))
* revert - reuse rewards distributor ([27141bd](https://github.com/VenusProtocol/isolated-pools/commit/27141bd1583bf712ea25f461e9397abdfcf653c6))
* reverted configx ([0cf1d98](https://github.com/VenusProtocol/isolated-pools/commit/0cf1d98fb595107cda8731c6b2533e0d89678f0e))

## [3.2.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.2...v3.2.0-dev.3) (2024-05-06)


### Features

* add archive of old Pool lens deployments ([ab510e8](https://github.com/VenusProtocol/isolated-pools/commit/ab510e88666cec2296f8a29843d4d12c27464c15))
* updating deployment files ([aa2ad32](https://github.com/VenusProtocol/isolated-pools/commit/aa2ad32043eb38bff75a22dc68f9712c81075359))


### Bug Fixes

* create bsc account from private key instead of mnemonic ([ea1ce8d](https://github.com/VenusProtocol/isolated-pools/commit/ea1ce8dd51bd2de7e675e509e4ff498f240dd5c5))

## [3.2.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.2.0-dev.1...v3.2.0-dev.2) (2024-05-06)


### Features

* updating deployment files ([788a888](https://github.com/VenusProtocol/isolated-pools/commit/788a88892dc5273255989111922289b50d8970f1))


### Bug Fixes

* distribution values ([b6c0883](https://github.com/VenusProtocol/isolated-pools/commit/b6c0883d9db0866a72645ed5d31fdefe7cb20bd4))

## [3.2.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0...v3.2.0-dev.1) (2024-05-03)


### Features

* add deployment of NativeTokenGateway for WETH core pool on arbitrum sepolia ([32aa382](https://github.com/VenusProtocol/isolated-pools/commit/32aa382d7fe7b5a2d4b2a7bd80f908e97ac38e6f))
* updating deployment files ([e319d30](https://github.com/VenusProtocol/isolated-pools/commit/e319d30e1e09ae3725845ff9ed2f636e79f05f91))
* updating deployment files ([9450d80](https://github.com/VenusProtocol/isolated-pools/commit/9450d80f62f8e24e69883dd6d5664a5065672691))
* updating deployment files ([147a0a5](https://github.com/VenusProtocol/isolated-pools/commit/147a0a50bf4bed4bfa8366472b57316b292bc172))


### Bug Fixes

* integration tests for time-based contracts ([3d41ff5](https://github.com/VenusProtocol/isolated-pools/commit/3d41ff5c4a53275ad31cf29f1d71ce0f102c1401))

## [3.1.0](https://github.com/VenusProtocol/isolated-pools/compare/v3.0.0...v3.1.0) (2024-04-26)


### Features

* add DAI market to core pool on sepolia and ethereum ([d0c9f58](https://github.com/VenusProtocol/isolated-pools/commit/d0c9f58686dd5ee4ee32e6c280abf56e48541934))
* add deployments of core pool with markets and underlying on arbitrum sepolia ([4340354](https://github.com/VenusProtocol/isolated-pools/commit/4340354cd7b4f901456e496ef069c329d26263bf))
* add function to pick borrow rate and bidder values according to networks ([c749e0d](https://github.com/VenusProtocol/isolated-pools/commit/c749e0d6d301357876806274d244e06da0cb8108))
* add timestamp based contract functionality ([92e8e75](https://github.com/VenusProtocol/isolated-pools/commit/92e8e7555e6e0b468c51bd30ebf1ee2045a6877f))
* add TUSD market to core pool on ethereum and sepolia ([17e9158](https://github.com/VenusProtocol/isolated-pools/commit/17e91587fe421365fc6515eb1ebc89f68db3b3c5))
* update solidity version and solidity-utilities package ([1cd1a70](https://github.com/VenusProtocol/isolated-pools/commit/1cd1a70cf58ab2c07e18641e952401bceaf54307))
* updating deployment files ([99bb113](https://github.com/VenusProtocol/isolated-pools/commit/99bb11342a29bc0a0f49e5695020aa03ced15f81))
* updating deployment files ([d4ac26a](https://github.com/VenusProtocol/isolated-pools/commit/d4ac26ab1eaf9c95f766c15f1b1fdaac33ac343c))
* updating deployment files ([afec7b7](https://github.com/VenusProtocol/isolated-pools/commit/afec7b7af8db94c428af71be9c387aada2e1afb0))
* updating deployment files ([66bdcd0](https://github.com/VenusProtocol/isolated-pools/commit/66bdcd0629eb924d31dcb6f5ab7674d89a4123de))
* updating deployment files ([996353c](https://github.com/VenusProtocol/isolated-pools/commit/996353c139cbfb2fd92cc66d591b64122b3cf260))
* updating deployment files ([63aea9d](https://github.com/VenusProtocol/isolated-pools/commit/63aea9d3930ceb83a18604cf119a5b1992f01562))
* updating deployment files ([960a298](https://github.com/VenusProtocol/isolated-pools/commit/960a2989828740654b7ffa814d99835894c9b0df))
* updating deployment files ([158550f](https://github.com/VenusProtocol/isolated-pools/commit/158550f38aa01653178acea24be66ca0c0880103))


### Bug Fixes

* added pendle token configuration ([d968001](https://github.com/VenusProtocol/isolated-pools/commit/d96800140f81eba909b5d7af94c90b60584dc8e8))
* condition for selection of blocks ([c0d60df](https://github.com/VenusProtocol/isolated-pools/commit/c0d60dfbc4bc08f6ae272b8b6090222097a7e329))
* deployed vtoken ([2bdc98d](https://github.com/VenusProtocol/isolated-pools/commit/2bdc98d79dc1544d1ea1c8bf9f35de24363545c4))
* rebased ([1f69ea7](https://github.com/VenusProtocol/isolated-pools/commit/1f69ea7a3fa625b0baac3a7e42a3ab64dee160ff))
* removed rewards distributor ([5dc1745](https://github.com/VenusProtocol/isolated-pools/commit/5dc1745890e3f6e51fb6428175de7b4f479f62f0))
* removed rewards distributor config ([379aedc](https://github.com/VenusProtocol/isolated-pools/commit/379aedcb3b09b7d4cf645be1cbc8babfe7e3f837))
* resolve merge conflicts ([bec2185](https://github.com/VenusProtocol/isolated-pools/commit/bec21853b6851e6fcd1d5178499f929579cfebe0))
* resolved conflicts ([4445bde](https://github.com/VenusProtocol/isolated-pools/commit/4445bde6b090015a6993026cf6de1df7dd78af45))
* resolved merge conflicts ([04687f7](https://github.com/VenusProtocol/isolated-pools/commit/04687f753f5df9f134985962bcf9b2df1e4cb0a4))
* scope 1 fetch TimeBased mappings from reward distributor in pool lens ([1a6cf0c](https://github.com/VenusProtocol/isolated-pools/commit/1a6cf0c1aea867cef4657670fb989dbc0b47c91c))
* SSV-01 ([e1cdb75](https://github.com/VenusProtocol/isolated-pools/commit/e1cdb75c1b3f9f9eaca720885704f75052eb69e3))
* typo ([67147b9](https://github.com/VenusProtocol/isolated-pools/commit/67147b90680483b0d960201d0985fd929f6927e6))
* VPB-01 value naming should be updated to reflect possible time-based case ([88265c3](https://github.com/VenusProtocol/isolated-pools/commit/88265c396aaac27b24499a9c340dc2022aa762b5))
* VPB-02 confirmation on the handling of updated time-based contracts ([59b1413](https://github.com/VenusProtocol/isolated-pools/commit/59b141362bb92ac0a7f2aa528107fd62f327abf0))
* VPB-03 maximum should depend on chain and whether the contracts are time or block-based ([ee4c083](https://github.com/VenusProtocol/isolated-pools/commit/ee4c083f24fe91bacbf4da10f2412dbeac476a53))
* VTIME-3 ([d61191c](https://github.com/VenusProtocol/isolated-pools/commit/d61191cb1a8c198deea6cc362425144efbc312f5))
* VTIME-4 ([e57c00d](https://github.com/VenusProtocol/isolated-pools/commit/e57c00d7df5f84d4eb19e10d6cf2704d18b0fdff))
* VTIME-5 ([4626a10](https://github.com/VenusProtocol/isolated-pools/commit/4626a1032510390627728a998b0aa19e8eaa3682))

## [3.1.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0-dev.5...v3.1.0-dev.6) (2024-04-26)


### Features

* add TUSD market to core pool on ethereum and sepolia ([17e9158](https://github.com/VenusProtocol/isolated-pools/commit/17e91587fe421365fc6515eb1ebc89f68db3b3c5))
* updating deployment files ([99bb113](https://github.com/VenusProtocol/isolated-pools/commit/99bb11342a29bc0a0f49e5695020aa03ced15f81))
* updating deployment files ([63aea9d](https://github.com/VenusProtocol/isolated-pools/commit/63aea9d3930ceb83a18604cf119a5b1992f01562))

## [3.1.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0-dev.4...v3.1.0-dev.5) (2024-04-26)


### Features

* add deployments of core pool with markets and underlying on arbitrum sepolia ([4340354](https://github.com/VenusProtocol/isolated-pools/commit/4340354cd7b4f901456e496ef069c329d26263bf))
* updating deployment files ([d4ac26a](https://github.com/VenusProtocol/isolated-pools/commit/d4ac26ab1eaf9c95f766c15f1b1fdaac33ac343c))
* updating deployment files ([afec7b7](https://github.com/VenusProtocol/isolated-pools/commit/afec7b7af8db94c428af71be9c387aada2e1afb0))


### Bug Fixes

* resolve merge conflicts ([bec2185](https://github.com/VenusProtocol/isolated-pools/commit/bec21853b6851e6fcd1d5178499f929579cfebe0))

## [3.1.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0-dev.3...v3.1.0-dev.4) (2024-04-25)


### Features

* updating deployment files ([66bdcd0](https://github.com/VenusProtocol/isolated-pools/commit/66bdcd0629eb924d31dcb6f5ab7674d89a4123de))
* updating deployment files ([996353c](https://github.com/VenusProtocol/isolated-pools/commit/996353c139cbfb2fd92cc66d591b64122b3cf260))


### Bug Fixes

* added pendle token configuration ([d968001](https://github.com/VenusProtocol/isolated-pools/commit/d96800140f81eba909b5d7af94c90b60584dc8e8))
* deployed vtoken ([2bdc98d](https://github.com/VenusProtocol/isolated-pools/commit/2bdc98d79dc1544d1ea1c8bf9f35de24363545c4))
* rebased ([1f69ea7](https://github.com/VenusProtocol/isolated-pools/commit/1f69ea7a3fa625b0baac3a7e42a3ab64dee160ff))
* removed rewards distributor ([5dc1745](https://github.com/VenusProtocol/isolated-pools/commit/5dc1745890e3f6e51fb6428175de7b4f479f62f0))
* removed rewards distributor config ([379aedc](https://github.com/VenusProtocol/isolated-pools/commit/379aedcb3b09b7d4cf645be1cbc8babfe7e3f837))

## [3.1.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0-dev.2...v3.1.0-dev.3) (2024-04-25)


### Features

* add function to pick borrow rate and bidder values according to networks ([c749e0d](https://github.com/VenusProtocol/isolated-pools/commit/c749e0d6d301357876806274d244e06da0cb8108))
* add timestamp based contract functionality ([92e8e75](https://github.com/VenusProtocol/isolated-pools/commit/92e8e7555e6e0b468c51bd30ebf1ee2045a6877f))
* update solidity version and solidity-utilities package ([1cd1a70](https://github.com/VenusProtocol/isolated-pools/commit/1cd1a70cf58ab2c07e18641e952401bceaf54307))


### Bug Fixes

* condition for selection of blocks ([c0d60df](https://github.com/VenusProtocol/isolated-pools/commit/c0d60dfbc4bc08f6ae272b8b6090222097a7e329))
* resolved conflicts ([4445bde](https://github.com/VenusProtocol/isolated-pools/commit/4445bde6b090015a6993026cf6de1df7dd78af45))
* resolved merge conflicts ([04687f7](https://github.com/VenusProtocol/isolated-pools/commit/04687f753f5df9f134985962bcf9b2df1e4cb0a4))
* scope 1 fetch TimeBased mappings from reward distributor in pool lens ([1a6cf0c](https://github.com/VenusProtocol/isolated-pools/commit/1a6cf0c1aea867cef4657670fb989dbc0b47c91c))
* SSV-01 ([e1cdb75](https://github.com/VenusProtocol/isolated-pools/commit/e1cdb75c1b3f9f9eaca720885704f75052eb69e3))
* VPB-01 value naming should be updated to reflect possible time-based case ([88265c3](https://github.com/VenusProtocol/isolated-pools/commit/88265c396aaac27b24499a9c340dc2022aa762b5))
* VPB-02 confirmation on the handling of updated time-based contracts ([59b1413](https://github.com/VenusProtocol/isolated-pools/commit/59b141362bb92ac0a7f2aa528107fd62f327abf0))
* VPB-03 maximum should depend on chain and whether the contracts are time or block-based ([ee4c083](https://github.com/VenusProtocol/isolated-pools/commit/ee4c083f24fe91bacbf4da10f2412dbeac476a53))
* VTIME-3 ([d61191c](https://github.com/VenusProtocol/isolated-pools/commit/d61191cb1a8c198deea6cc362425144efbc312f5))
* VTIME-4 ([e57c00d](https://github.com/VenusProtocol/isolated-pools/commit/e57c00d7df5f84d4eb19e10d6cf2704d18b0fdff))
* VTIME-5 ([4626a10](https://github.com/VenusProtocol/isolated-pools/commit/4626a1032510390627728a998b0aa19e8eaa3682))

## [3.1.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.1.0-dev.1...v3.1.0-dev.2) (2024-04-24)


### Features

* add DAI market to core pool on sepolia and ethereum ([d0c9f58](https://github.com/VenusProtocol/isolated-pools/commit/d0c9f58686dd5ee4ee32e6c280abf56e48541934))
* updating deployment files ([960a298](https://github.com/VenusProtocol/isolated-pools/commit/960a2989828740654b7ffa814d99835894c9b0df))


### Bug Fixes

* typo ([67147b9](https://github.com/VenusProtocol/isolated-pools/commit/67147b90680483b0d960201d0985fd929f6927e6))

## [3.1.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v3.0.0...v3.1.0-dev.1) (2024-04-19)


### Features

* updating deployment files ([158550f](https://github.com/VenusProtocol/isolated-pools/commit/158550f38aa01653178acea24be66ca0c0880103))

## [3.0.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.8.0...v3.0.0) (2024-04-19)


### ⚠ BREAKING CHANGES

* migrate to Solidity 0.8.25

### Features

* migrate to Solidity 0.8.25 ([9190201](https://github.com/VenusProtocol/isolated-pools/commit/919020170941c1d194a5a7b3bab9d5cd769e3932))


### Bug Fixes

* update dependencies ([963344d](https://github.com/VenusProtocol/isolated-pools/commit/963344dd91a3e6f310ff973ef335ce42cf562886))

## [3.0.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v3.0.0-dev.1...v3.0.0-dev.2) (2024-04-19)


### Bug Fixes

* update dependencies ([963344d](https://github.com/VenusProtocol/isolated-pools/commit/963344dd91a3e6f310ff973ef335ce42cf562886))

## [3.0.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.8.0...v3.0.0-dev.1) (2024-04-19)


### ⚠ BREAKING CHANGES

* migrate to Solidity 0.8.25

### Features

* migrate to Solidity 0.8.25 ([9190201](https://github.com/VenusProtocol/isolated-pools/commit/919020170941c1d194a5a7b3bab9d5cd769e3932))

## [2.8.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.7.0...v2.8.0) (2024-04-16)


### Features

* add IR deployment for some asset on bscmainnet ([ef32034](https://github.com/VenusProtocol/isolated-pools/commit/ef3203455cd4c1e10f21d00ac54c47cc83f1d80f))
* add rewards config for Ethereum (initial config) ([5c2a03e](https://github.com/VenusProtocol/isolated-pools/commit/5c2a03e7d8d1929a5ef586f79b47d5c7107abb34))
* add rewards config for Ethereum (initial config) ([4dfa61e](https://github.com/VenusProtocol/isolated-pools/commit/4dfa61e0c54779a34a45b61a50dabb58c8aa2b80))
* IR deployments for some assets on opbnb and ethereum ([b353c2a](https://github.com/VenusProtocol/isolated-pools/commit/b353c2a3c2b4709c483c5b1a1ff5ce26cf068879))
* updating deployment files ([b5bb9fb](https://github.com/VenusProtocol/isolated-pools/commit/b5bb9fbb34d1fe602d2294c387e992f3bcead507))
* updating deployment files ([82d6ba5](https://github.com/VenusProtocol/isolated-pools/commit/82d6ba5fb1d30c24aa83deab930e9d00f87f5212))
* updating deployment files ([bfd0f79](https://github.com/VenusProtocol/isolated-pools/commit/bfd0f79d60a8eacd6354d6c3ff8833b9438e0836))
* updating deployment files ([99be3ea](https://github.com/VenusProtocol/isolated-pools/commit/99be3ea32b63a677ae02da5d53555c343ed272d5))
* updating deployment files ([cb400a2](https://github.com/VenusProtocol/isolated-pools/commit/cb400a2fb56729dda0d5096b422c63d7f01ae744))
* updating deployment files ([86fb040](https://github.com/VenusProtocol/isolated-pools/commit/86fb0407c03595acd2abdf1609eaa33e6ef78279))
* updating deployment files ([bd10368](https://github.com/VenusProtocol/isolated-pools/commit/bd10368a435dbd61ae463864aa316280eae1a27f))
* updating deployment files ([625f9f0](https://github.com/VenusProtocol/isolated-pools/commit/625f9f06d911815eab303068a403eafbedc05769))
* updating deployment files ([05e48b0](https://github.com/VenusProtocol/isolated-pools/commit/05e48b0b50695eeb7e207ae104471692837b467a))
* updating deployment files ([00a0da1](https://github.com/VenusProtocol/isolated-pools/commit/00a0da15794f428684e13993d927e35fd14c2210))
* updating deployment files ([1cb06c8](https://github.com/VenusProtocol/isolated-pools/commit/1cb06c80dbbf3b0f09c6675b9b6f2cfd0ecbaf07))
* updating deployment files ([e3649f8](https://github.com/VenusProtocol/isolated-pools/commit/e3649f8bce1ab895a5dce244109d307f72932966))
* updating deployment files ([da6fe92](https://github.com/VenusProtocol/isolated-pools/commit/da6fe92c7ec73bcb2bfe963c914f4e4d044ade37))


### Bug Fixes

* add quotes in markets array ([81185ce](https://github.com/VenusProtocol/isolated-pools/commit/81185ceead6fa096ccbea770886f700231284ae0))
* added vtoken and reward config for weeth ([be29823](https://github.com/VenusProtocol/isolated-pools/commit/be298232124758ed3db0d2378f7a7f50723588df))
* bump core protocol version ([025dfee](https://github.com/VenusProtocol/isolated-pools/commit/025dfeeaa0b6e96719bd7f274fd6866c6cbc12b2))
* change eETH to ETH ([6871291](https://github.com/VenusProtocol/isolated-pools/commit/687129127f7e7c376c959fd799a498fa9a330ec0))
* change eETH to ETH ([b3ada0f](https://github.com/VenusProtocol/isolated-pools/commit/b3ada0fa05f7dc1958700c3bff6531b4308af572))
* deploy vToken and reward distributor to ethereum ([064b187](https://github.com/VenusProtocol/isolated-pools/commit/064b187e0ec499681646609c9a70a4fbfcf60d3c))
* deployed eeth token ([ce8d4b1](https://github.com/VenusProtocol/isolated-pools/commit/ce8d4b104318017e805041bab519b413a5347529))
* deployed mock weETH ([7ca4d6e](https://github.com/VenusProtocol/isolated-pools/commit/7ca4d6e16f0f7a666a89d31c850aed028e837ba5))
* deployed USDC rewards distributor ([6455576](https://github.com/VenusProtocol/isolated-pools/commit/64555765aabc477d8646afc3c6f350ba67adcc49))
* deployed vtoken and interest rate model ([be44300](https://github.com/VenusProtocol/isolated-pools/commit/be443001ca088b3e300ee7806b470aff0c118496))
* fixed hardhat deployment ([38c02ef](https://github.com/VenusProtocol/isolated-pools/commit/38c02ef7dd60f09257d27883b2b2a8bbcd0333c3))
* fixed lint ([7b8bcb5](https://github.com/VenusProtocol/isolated-pools/commit/7b8bcb5d74ea6434ca04727021450024a9f1d3a7))
* fixed lint ([a416b29](https://github.com/VenusProtocol/isolated-pools/commit/a416b299d9ed081cab4f6aaa8f23b406f08db390))
* fixed lint ([62f9111](https://github.com/VenusProtocol/isolated-pools/commit/62f9111b03b38003cc9c6f964cd29991ad6f6012))
* fixed lint ([b9dfca4](https://github.com/VenusProtocol/isolated-pools/commit/b9dfca4d87bd7c7ea7deab1ade95d5aee122aabc))
* fixed multiplier ([cd89aed](https://github.com/VenusProtocol/isolated-pools/commit/cd89aed793c9d2c22bdf4cefdd14f66c876f4610))
* fixed PSR address in deploy vToken script ([10832ad](https://github.com/VenusProtocol/isolated-pools/commit/10832ad459f23ba0924bbd243ed9ba4bc18c5beb))
* fixed speed ([3d85a3f](https://github.com/VenusProtocol/isolated-pools/commit/3d85a3f90c35172789d132ccf3b109987a5d001b))
* fixed supply speed for usdc ([a545b61](https://github.com/VenusProtocol/isolated-pools/commit/a545b615368bf5ae0f43af0bca7626e8b297ee10))
* fixed transfer ownership ([4a9390d](https://github.com/VenusProtocol/isolated-pools/commit/4a9390d8f0954ef5b145bffa4b89457f14e88149))
* fixed vToken deployment in hardhar ([fd18a51](https://github.com/VenusProtocol/isolated-pools/commit/fd18a51d4ba649aa4067f9c27ec7c5cd3c005b92))
* fixed vToken receiver ([4dea054](https://github.com/VenusProtocol/isolated-pools/commit/4dea0548e5f6abc9c88f5bcaf774aa20c2ed660b))
* fixed yarn.lock ([6abc178](https://github.com/VenusProtocol/isolated-pools/commit/6abc1782b9e46755390cbfe42acc87a5c6a7d243))
* get contract address from imported artifcats ([4af12ed](https://github.com/VenusProtocol/isolated-pools/commit/4af12ed3e4233c3bb88aecbfbcddaf80605e4bf6))
* market naming in rewards config ([a09ce96](https://github.com/VenusProtocol/isolated-pools/commit/a09ce96a8763e30c568f061e45a2257a1078f36e))
* push only necessary files ([c74b03f](https://github.com/VenusProtocol/isolated-pools/commit/c74b03fb547858577aae6101d9da1dda8d443c9b))
* redeployed vToken ([7efab45](https://github.com/VenusProtocol/isolated-pools/commit/7efab45b345d658560b8974e4acfdc2d3b2c2d47))
* remove unwanted condition check ([5e8b0e4](https://github.com/VenusProtocol/isolated-pools/commit/5e8b0e4d5ab03c162c8687e51c511304ab80441a))
* removed VToken_vweETH_LiquidStakedEETH ([bc7523b](https://github.com/VenusProtocol/isolated-pools/commit/bc7523ba317acaecc1ac8b71b7dfad992dbca37e))
* revert accounts ([b0a13e6](https://github.com/VenusProtocol/isolated-pools/commit/b0a13e6dbf019f8ce1ad6ca72f8de9ab26659b86))
* revert vTokenReceiver for other markets ([11201b5](https://github.com/VenusProtocol/isolated-pools/commit/11201b53bcd51a1dde7a226c157384ab0b0ecadb))
* reward config ([e674ba1](https://github.com/VenusProtocol/isolated-pools/commit/e674ba13e0234397e64bef2e923d58ecd63753cf))
* reward configuration syntax ([3aa6ff7](https://github.com/VenusProtocol/isolated-pools/commit/3aa6ff726cadef466cb49e7fc0d1b81ca7e04134))
* transfer ownership of rewards distributor ([097de76](https://github.com/VenusProtocol/isolated-pools/commit/097de769690e528a4b3197e51ede283013c749dc))
* uncomment code ([ce848a8](https://github.com/VenusProtocol/isolated-pools/commit/ce848a8170159b4b91b63de8cf325ab41837d756))
* update yarn.lock ([fd635d7](https://github.com/VenusProtocol/isolated-pools/commit/fd635d7e9776dcb2d2a1b07dffea3ecd523fb1bc))
* update yarn.lock ([e841216](https://github.com/VenusProtocol/isolated-pools/commit/e84121636636d45009db14471581fa832a87a174))
* updated initial supply ([d38264e](https://github.com/VenusProtocol/isolated-pools/commit/d38264e8a925ce2912b425a4262fa612b1164c40))
* yarn lock ([54837b3](https://github.com/VenusProtocol/isolated-pools/commit/54837b39f011be2582f8ea858947b2d1eae6e4a3))
* yarn.lock ([ce42810](https://github.com/VenusProtocol/isolated-pools/commit/ce4281040413997ac751d5e742e174631aba322e))

## [2.8.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v2.8.0-dev.2...v2.8.0-dev.3) (2024-04-15)


### Features

* updating deployment files ([b5bb9fb](https://github.com/VenusProtocol/isolated-pools/commit/b5bb9fbb34d1fe602d2294c387e992f3bcead507))
* updating deployment files ([82d6ba5](https://github.com/VenusProtocol/isolated-pools/commit/82d6ba5fb1d30c24aa83deab930e9d00f87f5212))
* updating deployment files ([99be3ea](https://github.com/VenusProtocol/isolated-pools/commit/99be3ea32b63a677ae02da5d53555c343ed272d5))
* updating deployment files ([cb400a2](https://github.com/VenusProtocol/isolated-pools/commit/cb400a2fb56729dda0d5096b422c63d7f01ae744))
* updating deployment files ([625f9f0](https://github.com/VenusProtocol/isolated-pools/commit/625f9f06d911815eab303068a403eafbedc05769))
* updating deployment files ([05e48b0](https://github.com/VenusProtocol/isolated-pools/commit/05e48b0b50695eeb7e207ae104471692837b467a))
* updating deployment files ([00a0da1](https://github.com/VenusProtocol/isolated-pools/commit/00a0da15794f428684e13993d927e35fd14c2210))


### Bug Fixes

* added vtoken and reward config for weeth ([be29823](https://github.com/VenusProtocol/isolated-pools/commit/be298232124758ed3db0d2378f7a7f50723588df))
* change eETH to ETH ([6871291](https://github.com/VenusProtocol/isolated-pools/commit/687129127f7e7c376c959fd799a498fa9a330ec0))
* change eETH to ETH ([b3ada0f](https://github.com/VenusProtocol/isolated-pools/commit/b3ada0fa05f7dc1958700c3bff6531b4308af572))
* deploy vToken and reward distributor to ethereum ([064b187](https://github.com/VenusProtocol/isolated-pools/commit/064b187e0ec499681646609c9a70a4fbfcf60d3c))
* deployed eeth token ([ce8d4b1](https://github.com/VenusProtocol/isolated-pools/commit/ce8d4b104318017e805041bab519b413a5347529))
* deployed mock weETH ([7ca4d6e](https://github.com/VenusProtocol/isolated-pools/commit/7ca4d6e16f0f7a666a89d31c850aed028e837ba5))
* deployed USDC rewards distributor ([6455576](https://github.com/VenusProtocol/isolated-pools/commit/64555765aabc477d8646afc3c6f350ba67adcc49))
* deployed vtoken and interest rate model ([be44300](https://github.com/VenusProtocol/isolated-pools/commit/be443001ca088b3e300ee7806b470aff0c118496))
* fixed hardhat deployment ([38c02ef](https://github.com/VenusProtocol/isolated-pools/commit/38c02ef7dd60f09257d27883b2b2a8bbcd0333c3))
* fixed lint ([7b8bcb5](https://github.com/VenusProtocol/isolated-pools/commit/7b8bcb5d74ea6434ca04727021450024a9f1d3a7))
* fixed lint ([a416b29](https://github.com/VenusProtocol/isolated-pools/commit/a416b299d9ed081cab4f6aaa8f23b406f08db390))
* fixed lint ([62f9111](https://github.com/VenusProtocol/isolated-pools/commit/62f9111b03b38003cc9c6f964cd29991ad6f6012))
* fixed lint ([b9dfca4](https://github.com/VenusProtocol/isolated-pools/commit/b9dfca4d87bd7c7ea7deab1ade95d5aee122aabc))
* fixed multiplier ([cd89aed](https://github.com/VenusProtocol/isolated-pools/commit/cd89aed793c9d2c22bdf4cefdd14f66c876f4610))
* fixed PSR address in deploy vToken script ([10832ad](https://github.com/VenusProtocol/isolated-pools/commit/10832ad459f23ba0924bbd243ed9ba4bc18c5beb))
* fixed speed ([3d85a3f](https://github.com/VenusProtocol/isolated-pools/commit/3d85a3f90c35172789d132ccf3b109987a5d001b))
* fixed supply speed for usdc ([a545b61](https://github.com/VenusProtocol/isolated-pools/commit/a545b615368bf5ae0f43af0bca7626e8b297ee10))
* fixed transfer ownership ([4a9390d](https://github.com/VenusProtocol/isolated-pools/commit/4a9390d8f0954ef5b145bffa4b89457f14e88149))
* fixed vToken deployment in hardhar ([fd18a51](https://github.com/VenusProtocol/isolated-pools/commit/fd18a51d4ba649aa4067f9c27ec7c5cd3c005b92))
* fixed vToken receiver ([4dea054](https://github.com/VenusProtocol/isolated-pools/commit/4dea0548e5f6abc9c88f5bcaf774aa20c2ed660b))
* fixed yarn.lock ([6abc178](https://github.com/VenusProtocol/isolated-pools/commit/6abc1782b9e46755390cbfe42acc87a5c6a7d243))
* get contract address from imported artifcats ([4af12ed](https://github.com/VenusProtocol/isolated-pools/commit/4af12ed3e4233c3bb88aecbfbcddaf80605e4bf6))
* redeployed vToken ([7efab45](https://github.com/VenusProtocol/isolated-pools/commit/7efab45b345d658560b8974e4acfdc2d3b2c2d47))
* remove unwanted condition check ([5e8b0e4](https://github.com/VenusProtocol/isolated-pools/commit/5e8b0e4d5ab03c162c8687e51c511304ab80441a))
* removed VToken_vweETH_LiquidStakedEETH ([bc7523b](https://github.com/VenusProtocol/isolated-pools/commit/bc7523ba317acaecc1ac8b71b7dfad992dbca37e))
* revert accounts ([b0a13e6](https://github.com/VenusProtocol/isolated-pools/commit/b0a13e6dbf019f8ce1ad6ca72f8de9ab26659b86))
* revert vTokenReceiver for other markets ([11201b5](https://github.com/VenusProtocol/isolated-pools/commit/11201b53bcd51a1dde7a226c157384ab0b0ecadb))
* transfer ownership of rewards distributor ([097de76](https://github.com/VenusProtocol/isolated-pools/commit/097de769690e528a4b3197e51ede283013c749dc))
* uncomment code ([ce848a8](https://github.com/VenusProtocol/isolated-pools/commit/ce848a8170159b4b91b63de8cf325ab41837d756))
* updated initial supply ([d38264e](https://github.com/VenusProtocol/isolated-pools/commit/d38264e8a925ce2912b425a4262fa612b1164c40))

## [2.8.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.8.0-dev.1...v2.8.0-dev.2) (2024-04-10)


### Features

* add IR deployment for some asset on bscmainnet ([ef32034](https://github.com/VenusProtocol/isolated-pools/commit/ef3203455cd4c1e10f21d00ac54c47cc83f1d80f))
* IR deployments for some assets on opbnb and ethereum ([b353c2a](https://github.com/VenusProtocol/isolated-pools/commit/b353c2a3c2b4709c483c5b1a1ff5ce26cf068879))
* updating deployment files ([bfd0f79](https://github.com/VenusProtocol/isolated-pools/commit/bfd0f79d60a8eacd6354d6c3ff8833b9438e0836))
* updating deployment files ([86fb040](https://github.com/VenusProtocol/isolated-pools/commit/86fb0407c03595acd2abdf1609eaa33e6ef78279))
* updating deployment files ([bd10368](https://github.com/VenusProtocol/isolated-pools/commit/bd10368a435dbd61ae463864aa316280eae1a27f))

## [2.8.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.7.0...v2.8.0-dev.1) (2024-04-03)


### Features

* add rewards config for Ethereum (initial config) ([5c2a03e](https://github.com/VenusProtocol/isolated-pools/commit/5c2a03e7d8d1929a5ef586f79b47d5c7107abb34))
* add rewards config for Ethereum (initial config) ([4dfa61e](https://github.com/VenusProtocol/isolated-pools/commit/4dfa61e0c54779a34a45b61a50dabb58c8aa2b80))
* updating deployment files ([1cb06c8](https://github.com/VenusProtocol/isolated-pools/commit/1cb06c80dbbf3b0f09c6675b9b6f2cfd0ecbaf07))
* updating deployment files ([e3649f8](https://github.com/VenusProtocol/isolated-pools/commit/e3649f8bce1ab895a5dce244109d307f72932966))
* updating deployment files ([da6fe92](https://github.com/VenusProtocol/isolated-pools/commit/da6fe92c7ec73bcb2bfe963c914f4e4d044ade37))


### Bug Fixes

* add quotes in markets array ([81185ce](https://github.com/VenusProtocol/isolated-pools/commit/81185ceead6fa096ccbea770886f700231284ae0))
* bump core protocol version ([025dfee](https://github.com/VenusProtocol/isolated-pools/commit/025dfeeaa0b6e96719bd7f274fd6866c6cbc12b2))
* market naming in rewards config ([a09ce96](https://github.com/VenusProtocol/isolated-pools/commit/a09ce96a8763e30c568f061e45a2257a1078f36e))
* push only necessary files ([c74b03f](https://github.com/VenusProtocol/isolated-pools/commit/c74b03fb547858577aae6101d9da1dda8d443c9b))
* reward config ([e674ba1](https://github.com/VenusProtocol/isolated-pools/commit/e674ba13e0234397e64bef2e923d58ecd63753cf))
* reward configuration syntax ([3aa6ff7](https://github.com/VenusProtocol/isolated-pools/commit/3aa6ff726cadef466cb49e7fc0d1b81ca7e04134))
* update yarn.lock ([fd635d7](https://github.com/VenusProtocol/isolated-pools/commit/fd635d7e9776dcb2d2a1b07dffea3ecd523fb1bc))
* update yarn.lock ([e841216](https://github.com/VenusProtocol/isolated-pools/commit/e84121636636d45009db14471581fa832a87a174))
* yarn lock ([54837b3](https://github.com/VenusProtocol/isolated-pools/commit/54837b39f011be2582f8ea858947b2d1eae6e4a3))
* yarn.lock ([ce42810](https://github.com/VenusProtocol/isolated-pools/commit/ce4281040413997ac751d5e742e174631aba322e))

## [2.7.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.6.0...v2.7.0) (2024-03-19)


### Features

* add actions paused bitmask to PoolLens ([12a1810](https://github.com/VenusProtocol/isolated-pools/commit/12a18107c4c2eb4a8123129eaca07dca9cc28ccf))
* add borrowBehalf, redeemBehalf and redeemUnderlyingBehalf functionality ([9f131f9](https://github.com/VenusProtocol/isolated-pools/commit/9f131f9df2b283618c43335b764e6f6ae902ed1f))
* add deployment files for bscmainnet ([6b88e7a](https://github.com/VenusProtocol/isolated-pools/commit/6b88e7a1ca4ea89c98b01d5fa4c9c7dca78f08e3))
* add deployment files for ethereum ([f8899ed](https://github.com/VenusProtocol/isolated-pools/commit/f8899edc623e52ab5f1888e117af0e4981b35f85))
* add deployment files for sepolia and bsctestnet ([04c3c96](https://github.com/VenusProtocol/isolated-pools/commit/04c3c96b8a9e93f5fd7efe11b65f5a8395fc7eb2))
* add deployment script for NativeTokenGateway ([70f74e2](https://github.com/VenusProtocol/isolated-pools/commit/70f74e2731f005b5fd984ebd53644cd6673fa82f))
* add ethereum configuration to hardhat config ([52a2a87](https://github.com/VenusProtocol/isolated-pools/commit/52a2a872044f196dc5fcb142cca394a0fc84d5c8))
* add NativeTokenGateway contract ([649189a](https://github.com/VenusProtocol/isolated-pools/commit/649189ada697c4db3552361770e7b0d434a30b33))
* add PoolLens deployment fot ethereum ([dece366](https://github.com/VenusProtocol/isolated-pools/commit/dece3664c49ba6c2473795e10020d6036fc6fb33))
* add PoolLens deployments for mainnets(opBNB BSC) ([0c48e9a](https://github.com/VenusProtocol/isolated-pools/commit/0c48e9a16e206953e6245f149744417a2a96a4e6))
* add PoolLens deployments for testnets(sepolia, bsctestnet, opbnbtestnet) ([fa2daa4](https://github.com/VenusProtocol/isolated-pools/commit/fa2daa449e449a943df738fa615645123ba67991))
* add redeemAndUnwrap functionality ([e6bab68](https://github.com/VenusProtocol/isolated-pools/commit/e6bab683be35cf53f13adfdff35d7e1b7665a700))
* add sepolia deployment for NativeTokenGateway, VToken and Comptroller ([4d414cc](https://github.com/VenusProtocol/isolated-pools/commit/4d414ccd92c93f21ca3c6e0a87780281c3272fb6))
* add support for opbnbtestnet and opbnbmainnet in deployment script ([2b28492](https://github.com/VenusProtocol/isolated-pools/commit/2b28492d60df941fdec01c94fc612fc0cd23b42a))
* reduce reserves with available cash when accruing interest ([e1fd22d](https://github.com/VenusProtocol/isolated-pools/commit/e1fd22d7bdb02f813ff0dbf2e10e11d8530aa89f))
* remove unneeded fallback and checks, and review tests ([bb12776](https://github.com/VenusProtocol/isolated-pools/commit/bb127763e9a97d1e50427a7a247888c1b2cbfeae))
* the new version of hardhat-network-helpers was breaking the tests ([7ab9c1f](https://github.com/VenusProtocol/isolated-pools/commit/7ab9c1fc0e590722480ab8d429c2e2c4bf48605d))
* update deployment files for bscmainnet ([4957a2c](https://github.com/VenusProtocol/isolated-pools/commit/4957a2c15e0832309fe64eb107c734c1fe3b2da0))
* update deployment files for bsctestnet ([98d1d27](https://github.com/VenusProtocol/isolated-pools/commit/98d1d270fb65027ea646f3b9e80f3dbea4e28edb))
* update deployment files for opbnbmainnet ([d2e2b8f](https://github.com/VenusProtocol/isolated-pools/commit/d2e2b8f46dc92e1b371046ac81e06815c1d0bb14))
* update deployment files for opbnbmainnet ([e8bfdad](https://github.com/VenusProtocol/isolated-pools/commit/e8bfdadf3279dfcba29c9860f531491752d9a38e))
* update deployment files for sepolia ([698a1ee](https://github.com/VenusProtocol/isolated-pools/commit/698a1eeeb64be596c6d912b116c7b053b561b4c9))
* update deployments and add gateway deployment for LST pool vWETH on sepolia ([3204553](https://github.com/VenusProtocol/isolated-pools/commit/32045539725927274b07b461116d9a853462822c))
* update deployments for bsctestnet ([6c9d6e2](https://github.com/VenusProtocol/isolated-pools/commit/6c9d6e25d6ed09de488df995d4615bfe468eb077))
* update deployments for opbnbtestnet ([1adf7e1](https://github.com/VenusProtocol/isolated-pools/commit/1adf7e1917299e55712cb4934fbe4f6d557d61b7))
* updating deployment files ([6199a15](https://github.com/VenusProtocol/isolated-pools/commit/6199a15b04e0f1024e2adeeff9512a16b22fa88f))
* updating deployment files ([60f9953](https://github.com/VenusProtocol/isolated-pools/commit/60f995385c3d5bcb91f0d4ad9c910e43ddec8550))
* updating deployment files ([7658f72](https://github.com/VenusProtocol/isolated-pools/commit/7658f723aeadcf7f0a717cce4388acf2d87356b1))
* updating deployment files ([e2dfe75](https://github.com/VenusProtocol/isolated-pools/commit/e2dfe751d7acce7c3269627c010e4367c955655d))
* updating deployment files ([5371f96](https://github.com/VenusProtocol/isolated-pools/commit/5371f966e89b939e2172f5ca1e9ad8c79ab450d3))
* updating deployment files ([2a5a8fc](https://github.com/VenusProtocol/isolated-pools/commit/2a5a8fc00dfabd1b9bf78f6f4b28cc55daaf619e))
* updating deployment files ([bdbcbc4](https://github.com/VenusProtocol/isolated-pools/commit/bdbcbc4fc06c33c31ab3b103b7b76a3491ab0304))
* updating deployment files ([6f7cf1c](https://github.com/VenusProtocol/isolated-pools/commit/6f7cf1c23acb4842d8ede8e163569949c7587dc7))
* updating deployment files ([7932ed2](https://github.com/VenusProtocol/isolated-pools/commit/7932ed2d3993fd15c96fc7074a3db4cd6e003f43))
* updating deployment files ([8bd0e5a](https://github.com/VenusProtocol/isolated-pools/commit/8bd0e5ad71d4c889c60ed10d08089212ae0d29e6))
* updating deployment files ([73e2b74](https://github.com/VenusProtocol/isolated-pools/commit/73e2b74d3704f0bb80400f64258df53f7380a5a5))
* updating deployment files ([0e833ee](https://github.com/VenusProtocol/isolated-pools/commit/0e833ee6461e1b01baf71effd16ba7b42565b115))
* updating deployment files ([e6a170d](https://github.com/VenusProtocol/isolated-pools/commit/e6a170db78d81134ac17f6f1344f039b41d23868))
* updating deployment files ([38da937](https://github.com/VenusProtocol/isolated-pools/commit/38da93727d42861a79ca54bbcce69e987d9d74d3))
* updating deployment files ([e52f83a](https://github.com/VenusProtocol/isolated-pools/commit/e52f83a050aad7ed6fe3a71c83703f1d243312b7))
* updating deployment files ([5b691d3](https://github.com/VenusProtocol/isolated-pools/commit/5b691d3cfec34bb25f54379b4d08baea019dd92b))
* updating deployment files ([5e62a86](https://github.com/VenusProtocol/isolated-pools/commit/5e62a8682740c136669d90094dd0734877028702))
* updating deployment files ([9fe398b](https://github.com/VenusProtocol/isolated-pools/commit/9fe398be0b46233feb4de03d6256d445de27cb04))
* updating deployment files ([f4e7a3e](https://github.com/VenusProtocol/isolated-pools/commit/f4e7a3e29994feff2d77d9235b9f3c577d7062e0))
* updating deployment files ([772880c](https://github.com/VenusProtocol/isolated-pools/commit/772880c7bf85b4a7d25b9d9a461a7555d2445645))
* updating deployment files ([6e1d240](https://github.com/VenusProtocol/isolated-pools/commit/6e1d240edd6c3c3a32a56abf685800278ee736b1))
* updating deployment files ([bb6a212](https://github.com/VenusProtocol/isolated-pools/commit/bb6a21210bd170bfd04ace98777c62cec49683af))


### Bug Fixes

* add reentrancy check and minor gas optimizations ([c393374](https://github.com/VenusProtocol/isolated-pools/commit/c393374d313ffacd5b04a92c6abd0c43eb48fac4))
* deployment script to run for hardhat ([ae0b770](https://github.com/VenusProtocol/isolated-pools/commit/ae0b770a624d0d525968e11c2ebab4aa546ae1a8))
* failing deploy check ([2e055e0](https://github.com/VenusProtocol/isolated-pools/commit/2e055e0eda1b99b24075f369a79bdead521025af))
* fork tests for gateway contract ([48d6b45](https://github.com/VenusProtocol/isolated-pools/commit/48d6b45f6770681025343ebb2ce7d0f1cde0a256))
* GVP-01 ([d18285b](https://github.com/VenusProtocol/isolated-pools/commit/d18285b0565ec2b56e23915e626454962afc6ab5))
* imports in NativeTokenGateway.sol ([e477182](https://github.com/VenusProtocol/isolated-pools/commit/e47718295d26fd12f33c0c342e3a89f8fd166559))
* L01 ([5f494a9](https://github.com/VenusProtocol/isolated-pools/commit/5f494a971491aa81a6947dafd937964b756909a4))
* L02 ([3eaf534](https://github.com/VenusProtocol/isolated-pools/commit/3eaf53400d873d72fc6260e55b8cb18102844124))
* minor fixes ([19c676e](https://github.com/VenusProtocol/isolated-pools/commit/19c676e6f2b2f9c5b1f00ee14e90ce319fa3ddb3))
* NTG-01 ([3c33508](https://github.com/VenusProtocol/isolated-pools/commit/3c33508cad1667b8bf3c6b07b17fd0d164576420))
* NTG-05 ([bfe2c2f](https://github.com/VenusProtocol/isolated-pools/commit/bfe2c2f0bf5e95bbfe2648f193e202289c26f4f1))
* NTG-06 ([119cd12](https://github.com/VenusProtocol/isolated-pools/commit/119cd12084bef3730b877b3a424bc05716e4cd20))
* NTG-07 ([c051289](https://github.com/VenusProtocol/isolated-pools/commit/c05128906cfb983081e87c4a31f410fa1a9a3a18))
* NTV-01 ([eed3a61](https://github.com/VenusProtocol/isolated-pools/commit/eed3a61c0700ae960e63453b68af947248aabc0d))
* pr comments ([b508cb1](https://github.com/VenusProtocol/isolated-pools/commit/b508cb1ea7a7fd40bba305ac47aca94f903aae9f))
* pr comments ([c6c1d16](https://github.com/VenusProtocol/isolated-pools/commit/c6c1d16486df26314c98817d39bfe733181f8cac))
* set approval to zero in wrapAndRepay ([4e3a2c1](https://github.com/VenusProtocol/isolated-pools/commit/4e3a2c1ecdfbeda2809e62050d1525630a2efc97))
* spelling ([0a037b9](https://github.com/VenusProtocol/isolated-pools/commit/0a037b9e2501b940031550e8cb48d84bce066950))
* tests ([4af2569](https://github.com/VenusProtocol/isolated-pools/commit/4af25698a53f8b869e6d3f54ce0328118ce6051e))
* VBV-01 ([18f16c3](https://github.com/VenusProtocol/isolated-pools/commit/18f16c307ef9dd8c3365f9902c2763c388713b14))
* VEN-GATE-5 ([f8c5804](https://github.com/VenusProtocol/isolated-pools/commit/f8c58046a47d28c1b599e8aeec1096e42a699b8d))
* VPB-01 ([f1c7e98](https://github.com/VenusProtocol/isolated-pools/commit/f1c7e98bc9d87339402dfaba7a573621bb4562f9))
* VPB-01 ([dfaef87](https://github.com/VenusProtocol/isolated-pools/commit/dfaef87d68aa22b5b75883debadf3ef8cb05cd58))

## [2.7.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v2.7.0-dev.3...v2.7.0-dev.4) (2024-03-19)


### Features

* add borrowBehalf, redeemBehalf and redeemUnderlyingBehalf functionality ([9f131f9](https://github.com/VenusProtocol/isolated-pools/commit/9f131f9df2b283618c43335b764e6f6ae902ed1f))
* add deployment files for bscmainnet ([6b88e7a](https://github.com/VenusProtocol/isolated-pools/commit/6b88e7a1ca4ea89c98b01d5fa4c9c7dca78f08e3))
* add deployment files for ethereum ([f8899ed](https://github.com/VenusProtocol/isolated-pools/commit/f8899edc623e52ab5f1888e117af0e4981b35f85))
* add deployment files for sepolia and bsctestnet ([04c3c96](https://github.com/VenusProtocol/isolated-pools/commit/04c3c96b8a9e93f5fd7efe11b65f5a8395fc7eb2))
* add deployment script for NativeTokenGateway ([70f74e2](https://github.com/VenusProtocol/isolated-pools/commit/70f74e2731f005b5fd984ebd53644cd6673fa82f))
* add ethereum configuration to hardhat config ([52a2a87](https://github.com/VenusProtocol/isolated-pools/commit/52a2a872044f196dc5fcb142cca394a0fc84d5c8))
* add NativeTokenGateway contract ([649189a](https://github.com/VenusProtocol/isolated-pools/commit/649189ada697c4db3552361770e7b0d434a30b33))
* add redeemAndUnwrap functionality ([e6bab68](https://github.com/VenusProtocol/isolated-pools/commit/e6bab683be35cf53f13adfdff35d7e1b7665a700))
* add sepolia deployment for NativeTokenGateway, VToken and Comptroller ([4d414cc](https://github.com/VenusProtocol/isolated-pools/commit/4d414ccd92c93f21ca3c6e0a87780281c3272fb6))
* add support for opbnbtestnet and opbnbmainnet in deployment script ([2b28492](https://github.com/VenusProtocol/isolated-pools/commit/2b28492d60df941fdec01c94fc612fc0cd23b42a))
* remove unneeded fallback and checks, and review tests ([bb12776](https://github.com/VenusProtocol/isolated-pools/commit/bb127763e9a97d1e50427a7a247888c1b2cbfeae))
* update deployment files for bscmainnet ([4957a2c](https://github.com/VenusProtocol/isolated-pools/commit/4957a2c15e0832309fe64eb107c734c1fe3b2da0))
* update deployment files for bsctestnet ([98d1d27](https://github.com/VenusProtocol/isolated-pools/commit/98d1d270fb65027ea646f3b9e80f3dbea4e28edb))
* update deployment files for opbnbmainnet ([d2e2b8f](https://github.com/VenusProtocol/isolated-pools/commit/d2e2b8f46dc92e1b371046ac81e06815c1d0bb14))
* update deployment files for opbnbmainnet ([e8bfdad](https://github.com/VenusProtocol/isolated-pools/commit/e8bfdadf3279dfcba29c9860f531491752d9a38e))
* update deployment files for sepolia ([698a1ee](https://github.com/VenusProtocol/isolated-pools/commit/698a1eeeb64be596c6d912b116c7b053b561b4c9))
* update deployments and add gateway deployment for LST pool vWETH on sepolia ([3204553](https://github.com/VenusProtocol/isolated-pools/commit/32045539725927274b07b461116d9a853462822c))
* update deployments for bsctestnet ([6c9d6e2](https://github.com/VenusProtocol/isolated-pools/commit/6c9d6e25d6ed09de488df995d4615bfe468eb077))
* update deployments for opbnbtestnet ([1adf7e1](https://github.com/VenusProtocol/isolated-pools/commit/1adf7e1917299e55712cb4934fbe4f6d557d61b7))
* updating deployment files ([6199a15](https://github.com/VenusProtocol/isolated-pools/commit/6199a15b04e0f1024e2adeeff9512a16b22fa88f))
* updating deployment files ([60f9953](https://github.com/VenusProtocol/isolated-pools/commit/60f995385c3d5bcb91f0d4ad9c910e43ddec8550))
* updating deployment files ([7658f72](https://github.com/VenusProtocol/isolated-pools/commit/7658f723aeadcf7f0a717cce4388acf2d87356b1))
* updating deployment files ([e2dfe75](https://github.com/VenusProtocol/isolated-pools/commit/e2dfe751d7acce7c3269627c010e4367c955655d))
* updating deployment files ([7932ed2](https://github.com/VenusProtocol/isolated-pools/commit/7932ed2d3993fd15c96fc7074a3db4cd6e003f43))
* updating deployment files ([8bd0e5a](https://github.com/VenusProtocol/isolated-pools/commit/8bd0e5ad71d4c889c60ed10d08089212ae0d29e6))
* updating deployment files ([73e2b74](https://github.com/VenusProtocol/isolated-pools/commit/73e2b74d3704f0bb80400f64258df53f7380a5a5))
* updating deployment files ([0e833ee](https://github.com/VenusProtocol/isolated-pools/commit/0e833ee6461e1b01baf71effd16ba7b42565b115))
* updating deployment files ([e6a170d](https://github.com/VenusProtocol/isolated-pools/commit/e6a170db78d81134ac17f6f1344f039b41d23868))
* updating deployment files ([38da937](https://github.com/VenusProtocol/isolated-pools/commit/38da93727d42861a79ca54bbcce69e987d9d74d3))
* updating deployment files ([e52f83a](https://github.com/VenusProtocol/isolated-pools/commit/e52f83a050aad7ed6fe3a71c83703f1d243312b7))
* updating deployment files ([5b691d3](https://github.com/VenusProtocol/isolated-pools/commit/5b691d3cfec34bb25f54379b4d08baea019dd92b))
* updating deployment files ([9fe398b](https://github.com/VenusProtocol/isolated-pools/commit/9fe398be0b46233feb4de03d6256d445de27cb04))
* updating deployment files ([f4e7a3e](https://github.com/VenusProtocol/isolated-pools/commit/f4e7a3e29994feff2d77d9235b9f3c577d7062e0))
* updating deployment files ([772880c](https://github.com/VenusProtocol/isolated-pools/commit/772880c7bf85b4a7d25b9d9a461a7555d2445645))
* updating deployment files ([6e1d240](https://github.com/VenusProtocol/isolated-pools/commit/6e1d240edd6c3c3a32a56abf685800278ee736b1))
* updating deployment files ([bb6a212](https://github.com/VenusProtocol/isolated-pools/commit/bb6a21210bd170bfd04ace98777c62cec49683af))


### Bug Fixes

* add reentrancy check and minor gas optimizations ([c393374](https://github.com/VenusProtocol/isolated-pools/commit/c393374d313ffacd5b04a92c6abd0c43eb48fac4))
* deployment script to run for hardhat ([ae0b770](https://github.com/VenusProtocol/isolated-pools/commit/ae0b770a624d0d525968e11c2ebab4aa546ae1a8))
* failing deploy check ([2e055e0](https://github.com/VenusProtocol/isolated-pools/commit/2e055e0eda1b99b24075f369a79bdead521025af))
* fork tests for gateway contract ([48d6b45](https://github.com/VenusProtocol/isolated-pools/commit/48d6b45f6770681025343ebb2ce7d0f1cde0a256))
* GVP-01 ([d18285b](https://github.com/VenusProtocol/isolated-pools/commit/d18285b0565ec2b56e23915e626454962afc6ab5))
* imports in NativeTokenGateway.sol ([e477182](https://github.com/VenusProtocol/isolated-pools/commit/e47718295d26fd12f33c0c342e3a89f8fd166559))
* L01 ([5f494a9](https://github.com/VenusProtocol/isolated-pools/commit/5f494a971491aa81a6947dafd937964b756909a4))
* L02 ([3eaf534](https://github.com/VenusProtocol/isolated-pools/commit/3eaf53400d873d72fc6260e55b8cb18102844124))
* minor fixes ([19c676e](https://github.com/VenusProtocol/isolated-pools/commit/19c676e6f2b2f9c5b1f00ee14e90ce319fa3ddb3))
* NTG-01 ([3c33508](https://github.com/VenusProtocol/isolated-pools/commit/3c33508cad1667b8bf3c6b07b17fd0d164576420))
* NTG-05 ([bfe2c2f](https://github.com/VenusProtocol/isolated-pools/commit/bfe2c2f0bf5e95bbfe2648f193e202289c26f4f1))
* NTG-06 ([119cd12](https://github.com/VenusProtocol/isolated-pools/commit/119cd12084bef3730b877b3a424bc05716e4cd20))
* NTG-07 ([c051289](https://github.com/VenusProtocol/isolated-pools/commit/c05128906cfb983081e87c4a31f410fa1a9a3a18))
* NTV-01 ([eed3a61](https://github.com/VenusProtocol/isolated-pools/commit/eed3a61c0700ae960e63453b68af947248aabc0d))
* pr comments ([b508cb1](https://github.com/VenusProtocol/isolated-pools/commit/b508cb1ea7a7fd40bba305ac47aca94f903aae9f))
* pr comments ([c6c1d16](https://github.com/VenusProtocol/isolated-pools/commit/c6c1d16486df26314c98817d39bfe733181f8cac))
* set approval to zero in wrapAndRepay ([4e3a2c1](https://github.com/VenusProtocol/isolated-pools/commit/4e3a2c1ecdfbeda2809e62050d1525630a2efc97))
* spelling ([0a037b9](https://github.com/VenusProtocol/isolated-pools/commit/0a037b9e2501b940031550e8cb48d84bce066950))
* tests ([4af2569](https://github.com/VenusProtocol/isolated-pools/commit/4af25698a53f8b869e6d3f54ce0328118ce6051e))
* VBV-01 ([18f16c3](https://github.com/VenusProtocol/isolated-pools/commit/18f16c307ef9dd8c3365f9902c2763c388713b14))
* VEN-GATE-5 ([f8c5804](https://github.com/VenusProtocol/isolated-pools/commit/f8c58046a47d28c1b599e8aeec1096e42a699b8d))
* VPB-01 ([f1c7e98](https://github.com/VenusProtocol/isolated-pools/commit/f1c7e98bc9d87339402dfaba7a573621bb4562f9))
* VPB-01 ([dfaef87](https://github.com/VenusProtocol/isolated-pools/commit/dfaef87d68aa22b5b75883debadf3ef8cb05cd58))

## [2.7.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v2.7.0-dev.2...v2.7.0-dev.3) (2024-03-13)


### Features

* add actions paused bitmask to PoolLens ([12a1810](https://github.com/VenusProtocol/isolated-pools/commit/12a18107c4c2eb4a8123129eaca07dca9cc28ccf))
* add PoolLens deployment fot ethereum ([dece366](https://github.com/VenusProtocol/isolated-pools/commit/dece3664c49ba6c2473795e10020d6036fc6fb33))
* add PoolLens deployments for mainnets(opBNB BSC) ([0c48e9a](https://github.com/VenusProtocol/isolated-pools/commit/0c48e9a16e206953e6245f149744417a2a96a4e6))
* add PoolLens deployments for testnets(sepolia, bsctestnet, opbnbtestnet) ([fa2daa4](https://github.com/VenusProtocol/isolated-pools/commit/fa2daa449e449a943df738fa615645123ba67991))
* updating deployment files ([5371f96](https://github.com/VenusProtocol/isolated-pools/commit/5371f966e89b939e2172f5ca1e9ad8c79ab450d3))
* updating deployment files ([2a5a8fc](https://github.com/VenusProtocol/isolated-pools/commit/2a5a8fc00dfabd1b9bf78f6f4b28cc55daaf619e))
* updating deployment files ([bdbcbc4](https://github.com/VenusProtocol/isolated-pools/commit/bdbcbc4fc06c33c31ab3b103b7b76a3491ab0304))
* updating deployment files ([6f7cf1c](https://github.com/VenusProtocol/isolated-pools/commit/6f7cf1c23acb4842d8ede8e163569949c7587dc7))

## [2.7.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.7.0-dev.1...v2.7.0-dev.2) (2024-03-12)


### Features

* reduce reserves with available cash when accruing interest ([e1fd22d](https://github.com/VenusProtocol/isolated-pools/commit/e1fd22d7bdb02f813ff0dbf2e10e11d8530aa89f))
* the new version of hardhat-network-helpers was breaking the tests ([7ab9c1f](https://github.com/VenusProtocol/isolated-pools/commit/7ab9c1fc0e590722480ab8d429c2e2c4bf48605d))

## [2.7.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.6.0...v2.7.0-dev.1) (2024-02-29)


### Features

* updating deployment files ([5e62a86](https://github.com/VenusProtocol/isolated-pools/commit/5e62a8682740c136669d90094dd0734877028702))

## [2.6.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.5.0...v2.6.0) (2024-02-27)


### Features

* add pool iin config and sepolia deployments ([34d5932](https://github.com/VenusProtocol/isolated-pools/commit/34d59326929472eb7a85856f47aecb196b3df647))
* updating deployment files ([30fec3a](https://github.com/VenusProtocol/isolated-pools/commit/30fec3af7cfbb1c042c16591707bb53195092f8b))
* updating deployment files ([52cb895](https://github.com/VenusProtocol/isolated-pools/commit/52cb895c969bd1b9cf960f115ef072db2d07d9e5))
* updating deployment files ([3cb372d](https://github.com/VenusProtocol/isolated-pools/commit/3cb372db4ac61a1684350d0504500d6ba57dcd7d))
* use main version of the oracles npm package ([932c328](https://github.com/VenusProtocol/isolated-pools/commit/932c3285308fe813fff17ef518c55d3f262a23d9))


### Bug Fixes

* bootstrap liquidity ([5aa7cbf](https://github.com/VenusProtocol/isolated-pools/commit/5aa7cbf802634f66a7ff7d4e826a8a4b187b2b84))
* lint ([9aceb23](https://github.com/VenusProtocol/isolated-pools/commit/9aceb2394bd14a4c8efb7a18d913b2244a31d870))
* yarn lock ([4f22baa](https://github.com/VenusProtocol/isolated-pools/commit/4f22baa1322b851aae5baf4ab225a6db61a0b81a))
* yarn lock ([0f54865](https://github.com/VenusProtocol/isolated-pools/commit/0f548651a54e3ba9cd060c1fb90323dd881ddac2))

## [2.6.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.5.1-dev.1...v2.6.0-dev.1) (2024-02-27)


### Features

* add pool iin config and sepolia deployments ([34d5932](https://github.com/VenusProtocol/isolated-pools/commit/34d59326929472eb7a85856f47aecb196b3df647))
* updating deployment files ([30fec3a](https://github.com/VenusProtocol/isolated-pools/commit/30fec3af7cfbb1c042c16591707bb53195092f8b))
* updating deployment files ([52cb895](https://github.com/VenusProtocol/isolated-pools/commit/52cb895c969bd1b9cf960f115ef072db2d07d9e5))
* updating deployment files ([3cb372d](https://github.com/VenusProtocol/isolated-pools/commit/3cb372db4ac61a1684350d0504500d6ba57dcd7d))
* use main version of the oracles npm package ([932c328](https://github.com/VenusProtocol/isolated-pools/commit/932c3285308fe813fff17ef518c55d3f262a23d9))


### Bug Fixes

* bootstrap liquidity ([5aa7cbf](https://github.com/VenusProtocol/isolated-pools/commit/5aa7cbf802634f66a7ff7d4e826a8a4b187b2b84))
* lint ([9aceb23](https://github.com/VenusProtocol/isolated-pools/commit/9aceb2394bd14a4c8efb7a18d913b2244a31d870))
* yarn lock ([4f22baa](https://github.com/VenusProtocol/isolated-pools/commit/4f22baa1322b851aae5baf4ab225a6db61a0b81a))

## [2.5.1-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.5.0...v2.5.1-dev.1) (2024-02-21)


### Bug Fixes

* yarn lock ([0f54865](https://github.com/VenusProtocol/isolated-pools/commit/0f548651a54e3ba9cd060c1fb90323dd881ddac2))

## [2.5.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0...v2.5.0) (2024-01-25)


### Features

* update yarn.lock file ([69541d4](https://github.com/VenusProtocol/isolated-pools/commit/69541d43a3a868ac7b9ac53b521ff2fb53de1358))
* usr the version with Token converters ([8354cce](https://github.com/VenusProtocol/isolated-pools/commit/8354cce398da2d0f33aec0cfbfa00e0cc9386eeb))

## [2.5.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.5.0-dev.1...v2.5.0-dev.2) (2024-01-25)


### Features

* update yarn.lock file ([69541d4](https://github.com/VenusProtocol/isolated-pools/commit/69541d43a3a868ac7b9ac53b521ff2fb53de1358))

## [2.5.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0...v2.5.0-dev.1) (2024-01-25)


### Features

* usr the version with Token converters ([8354cce](https://github.com/VenusProtocol/isolated-pools/commit/8354cce398da2d0f33aec0cfbfa00e0cc9386eeb))

## [2.4.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0...v2.4.0) (2024-01-23)


### Features

* add PoolRegistry fix, deployment script and deployment fixing the approve for non-compliant tokens ([4c0ad9b](https://github.com/VenusProtocol/isolated-pools/commit/4c0ad9bdc508d7023d8069b1576f7e876ded4770))
* set Curve as the receiver of initial VTokens in the Curve markets ([f1e6835](https://github.com/VenusProtocol/isolated-pools/commit/f1e6835b65886b4fd28f773d225857d517845784))
* update deps to the stable versions ([5df4dac](https://github.com/VenusProtocol/isolated-pools/commit/5df4dac72429bbff083aab6df4d04967dc638f1b))
* update deps to the stable versions ([bc2bcab](https://github.com/VenusProtocol/isolated-pools/commit/bc2bcab668fcd4e859ce420ea5530a736a7b3b3c))
* updating deployment files ([0363847](https://github.com/VenusProtocol/isolated-pools/commit/036384727a1e34bd62544fa909769c945e3810bb))
* updating deployment files ([4a4e6de](https://github.com/VenusProtocol/isolated-pools/commit/4a4e6de7992e7374895519ed9bc9f477c96ec36d))
* updating deployment files ([9a74882](https://github.com/VenusProtocol/isolated-pools/commit/9a748826ccbe7107f96cb48df32c06153dfa6e4d))
* updating deployment files ([8a7c9e1](https://github.com/VenusProtocol/isolated-pools/commit/8a7c9e18b3b875428d061e2276ff626cd82a26e3))
* updating deployment files ([99c4e0c](https://github.com/VenusProtocol/isolated-pools/commit/99c4e0cca4c42c6991acca788edb8f2c3b0b8898))
* updating deployment files ([cf5fba8](https://github.com/VenusProtocol/isolated-pools/commit/cf5fba8a493575f186f06fb6923258f5d9f77bf1))
* updating deployment files ([0474e56](https://github.com/VenusProtocol/isolated-pools/commit/0474e568e3b106854120dea09a812af28038768b))
* updating deployment files ([5ecb1ea](https://github.com/VenusProtocol/isolated-pools/commit/5ecb1ea7923a872fcdbbe65180480fbb37765f79))
* upgrade the impl of vtokens and comptroller ([2c75fa2](https://github.com/VenusProtocol/isolated-pools/commit/2c75fa2ff8db0f4cfe8bc84dfa43a3bce331c8b4))

## [2.4.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0-dev.5...v2.4.0-dev.6) (2024-01-23)


### Features

* update deps to the stable versions ([5df4dac](https://github.com/VenusProtocol/isolated-pools/commit/5df4dac72429bbff083aab6df4d04967dc638f1b))
* update deps to the stable versions ([bc2bcab](https://github.com/VenusProtocol/isolated-pools/commit/bc2bcab668fcd4e859ce420ea5530a736a7b3b3c))

## [2.4.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0-dev.4...v2.4.0-dev.5) (2024-01-23)


### Features

* set Curve as the receiver of initial VTokens in the Curve markets ([f1e6835](https://github.com/VenusProtocol/isolated-pools/commit/f1e6835b65886b4fd28f773d225857d517845784))
* updating deployment files ([0363847](https://github.com/VenusProtocol/isolated-pools/commit/036384727a1e34bd62544fa909769c945e3810bb))
* updating deployment files ([4a4e6de](https://github.com/VenusProtocol/isolated-pools/commit/4a4e6de7992e7374895519ed9bc9f477c96ec36d))
* updating deployment files ([9a74882](https://github.com/VenusProtocol/isolated-pools/commit/9a748826ccbe7107f96cb48df32c06153dfa6e4d))
* updating deployment files ([99c4e0c](https://github.com/VenusProtocol/isolated-pools/commit/99c4e0cca4c42c6991acca788edb8f2c3b0b8898))
* updating deployment files ([cf5fba8](https://github.com/VenusProtocol/isolated-pools/commit/cf5fba8a493575f186f06fb6923258f5d9f77bf1))

## [2.4.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0-dev.3...v2.4.0-dev.4) (2024-01-23)


### Features

* add PoolRegistry fix, deployment script and deployment fixing the approve for non-compliant tokens ([4c0ad9b](https://github.com/VenusProtocol/isolated-pools/commit/4c0ad9bdc508d7023d8069b1576f7e876ded4770))
* updating deployment files ([8a7c9e1](https://github.com/VenusProtocol/isolated-pools/commit/8a7c9e18b3b875428d061e2276ff626cd82a26e3))

## [2.4.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0-dev.2...v2.4.0-dev.3) (2024-01-09)

## [2.4.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.4.0-dev.1...v2.4.0-dev.2) (2024-01-03)


### Features

* updating deployment files ([5ecb1ea](https://github.com/VenusProtocol/isolated-pools/commit/5ecb1ea7923a872fcdbbe65180480fbb37765f79))
* upgrade the impl of vtokens and comptroller ([2c75fa2](https://github.com/VenusProtocol/isolated-pools/commit/2c75fa2ff8db0f4cfe8bc84dfa43a3bce331c8b4))

## [2.4.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0...v2.4.0-dev.1) (2024-01-02)


### Features

* updating deployment files ([0474e56](https://github.com/VenusProtocol/isolated-pools/commit/0474e568e3b106854120dea09a812af28038768b))

## [2.3.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.2.0...v2.3.0) (2023-12-29)


### Features

* add github job to export and commit deployment by network ([33f92fc](https://github.com/VenusProtocol/isolated-pools/commit/33f92fc23ff11cbd75138a18b31bc6ffb262281a))
* add IL market deployments to opbnbtestnet ([2de9fd8](https://github.com/VenusProtocol/isolated-pools/commit/2de9fd829824bbe91e576317c934aa54b3a8fdd0))
* add mainnet config for new markets ([8782a78](https://github.com/VenusProtocol/isolated-pools/commit/8782a782da48ff75dad7214d51f0b1699a249bbf))
* add mock token deployments for opbnbtestnet ([db810aa](https://github.com/VenusProtocol/isolated-pools/commit/db810aa04335ea6d05df81f3423338c2a3c6b291))
* add PLANET market deployments ([fa21a3d](https://github.com/VenusProtocol/isolated-pools/commit/fa21a3d769046c7cc67de918e1b6b505db5f5141))
* add reward distributor for core pool ([6121c71](https://github.com/VenusProtocol/isolated-pools/commit/6121c71dcf1d79f6a17ec7ecc14dea5717158e25))
* deployments of mainnet market ([24cdcd7](https://github.com/VenusProtocol/isolated-pools/commit/24cdcd70dd2bdfa7f88a25ec926b5f064f9c10bd))
* deployments of THE and TWT market on testnet ([7870a1e](https://github.com/VenusProtocol/isolated-pools/commit/7870a1e4a693d5b44b9aada5e2e8a7e029c95ddc))
* export PLANET market deployment ([fc1c874](https://github.com/VenusProtocol/isolated-pools/commit/fc1c874f7ec28910d63ae77a8c3347cf00bb269b))
* generate file only with addresses of deployed contracts ([2302942](https://github.com/VenusProtocol/isolated-pools/commit/23029424d07d3c08aba42f9a08d39b4a3907db8b))
* redeployment of reward distributors ([fd0047e](https://github.com/VenusProtocol/isolated-pools/commit/fd0047eb2fcbb37937268bab33b69c699c3e91cb))
* support exporting sepolia and ethereum deployments ([db0ef9c](https://github.com/VenusProtocol/isolated-pools/commit/db0ef9cd1c7df3ed05174203b8a4b0f19075b749))
* update script to use psr addresses from protocol-reserve package ([a63cdd9](https://github.com/VenusProtocol/isolated-pools/commit/a63cdd929329c8844207ac9e6717d8d8332c885c))
* updating deployment files ([4095248](https://github.com/VenusProtocol/isolated-pools/commit/4095248065b79c28708008407425fab574dee194))
* updating deployment files ([6fa5890](https://github.com/VenusProtocol/isolated-pools/commit/6fa589057f40ef9d0064513f12045d4f35bbd6e9))
* updating deployment files ([d3e16d4](https://github.com/VenusProtocol/isolated-pools/commit/d3e16d46aecc55ec7a9e812efb372a06b4c733b1))
* updating deployment files ([729d2d8](https://github.com/VenusProtocol/isolated-pools/commit/729d2d8f939e298a43f6091257d7dcc117da1266))
* updating deployment files ([ed3dbdb](https://github.com/VenusProtocol/isolated-pools/commit/ed3dbdb9af1f6d9a6c48d1d1efbef497e980d4c2))
* updating deployment files ([dc35475](https://github.com/VenusProtocol/isolated-pools/commit/dc35475a8ac5e03c4132c294154e9daf7c8d701e))
* updating deployment files ([90c374e](https://github.com/VenusProtocol/isolated-pools/commit/90c374e379f33e89dbc35a826824251639f87d8f))
* updating deployment files ([a66d5d2](https://github.com/VenusProtocol/isolated-pools/commit/a66d5d2d8b4fbd292820582fd2b8bd5ae057afad))
* updating deployment files ([2834d40](https://github.com/VenusProtocol/isolated-pools/commit/2834d40a55b70bb206fef59a9c852ab4706d7484))
* updating deployment files ([20a588b](https://github.com/VenusProtocol/isolated-pools/commit/20a588b8d943e3d98afda274f085b08127ddf635))
* updating deployment files ([46c3ee8](https://github.com/VenusProtocol/isolated-pools/commit/46c3ee8bd42ab5b1f26fcf304d1c296acb8eb94b))
* updating deployment files ([8fc14cf](https://github.com/VenusProtocol/isolated-pools/commit/8fc14cf3da582ddaf3d3fd89bef8e8998a4ea8ea))
* updating deployment files ([0f3b760](https://github.com/VenusProtocol/isolated-pools/commit/0f3b7606050b49f3013a01237de6faa81678376a))
* updating deployment files ([c93a6f6](https://github.com/VenusProtocol/isolated-pools/commit/c93a6f6366c3c4e0c7d7c31f3bb4b87154a93ebf))
* updating deployment files ([f1e3083](https://github.com/VenusProtocol/isolated-pools/commit/f1e3083c56a6bca47752928016fb26517cb9c880))
* updating deployment files ([d2b7cdb](https://github.com/VenusProtocol/isolated-pools/commit/d2b7cdb02d284e0582b5edef3e36df7332e12143))
* updating deployment files ([b957327](https://github.com/VenusProtocol/isolated-pools/commit/b957327247f2d5d6c50591fa8dc31a0d97e60a9b))
* updating deployment files ([386581f](https://github.com/VenusProtocol/isolated-pools/commit/386581fd775994ba6bf469e99c0c0f31c71654a7))
* updating deployment files ([4950a26](https://github.com/VenusProtocol/isolated-pools/commit/4950a269f7c616e22502eebbd955bdb3ceb4e2fe))


### Bug Fixes

* add @types/debug ([40a73f1](https://github.com/VenusProtocol/isolated-pools/commit/40a73f1822d84508713a0c28f8277d24ac4fffbb))
* added hooks and yield tests ([02778ff](https://github.com/VenusProtocol/isolated-pools/commit/02778ffdfa11b981ba880ac2b8ba8a028565e5c2))
* added plp integration tests ([d77bf18](https://github.com/VenusProtocol/isolated-pools/commit/d77bf1841c51969d1e37a8902cce19c01aaf7fe8))
* added prime hooks to comptroller ([63298f5](https://github.com/VenusProtocol/isolated-pools/commit/63298f5a0020a595fb6d85e18d69f4a0538a2750))
* adjust  BLOCK_PER_YEAR for ethereum assuming a block is mined every 12 seconds (instead of every 14) ([b782529](https://github.com/VenusProtocol/isolated-pools/commit/b7825299a0611a423c3abd90f7f1fe32274b259f))
* bump protocol package version ([7bad19c](https://github.com/VenusProtocol/isolated-pools/commit/7bad19ceffacebda66270216d74b1a786d49e594))
* compilation error ([b78e110](https://github.com/VenusProtocol/isolated-pools/commit/b78e1100557ce5723c2302ca28265165a24a0c55))
* config of usdt_core ([f63346a](https://github.com/VenusProtocol/isolated-pools/commit/f63346a58644fbb1bc3f51edbfbbdbead25d40f4))
* cvp-01 ([88de673](https://github.com/VenusProtocol/isolated-pools/commit/88de67386e849e5af26ea5e2a380dc90b007a2ad))
* delete unused contract for this repo ([e3f1625](https://github.com/VenusProtocol/isolated-pools/commit/e3f1625654a24a2e71a8cddff3924d98c8f44198))
* deployment scripts for local deployment and update oracle package version fixing oracle deployments locally ([efdf4c0](https://github.com/VenusProtocol/isolated-pools/commit/efdf4c0584b62020eea3c4f3f4b92877e44b9414))
* deployments after resolving comments ([9618118](https://github.com/VenusProtocol/isolated-pools/commit/961811811320e662f567efeb0c1a6bd9a9f09fe8))
* exclude external deployments when exporting ([2bcf316](https://github.com/VenusProtocol/isolated-pools/commit/2bcf316f8c8394588ff9a0b72e5fc854a9db28f1))
* fix caps and typo ([207d860](https://github.com/VenusProtocol/isolated-pools/commit/207d8605d457db12d1652980edce79692d9eb474))
* fixed lint ([60942d2](https://github.com/VenusProtocol/isolated-pools/commit/60942d24a023a2ef2a184fc79749bfe72ca372c5))
* fixed tests ([67775b6](https://github.com/VenusProtocol/isolated-pools/commit/67775b650c7ba3ec71f964b1496a316ab7ffd056))
* fixed yarn lock ([d5eca4a](https://github.com/VenusProtocol/isolated-pools/commit/d5eca4a5a251d99c3d73ecd4ed4f7fd5ff60a504))
* format code ([bfaacdd](https://github.com/VenusProtocol/isolated-pools/commit/bfaacdded66adec803d9be0877733610055c9d21))
* hardhat config file ([0939e0a](https://github.com/VenusProtocol/isolated-pools/commit/0939e0af70db867d8350af8f8fc586ed6dd33409))
* lint and preconfiguredAddress decaration of Vtreasury wrong reference ([8469906](https://github.com/VenusProtocol/isolated-pools/commit/8469906743f1b9b7e2ea527fe71c7d25236d35ad))
* mainnet verify endpoint ([19f26f6](https://github.com/VenusProtocol/isolated-pools/commit/19f26f61131570829e9f4a828625caad5dda7862))
* minor ([21a52fe](https://github.com/VenusProtocol/isolated-pools/commit/21a52fef6e8dc1912b865b872c1213e29d8dd607))
* optimised setPrime ([51188e0](https://github.com/VenusProtocol/isolated-pools/commit/51188e0667863ef1f6610e619b1fba467b1a8f88))
* protocol setup done ([45f8913](https://github.com/VenusProtocol/isolated-pools/commit/45f8913d708b6c5efc07db65138167ce05837336))
* reduce reserves block delta in deployment configs ([9def1eb](https://github.com/VenusProtocol/isolated-pools/commit/9def1eb75d047c7f3bb043b938dc84c7330631fd))
* remove comment ([ef80a90](https://github.com/VenusProtocol/isolated-pools/commit/ef80a90a4ab9b407889cd03bce0f1c3d81726492))
* remove comment ([3f6ef95](https://github.com/VenusProtocol/isolated-pools/commit/3f6ef9506fe8eb3734604c2792db7e02dea06d45))
* remove duplicate token config ([f77f40a](https://github.com/VenusProtocol/isolated-pools/commit/f77f40a81d4a1509a338e4ac624cf0fced787100))
* remove package-lock.json because we use yarn ([47ad4ea](https://github.com/VenusProtocol/isolated-pools/commit/47ad4ea5d1a6cc9e8968b3d4174ed64091137254))
* resolved conflict ([1933446](https://github.com/VenusProtocol/isolated-pools/commit/1933446513af6ea16966e622f5ccc8c551b224e8))
* resolved conflict ([6858695](https://github.com/VenusProtocol/isolated-pools/commit/68586955b1f120182c619e041caea0838ce20590))
* riskfund deploy script fix (wrong resolution of merge conflict) ([4244f64](https://github.com/VenusProtocol/isolated-pools/commit/4244f649deb9400df55419634f0baef1874b0390))
* supply and borrow speeds of THE market ([f2f0695](https://github.com/VenusProtocol/isolated-pools/commit/f2f069563029327a7674be20d319115773bc947c))
* tests ([b8c14c0](https://github.com/VenusProtocol/isolated-pools/commit/b8c14c0fd912b7d466fa71ef86a6018734f3b4f4))
* update venus-protocol version ([46e1327](https://github.com/VenusProtocol/isolated-pools/commit/46e132714bab723863fd13baeec23c01ceab8a00))
* update version of core pool ([97eb8e1](https://github.com/VenusProtocol/isolated-pools/commit/97eb8e1e20c70a7cc8dee6b8603ec77925c3086d))
* use custom error ([6b600e7](https://github.com/VenusProtocol/isolated-pools/commit/6b600e7caec67c34476da8cb62ee17c0b052f67f))
* whitespaces ([7ea26e4](https://github.com/VenusProtocol/isolated-pools/commit/7ea26e405ebe2c584fa4a3ec74a27bf047e20883))
* yarn build ([8234296](https://github.com/VenusProtocol/isolated-pools/commit/823429638d7a6d3b237a7ec6cf011865ae81c878))

## [2.3.0-dev.13](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.12...v2.3.0-dev.13) (2023-12-28)


### Features

* redeployment of reward distributors ([fd0047e](https://github.com/VenusProtocol/isolated-pools/commit/fd0047eb2fcbb37937268bab33b69c699c3e91cb))
* updating deployment files ([4095248](https://github.com/VenusProtocol/isolated-pools/commit/4095248065b79c28708008407425fab574dee194))

## [2.3.0-dev.12](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.11...v2.3.0-dev.12) (2023-12-22)


### Features

* updating deployment files ([6fa5890](https://github.com/VenusProtocol/isolated-pools/commit/6fa589057f40ef9d0064513f12045d4f35bbd6e9))

## [2.3.0-dev.11](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.10...v2.3.0-dev.11) (2023-12-19)


### Features

* updating deployment files ([d3e16d4](https://github.com/VenusProtocol/isolated-pools/commit/d3e16d46aecc55ec7a9e812efb372a06b4c733b1))
* updating deployment files ([20a588b](https://github.com/VenusProtocol/isolated-pools/commit/20a588b8d943e3d98afda274f085b08127ddf635))
* updating deployment files ([46c3ee8](https://github.com/VenusProtocol/isolated-pools/commit/46c3ee8bd42ab5b1f26fcf304d1c296acb8eb94b))
* updating deployment files ([0f3b760](https://github.com/VenusProtocol/isolated-pools/commit/0f3b7606050b49f3013a01237de6faa81678376a))
* updating deployment files ([c93a6f6](https://github.com/VenusProtocol/isolated-pools/commit/c93a6f6366c3c4e0c7d7c31f3bb4b87154a93ebf))


### Bug Fixes

* add @types/debug ([40a73f1](https://github.com/VenusProtocol/isolated-pools/commit/40a73f1822d84508713a0c28f8277d24ac4fffbb))
* added hooks and yield tests ([02778ff](https://github.com/VenusProtocol/isolated-pools/commit/02778ffdfa11b981ba880ac2b8ba8a028565e5c2))
* added plp integration tests ([d77bf18](https://github.com/VenusProtocol/isolated-pools/commit/d77bf1841c51969d1e37a8902cce19c01aaf7fe8))
* added prime hooks to comptroller ([63298f5](https://github.com/VenusProtocol/isolated-pools/commit/63298f5a0020a595fb6d85e18d69f4a0538a2750))
* cvp-01 ([88de673](https://github.com/VenusProtocol/isolated-pools/commit/88de67386e849e5af26ea5e2a380dc90b007a2ad))
* fixed lint ([60942d2](https://github.com/VenusProtocol/isolated-pools/commit/60942d24a023a2ef2a184fc79749bfe72ca372c5))
* fixed tests ([67775b6](https://github.com/VenusProtocol/isolated-pools/commit/67775b650c7ba3ec71f964b1496a316ab7ffd056))
* fixed yarn lock ([d5eca4a](https://github.com/VenusProtocol/isolated-pools/commit/d5eca4a5a251d99c3d73ecd4ed4f7fd5ff60a504))
* optimised setPrime ([51188e0](https://github.com/VenusProtocol/isolated-pools/commit/51188e0667863ef1f6610e619b1fba467b1a8f88))
* protocol setup done ([45f8913](https://github.com/VenusProtocol/isolated-pools/commit/45f8913d708b6c5efc07db65138167ce05837336))
* remove comment ([ef80a90](https://github.com/VenusProtocol/isolated-pools/commit/ef80a90a4ab9b407889cd03bce0f1c3d81726492))
* remove comment ([3f6ef95](https://github.com/VenusProtocol/isolated-pools/commit/3f6ef9506fe8eb3734604c2792db7e02dea06d45))
* resolved conflict ([1933446](https://github.com/VenusProtocol/isolated-pools/commit/1933446513af6ea16966e622f5ccc8c551b224e8))
* resolved conflict ([6858695](https://github.com/VenusProtocol/isolated-pools/commit/68586955b1f120182c619e041caea0838ce20590))
* update version of core pool ([97eb8e1](https://github.com/VenusProtocol/isolated-pools/commit/97eb8e1e20c70a7cc8dee6b8603ec77925c3086d))
* use custom error ([6b600e7](https://github.com/VenusProtocol/isolated-pools/commit/6b600e7caec67c34476da8cb62ee17c0b052f67f))

## [2.3.0-dev.10](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.9...v2.3.0-dev.10) (2023-12-19)


### Features

* add mainnet config for new markets ([8782a78](https://github.com/VenusProtocol/isolated-pools/commit/8782a782da48ff75dad7214d51f0b1699a249bbf))
* deployments of mainnet market ([24cdcd7](https://github.com/VenusProtocol/isolated-pools/commit/24cdcd70dd2bdfa7f88a25ec926b5f064f9c10bd))
* deployments of THE and TWT market on testnet ([7870a1e](https://github.com/VenusProtocol/isolated-pools/commit/7870a1e4a693d5b44b9aada5e2e8a7e029c95ddc))
* updating deployment files ([dc35475](https://github.com/VenusProtocol/isolated-pools/commit/dc35475a8ac5e03c4132c294154e9daf7c8d701e))


### Bug Fixes

* deployments after resolving comments ([9618118](https://github.com/VenusProtocol/isolated-pools/commit/961811811320e662f567efeb0c1a6bd9a9f09fe8))
* fix caps and typo ([207d860](https://github.com/VenusProtocol/isolated-pools/commit/207d8605d457db12d1652980edce79692d9eb474))
* minor ([21a52fe](https://github.com/VenusProtocol/isolated-pools/commit/21a52fef6e8dc1912b865b872c1213e29d8dd607))
* supply and borrow speeds of THE market ([f2f0695](https://github.com/VenusProtocol/isolated-pools/commit/f2f069563029327a7674be20d319115773bc947c))

## [2.3.0-dev.9](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.8...v2.3.0-dev.9) (2023-12-18)


### Features

* updating deployment files ([729d2d8](https://github.com/VenusProtocol/isolated-pools/commit/729d2d8f939e298a43f6091257d7dcc117da1266))

## [2.3.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.7...v2.3.0-dev.8) (2023-12-15)


### Features

* add IL market deployments to opbnbtestnet ([2de9fd8](https://github.com/VenusProtocol/isolated-pools/commit/2de9fd829824bbe91e576317c934aa54b3a8fdd0))
* add mock token deployments for opbnbtestnet ([db810aa](https://github.com/VenusProtocol/isolated-pools/commit/db810aa04335ea6d05df81f3423338c2a3c6b291))
* updating deployment files ([ed3dbdb](https://github.com/VenusProtocol/isolated-pools/commit/ed3dbdb9af1f6d9a6c48d1d1efbef497e980d4c2))
* updating deployment files ([90c374e](https://github.com/VenusProtocol/isolated-pools/commit/90c374e379f33e89dbc35a826824251639f87d8f))


### Bug Fixes

* mainnet verify endpoint ([19f26f6](https://github.com/VenusProtocol/isolated-pools/commit/19f26f61131570829e9f4a828625caad5dda7862))

## [2.3.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.6...v2.3.0-dev.7) (2023-12-12)


### Features

* updating deployment files ([a66d5d2](https://github.com/VenusProtocol/isolated-pools/commit/a66d5d2d8b4fbd292820582fd2b8bd5ae057afad))


### Bug Fixes

* exclude external deployments when exporting ([2bcf316](https://github.com/VenusProtocol/isolated-pools/commit/2bcf316f8c8394588ff9a0b72e5fc854a9db28f1))

## [2.3.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.5...v2.3.0-dev.6) (2023-12-07)


### Features

* add reward distributor for core pool ([6121c71](https://github.com/VenusProtocol/isolated-pools/commit/6121c71dcf1d79f6a17ec7ecc14dea5717158e25))
* updating deployment files ([2834d40](https://github.com/VenusProtocol/isolated-pools/commit/2834d40a55b70bb206fef59a9c852ab4706d7484))


### Bug Fixes

* remove duplicate token config ([f77f40a](https://github.com/VenusProtocol/isolated-pools/commit/f77f40a81d4a1509a338e4ac624cf0fced787100))

## [2.3.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.4...v2.3.0-dev.5) (2023-12-06)


### Bug Fixes

* adjust  BLOCK_PER_YEAR for ethereum assuming a block is mined every 12 seconds (instead of every 14) ([b782529](https://github.com/VenusProtocol/isolated-pools/commit/b7825299a0611a423c3abd90f7f1fe32274b259f))

## [2.3.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.3...v2.3.0-dev.4) (2023-12-01)


### Features

* generate file only with addresses of deployed contracts ([2302942](https://github.com/VenusProtocol/isolated-pools/commit/23029424d07d3c08aba42f9a08d39b4a3907db8b))
* updating deployment files ([8fc14cf](https://github.com/VenusProtocol/isolated-pools/commit/8fc14cf3da582ddaf3d3fd89bef8e8998a4ea8ea))

## [2.3.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.2...v2.3.0-dev.3) (2023-11-30)


### Features

* updating deployment files ([f1e3083](https://github.com/VenusProtocol/isolated-pools/commit/f1e3083c56a6bca47752928016fb26517cb9c880))
* updating deployment files ([d2b7cdb](https://github.com/VenusProtocol/isolated-pools/commit/d2b7cdb02d284e0582b5edef3e36df7332e12143))
* updating deployment files ([b957327](https://github.com/VenusProtocol/isolated-pools/commit/b957327247f2d5d6c50591fa8dc31a0d97e60a9b))
* updating deployment files ([386581f](https://github.com/VenusProtocol/isolated-pools/commit/386581fd775994ba6bf469e99c0c0f31c71654a7))


### Bug Fixes

* bump protocol package version ([7bad19c](https://github.com/VenusProtocol/isolated-pools/commit/7bad19ceffacebda66270216d74b1a786d49e594))
* compilation error ([b78e110](https://github.com/VenusProtocol/isolated-pools/commit/b78e1100557ce5723c2302ca28265165a24a0c55))
* config of usdt_core ([f63346a](https://github.com/VenusProtocol/isolated-pools/commit/f63346a58644fbb1bc3f51edbfbbdbead25d40f4))
* delete unused contract for this repo ([e3f1625](https://github.com/VenusProtocol/isolated-pools/commit/e3f1625654a24a2e71a8cddff3924d98c8f44198))
* deployment scripts for local deployment and update oracle package version fixing oracle deployments locally ([efdf4c0](https://github.com/VenusProtocol/isolated-pools/commit/efdf4c0584b62020eea3c4f3f4b92877e44b9414))
* format code ([bfaacdd](https://github.com/VenusProtocol/isolated-pools/commit/bfaacdded66adec803d9be0877733610055c9d21))
* hardhat config file ([0939e0a](https://github.com/VenusProtocol/isolated-pools/commit/0939e0af70db867d8350af8f8fc586ed6dd33409))
* lint and preconfiguredAddress decaration of Vtreasury wrong reference ([8469906](https://github.com/VenusProtocol/isolated-pools/commit/8469906743f1b9b7e2ea527fe71c7d25236d35ad))
* riskfund deploy script fix (wrong resolution of merge conflict) ([4244f64](https://github.com/VenusProtocol/isolated-pools/commit/4244f649deb9400df55419634f0baef1874b0390))
* tests ([b8c14c0](https://github.com/VenusProtocol/isolated-pools/commit/b8c14c0fd912b7d466fa71ef86a6018734f3b4f4))
* update venus-protocol version ([46e1327](https://github.com/VenusProtocol/isolated-pools/commit/46e132714bab723863fd13baeec23c01ceab8a00))
* yarn build ([8234296](https://github.com/VenusProtocol/isolated-pools/commit/823429638d7a6d3b237a7ec6cf011865ae81c878))

## [2.3.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.3.0-dev.1...v2.3.0-dev.2) (2023-11-17)


### Features

* add github job to export and commit deployment by network ([33f92fc](https://github.com/VenusProtocol/isolated-pools/commit/33f92fc23ff11cbd75138a18b31bc6ffb262281a))
* support exporting sepolia and ethereum deployments ([db0ef9c](https://github.com/VenusProtocol/isolated-pools/commit/db0ef9cd1c7df3ed05174203b8a4b0f19075b749))
* updating deployment files ([4950a26](https://github.com/VenusProtocol/isolated-pools/commit/4950a269f7c616e22502eebbd955bdb3ceb4e2fe))

## [2.3.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.2.1-dev.1...v2.3.0-dev.1) (2023-11-13)


### Features

* add PLANET market deployments ([fa21a3d](https://github.com/VenusProtocol/isolated-pools/commit/fa21a3d769046c7cc67de918e1b6b505db5f5141))
* export PLANET market deployment ([fc1c874](https://github.com/VenusProtocol/isolated-pools/commit/fc1c874f7ec28910d63ae77a8c3347cf00bb269b))
* update script to use psr addresses from protocol-reserve package ([a63cdd9](https://github.com/VenusProtocol/isolated-pools/commit/a63cdd929329c8844207ac9e6717d8d8332c885c))


### Bug Fixes

* reduce reserves block delta in deployment configs ([9def1eb](https://github.com/VenusProtocol/isolated-pools/commit/9def1eb75d047c7f3bb043b938dc84c7330631fd))
* whitespaces ([7ea26e4](https://github.com/VenusProtocol/isolated-pools/commit/7ea26e405ebe2c584fa4a3ec74a27bf047e20883))

## [2.2.1-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.2.0...v2.2.1-dev.1) (2023-11-03)


### Bug Fixes

* remove package-lock.json because we use yarn ([47ad4ea](https://github.com/VenusProtocol/isolated-pools/commit/47ad4ea5d1a6cc9e8968b3d4174ed64091137254))

## [2.2.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0...v2.2.0) (2023-11-01)


### Features

* [VEN-1151][VEN-1152] send funds to protocol share reserve ([37e078b](https://github.com/VenusProtocol/isolated-pools/commit/37e078bed0c7d08ac5a5fb847e33ae1f1843caf4))
* add new vToken impl deployments mainnet ([7da2447](https://github.com/VenusProtocol/isolated-pools/commit/7da2447b51dc0783073b7fdd95cc8cf3c6ccaad1))
* add protocol-reserve package ([572b060](https://github.com/VenusProtocol/isolated-pools/commit/572b060c55f07d67fdacd19279dc13494b47daea))
* add separate threshold for liquidation and spread ([d89486b](https://github.com/VenusProtocol/isolated-pools/commit/d89486be5e283f5886df86a8ff4e255f2dc2e77a))
* automatic reduce reserves in liquidation and fix tests ([228ff89](https://github.com/VenusProtocol/isolated-pools/commit/228ff896bbaa2dfefe5f8d4beb75194981facf83))
* change visibility of the variables ([d3e8c3d](https://github.com/VenusProtocol/isolated-pools/commit/d3e8c3d1aa4c24f7777da6f9f9593c0d1e4f0950))
* remove PSR contracts ([ec74943](https://github.com/VenusProtocol/isolated-pools/commit/ec749437c4c9a8476d05dd2684f36b32791724c1))
* spread and liquidation reserves reduce ([1b40217](https://github.com/VenusProtocol/isolated-pools/commit/1b40217c273ed9fbef7c22aaf6e43878b1c1cb6d))
* use protocol reserve package and fix PVE007 ([c934891](https://github.com/VenusProtocol/isolated-pools/commit/c934891111cf5ee349335988924c3ca99024d902))
* use totalreserves and blocknumber to reduce reserves ([0cfc913](https://github.com/VenusProtocol/isolated-pools/commit/0cfc913282b2038d8b76609f5bdcce166c84f393))


### Bug Fixes

* 3.1.1 VTokenInterfaces.sol ([713dc7b](https://github.com/VenusProtocol/isolated-pools/commit/713dc7b53043a50a088ce3e03c91ae64fe9a1e8c))
* 3.1.2 VTokenInterfaces.sol ([fae2373](https://github.com/VenusProtocol/isolated-pools/commit/fae2373943de0fc3948b183bdc251dd196935c26))
* 3.2.1 VToken.sol ([2239a65](https://github.com/VenusProtocol/isolated-pools/commit/2239a65d159d0e4dd31381e688730f570ace437b))
* 3.2.2 VToken reinitializer(2) (IL) ([c92df3b](https://github.com/VenusProtocol/isolated-pools/commit/c92df3bf1b7585b53c2bce7d252aefee3bdb60c2))
* 4. [Low] Input Validation ([7bafbaa](https://github.com/VenusProtocol/isolated-pools/commit/7bafbaa3be3ad904ac52a102b42426e9c6a56bb2))
* added missing package ([4e34bdb](https://github.com/VenusProtocol/isolated-pools/commit/4e34bdb031c35cebef664f12140f30a1d9088293))
* bp10 ([52318d3](https://github.com/VenusProtocol/isolated-pools/commit/52318d35d3c2e9f0f50eb4a0c2312333a5b00aa8))
* certik VPB-03 inconsistencies ([9e0c151](https://github.com/VenusProtocol/isolated-pools/commit/9e0c1510e0703cb0376fd2ac4b4bc4cdb8f11d58))
* certik VPB-05 ([a3dadf1](https://github.com/VenusProtocol/isolated-pools/commit/a3dadf1bea14aac80fdd2d9bcf44564f3e86953e))
* comments ([724fe75](https://github.com/VenusProtocol/isolated-pools/commit/724fe75d34d3db5ab152ca243a01aa9802148037))
* comments ([5e597b2](https://github.com/VenusProtocol/isolated-pools/commit/5e597b2f9b0939d091cb2c3fe40decba66f5f19a))
* deployemnts config ([56ac0e1](https://github.com/VenusProtocol/isolated-pools/commit/56ac0e1ce03e66d8b0edde156b9998fe751ae545))
* deployment config ([b139a9f](https://github.com/VenusProtocol/isolated-pools/commit/b139a9f20dd566bd321f54fc6f50f33d979b76a2))
* event name ([4576435](https://github.com/VenusProtocol/isolated-pools/commit/45764358d69e3afe39b990d1e7b181ae1023be45))
* fairyproof 3.2 Recommendation ([586f98c](https://github.com/VenusProtocol/isolated-pools/commit/586f98c4568796d42604ee4136b75d1608d6fe1e))
* fix packages ([e5f66c1](https://github.com/VenusProtocol/isolated-pools/commit/e5f66c1a342ca1fabbe94df6a3b8c2d04ce41d16))
* fix psr related tests ([ed4f375](https://github.com/VenusProtocol/isolated-pools/commit/ed4f375729df43a0e4555172605e6b85357d7514))
* minor fix ([06a7c55](https://github.com/VenusProtocol/isolated-pools/commit/06a7c556c82bd4126d447c64b5274271832c5a32))
* optimise gas in setReduceReservesBlockDelta ([ac25981](https://github.com/VenusProtocol/isolated-pools/commit/ac25981a089080391bb9cbea75585ede388bad7f))
* prevents reduce reserves from failing in reduceReserve function ([d1aa848](https://github.com/VenusProtocol/isolated-pools/commit/d1aa84837b3839a5492c92a08d6fc9ca930bb50c))
* pve006 ([7ac357c](https://github.com/VenusProtocol/isolated-pools/commit/7ac357cf78e4d4102d852f1f350c97da7c6ceb7f))
* reduce of reserves ([580dd80](https://github.com/VenusProtocol/isolated-pools/commit/580dd805bf5f044c0c83f3d83161352d50d9bd51))
* remove duplicate import ([6ae1860](https://github.com/VenusProtocol/isolated-pools/commit/6ae18601aad9bc1e41208dae262dd6ab6a8226b0))
* remove only ([17f65b6](https://github.com/VenusProtocol/isolated-pools/commit/17f65b6260137338d81278219fa1481e1b89d62f))
* remove the amount on invoking protocol share function ([421367d](https://github.com/VenusProtocol/isolated-pools/commit/421367d7a9092faec6c770aa2b82c2e0119392bc))
* resolve conflicts ([fa57d22](https://github.com/VenusProtocol/isolated-pools/commit/fa57d22e94471fc0c7d85fc9a21f91397c779987))
* script ([3fe2431](https://github.com/VenusProtocol/isolated-pools/commit/3fe243186ca44bf7d8fa182cce6410ef6d79b47d))
* tests ([a5963fc](https://github.com/VenusProtocol/isolated-pools/commit/a5963fcb166adae5103613894b542ca00cc84b74))


### Reverts

* Revert "fix: pve006" ([86d6de6](https://github.com/VenusProtocol/isolated-pools/commit/86d6de62c3787ce24ce6c85cde160c5b19fe9979))

## [2.2.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0...v2.2.0-dev.1) (2023-10-31)


### Features

* [VEN-1151][VEN-1152] send funds to protocol share reserve ([37e078b](https://github.com/VenusProtocol/isolated-pools/commit/37e078bed0c7d08ac5a5fb847e33ae1f1843caf4))
* add new vToken impl deployments mainnet ([7da2447](https://github.com/VenusProtocol/isolated-pools/commit/7da2447b51dc0783073b7fdd95cc8cf3c6ccaad1))
* add protocol-reserve package ([572b060](https://github.com/VenusProtocol/isolated-pools/commit/572b060c55f07d67fdacd19279dc13494b47daea))
* add separate threshold for liquidation and spread ([d89486b](https://github.com/VenusProtocol/isolated-pools/commit/d89486be5e283f5886df86a8ff4e255f2dc2e77a))
* automatic reduce reserves in liquidation and fix tests ([228ff89](https://github.com/VenusProtocol/isolated-pools/commit/228ff896bbaa2dfefe5f8d4beb75194981facf83))
* change visibility of the variables ([d3e8c3d](https://github.com/VenusProtocol/isolated-pools/commit/d3e8c3d1aa4c24f7777da6f9f9593c0d1e4f0950))
* remove PSR contracts ([ec74943](https://github.com/VenusProtocol/isolated-pools/commit/ec749437c4c9a8476d05dd2684f36b32791724c1))
* spread and liquidation reserves reduce ([1b40217](https://github.com/VenusProtocol/isolated-pools/commit/1b40217c273ed9fbef7c22aaf6e43878b1c1cb6d))
* use protocol reserve package and fix PVE007 ([c934891](https://github.com/VenusProtocol/isolated-pools/commit/c934891111cf5ee349335988924c3ca99024d902))
* use totalreserves and blocknumber to reduce reserves ([0cfc913](https://github.com/VenusProtocol/isolated-pools/commit/0cfc913282b2038d8b76609f5bdcce166c84f393))


### Bug Fixes

* 3.1.1 VTokenInterfaces.sol ([713dc7b](https://github.com/VenusProtocol/isolated-pools/commit/713dc7b53043a50a088ce3e03c91ae64fe9a1e8c))
* 3.1.2 VTokenInterfaces.sol ([fae2373](https://github.com/VenusProtocol/isolated-pools/commit/fae2373943de0fc3948b183bdc251dd196935c26))
* 3.2.1 VToken.sol ([2239a65](https://github.com/VenusProtocol/isolated-pools/commit/2239a65d159d0e4dd31381e688730f570ace437b))
* 3.2.2 VToken reinitializer(2) (IL) ([c92df3b](https://github.com/VenusProtocol/isolated-pools/commit/c92df3bf1b7585b53c2bce7d252aefee3bdb60c2))
* 4. [Low] Input Validation ([7bafbaa](https://github.com/VenusProtocol/isolated-pools/commit/7bafbaa3be3ad904ac52a102b42426e9c6a56bb2))
* added missing package ([4e34bdb](https://github.com/VenusProtocol/isolated-pools/commit/4e34bdb031c35cebef664f12140f30a1d9088293))
* bp10 ([52318d3](https://github.com/VenusProtocol/isolated-pools/commit/52318d35d3c2e9f0f50eb4a0c2312333a5b00aa8))
* certik VPB-03 inconsistencies ([9e0c151](https://github.com/VenusProtocol/isolated-pools/commit/9e0c1510e0703cb0376fd2ac4b4bc4cdb8f11d58))
* certik VPB-05 ([a3dadf1](https://github.com/VenusProtocol/isolated-pools/commit/a3dadf1bea14aac80fdd2d9bcf44564f3e86953e))
* comments ([724fe75](https://github.com/VenusProtocol/isolated-pools/commit/724fe75d34d3db5ab152ca243a01aa9802148037))
* comments ([5e597b2](https://github.com/VenusProtocol/isolated-pools/commit/5e597b2f9b0939d091cb2c3fe40decba66f5f19a))
* deployemnts config ([56ac0e1](https://github.com/VenusProtocol/isolated-pools/commit/56ac0e1ce03e66d8b0edde156b9998fe751ae545))
* deployment config ([b139a9f](https://github.com/VenusProtocol/isolated-pools/commit/b139a9f20dd566bd321f54fc6f50f33d979b76a2))
* event name ([4576435](https://github.com/VenusProtocol/isolated-pools/commit/45764358d69e3afe39b990d1e7b181ae1023be45))
* fairyproof 3.2 Recommendation ([586f98c](https://github.com/VenusProtocol/isolated-pools/commit/586f98c4568796d42604ee4136b75d1608d6fe1e))
* fix packages ([e5f66c1](https://github.com/VenusProtocol/isolated-pools/commit/e5f66c1a342ca1fabbe94df6a3b8c2d04ce41d16))
* fix psr related tests ([ed4f375](https://github.com/VenusProtocol/isolated-pools/commit/ed4f375729df43a0e4555172605e6b85357d7514))
* minor fix ([06a7c55](https://github.com/VenusProtocol/isolated-pools/commit/06a7c556c82bd4126d447c64b5274271832c5a32))
* optimise gas in setReduceReservesBlockDelta ([ac25981](https://github.com/VenusProtocol/isolated-pools/commit/ac25981a089080391bb9cbea75585ede388bad7f))
* prevents reduce reserves from failing in reduceReserve function ([d1aa848](https://github.com/VenusProtocol/isolated-pools/commit/d1aa84837b3839a5492c92a08d6fc9ca930bb50c))
* pve006 ([7ac357c](https://github.com/VenusProtocol/isolated-pools/commit/7ac357cf78e4d4102d852f1f350c97da7c6ceb7f))
* reduce of reserves ([580dd80](https://github.com/VenusProtocol/isolated-pools/commit/580dd805bf5f044c0c83f3d83161352d50d9bd51))
* remove duplicate import ([6ae1860](https://github.com/VenusProtocol/isolated-pools/commit/6ae18601aad9bc1e41208dae262dd6ab6a8226b0))
* remove only ([17f65b6](https://github.com/VenusProtocol/isolated-pools/commit/17f65b6260137338d81278219fa1481e1b89d62f))
* remove the amount on invoking protocol share function ([421367d](https://github.com/VenusProtocol/isolated-pools/commit/421367d7a9092faec6c770aa2b82c2e0119392bc))
* resolve conflicts ([fa57d22](https://github.com/VenusProtocol/isolated-pools/commit/fa57d22e94471fc0c7d85fc9a21f91397c779987))
* script ([3fe2431](https://github.com/VenusProtocol/isolated-pools/commit/3fe243186ca44bf7d8fa182cce6410ef6d79b47d))
* tests ([a5963fc](https://github.com/VenusProtocol/isolated-pools/commit/a5963fcb166adae5103613894b542ca00cc84b74))


### Reverts

* Revert "fix: pve006" ([86d6de6](https://github.com/VenusProtocol/isolated-pools/commit/86d6de62c3787ce24ce6c85cde160c5b19fe9979))

## [2.1.0](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0...v2.1.0) (2023-10-19)


### Features

* add deployments of agEUR market ([667ac5f](https://github.com/VenusProtocol/isolated-pools/commit/667ac5feeedf0a7337258389f16110df864948cb))
* add info about the DefaultProxyAdmin used in testnet ([80f7a58](https://github.com/VenusProtocol/isolated-pools/commit/80f7a58f68ab0e949dcb8c5248123bf2ec4d9ba9))
* add reward distributor in agEUR market ([072714d](https://github.com/VenusProtocol/isolated-pools/commit/072714ded3dc712e9ed99748ff6a2da2adb94a02))
* add SnBNB market deployments ([add6956](https://github.com/VenusProtocol/isolated-pools/commit/add695693f9e835835e8e53a83dce81aaddfe29e))
* deploy PSR, RiskFund, Shortfall ([93408b1](https://github.com/VenusProtocol/isolated-pools/commit/93408b18da5a390869aab251354789910416c80e))
* set needed dependency to allow the deployment of SwapRouter ([96a684f](https://github.com/VenusProtocol/isolated-pools/commit/96a684fb80775b82a0ea02c2afc383fb032a7c09))
* ven-1930 force liquidation ([b871eab](https://github.com/VenusProtocol/isolated-pools/commit/b871eabaf65322e54507c7c8e3aae1db3aa9aa66))


### Bug Fixes

* added support for core pool assets in risk fund ([e161438](https://github.com/VenusProtocol/isolated-pools/commit/e1614383fe6a24b098c98ff509ce2f7e84e4e2bc))
* CVP-03 ([ebc9a9b](https://github.com/VenusProtocol/isolated-pools/commit/ebc9a9b043064e6fe4af2ac48fdc24e24eddba58))
* CVP-04 ([f4e8d2b](https://github.com/VenusProtocol/isolated-pools/commit/f4e8d2b5517ad6b104cffcdbe03c9eb2fd94ddbc))
* fixed build ([82166e5](https://github.com/VenusProtocol/isolated-pools/commit/82166e505b87c90d602a1eaff78253fe55376aaa))
* fixed integration tests ([31a4c44](https://github.com/VenusProtocol/isolated-pools/commit/31a4c449a1386f8bb222a3263cc0b39aeec4b85a))
* fixed tests ([635e206](https://github.com/VenusProtocol/isolated-pools/commit/635e2062bb972e5fa1949b2879d657d715b412d5))
* pr comments ([cbd9b18](https://github.com/VenusProtocol/isolated-pools/commit/cbd9b18a99c4e1f92bf9404e88fceb8ebc36d55f))
* redeployed risk fund implementation ([35d7139](https://github.com/VenusProtocol/isolated-pools/commit/35d7139b1de2c29815f5d4c691cb316b3a1a7c0c))
* removed only ([133ccd1](https://github.com/VenusProtocol/isolated-pools/commit/133ccd1dca4c020e6a8c773408ca278aac7e3536))
* resolved conflict ([b712134](https://github.com/VenusProtocol/isolated-pools/commit/b7121344c344a11c2a06eb4a17e53e73d847a7d1))
* use PoolRegistry interface ([761b0e1](https://github.com/VenusProtocol/isolated-pools/commit/761b0e1386ea27db1a410c29be7ad2bc3e5109aa))

## [2.1.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.7...v2.1.0-dev.8) (2023-10-18)


### Features

* ven-1930 force liquidation ([b871eab](https://github.com/VenusProtocol/isolated-pools/commit/b871eabaf65322e54507c7c8e3aae1db3aa9aa66))


### Bug Fixes

* CVP-03 ([ebc9a9b](https://github.com/VenusProtocol/isolated-pools/commit/ebc9a9b043064e6fe4af2ac48fdc24e24eddba58))
* CVP-04 ([f4e8d2b](https://github.com/VenusProtocol/isolated-pools/commit/f4e8d2b5517ad6b104cffcdbe03c9eb2fd94ddbc))
* pr comments ([cbd9b18](https://github.com/VenusProtocol/isolated-pools/commit/cbd9b18a99c4e1f92bf9404e88fceb8ebc36d55f))

## [2.1.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.6...v2.1.0-dev.7) (2023-10-18)


### Bug Fixes

* added support for core pool assets in risk fund ([e161438](https://github.com/VenusProtocol/isolated-pools/commit/e1614383fe6a24b098c98ff509ce2f7e84e4e2bc))
* fixed build ([82166e5](https://github.com/VenusProtocol/isolated-pools/commit/82166e505b87c90d602a1eaff78253fe55376aaa))
* fixed integration tests ([31a4c44](https://github.com/VenusProtocol/isolated-pools/commit/31a4c449a1386f8bb222a3263cc0b39aeec4b85a))
* fixed tests ([635e206](https://github.com/VenusProtocol/isolated-pools/commit/635e2062bb972e5fa1949b2879d657d715b412d5))
* redeployed risk fund implementation ([35d7139](https://github.com/VenusProtocol/isolated-pools/commit/35d7139b1de2c29815f5d4c691cb316b3a1a7c0c))
* removed only ([133ccd1](https://github.com/VenusProtocol/isolated-pools/commit/133ccd1dca4c020e6a8c773408ca278aac7e3536))
* resolved conflict ([b712134](https://github.com/VenusProtocol/isolated-pools/commit/b7121344c344a11c2a06eb4a17e53e73d847a7d1))
* use PoolRegistry interface ([761b0e1](https://github.com/VenusProtocol/isolated-pools/commit/761b0e1386ea27db1a410c29be7ad2bc3e5109aa))

## [2.1.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.5...v2.1.0-dev.6) (2023-10-10)

## [2.1.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.4...v2.1.0-dev.5) (2023-10-10)


### Features

* add info about the DefaultProxyAdmin used in testnet ([80f7a58](https://github.com/VenusProtocol/isolated-pools/commit/80f7a58f68ab0e949dcb8c5248123bf2ec4d9ba9))

## [2.1.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.3...v2.1.0-dev.4) (2023-10-10)


### Features

* add deployments of agEUR market ([667ac5f](https://github.com/VenusProtocol/isolated-pools/commit/667ac5feeedf0a7337258389f16110df864948cb))
* add reward distributor in agEUR market ([072714d](https://github.com/VenusProtocol/isolated-pools/commit/072714ded3dc712e9ed99748ff6a2da2adb94a02))

## [2.1.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.2...v2.1.0-dev.3) (2023-09-29)


### Features

* add SnBNB market deployments ([add6956](https://github.com/VenusProtocol/isolated-pools/commit/add695693f9e835835e8e53a83dce81aaddfe29e))

## [2.1.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.1.0-dev.1...v2.1.0-dev.2) (2023-09-18)

## [2.1.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.1-dev.1...v2.1.0-dev.1) (2023-09-15)


### Features

* deploy PSR, RiskFund, Shortfall ([93408b1](https://github.com/VenusProtocol/isolated-pools/commit/93408b18da5a390869aab251354789910416c80e))
* set needed dependency to allow the deployment of SwapRouter ([96a684f](https://github.com/VenusProtocol/isolated-pools/commit/96a684fb80775b82a0ea02c2afc383fb032a7c09))

## [2.0.1-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0...v2.0.1-dev.1) (2023-09-12)

## [2.0.0](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0...v2.0.0) (2023-09-07)


### ⚠ BREAKING CHANGES

* [RHR-01] make poolsAssetsReserves internal
* align the gap in reserve helpers

### Features

* add a balance check to graceful transfer ([03370b9](https://github.com/VenusProtocol/isolated-pools/commit/03370b97fa767fc763fad157bd08e6158e441fbb))
* add deployment info for the last rewards in the LSB pool ([5e8a082](https://github.com/VenusProtocol/isolated-pools/commit/5e8a08218984caed92fb6591f03c53648478f8ea))
* add mainnet deployment ([3b29e3e](https://github.com/VenusProtocol/isolated-pools/commit/3b29e3e591078cab0aaf868b4187f735fa9a61db))
* add re-entrancy guard ([80c7435](https://github.com/VenusProtocol/isolated-pools/commit/80c74352e317d33df17daa95943c85f7648a35b4))
* add testnet deployment of new market in DeFi pool ([8c9053f](https://github.com/VenusProtocol/isolated-pools/commit/8c9053f75a8f0f3c0bf082cdb75a01a44ef29ca3))
* avoid locking on failed transfers to previous bidders ([a689850](https://github.com/VenusProtocol/isolated-pools/commit/a6898500d17e41a8db4e3bdd03e5feaf1cae5a63))
* deploy HAY rewards distributor ([30325ea](https://github.com/VenusProtocol/isolated-pools/commit/30325ea4a680f2b81457ce7f72f857292ccf18bf))
* deployed SD Rewards distributor ([98b514d](https://github.com/VenusProtocol/isolated-pools/commit/98b514dc49b38c3a37eaf9a8d69081ffdd7d7516))
* export ankrBNB market deployment ([ec43dd8](https://github.com/VenusProtocol/isolated-pools/commit/ec43dd8d2efd2eece7494f143089a9506d40ad14))
* set risk fund percentage to 50% ([4ff68c0](https://github.com/VenusProtocol/isolated-pools/commit/4ff68c088bf83fe029b76016399f1a5bf1733631))
* support deadline in swapPoolsAssets ([103be13](https://github.com/VenusProtocol/isolated-pools/commit/103be136015e45d88086a8e001bf7f01cc767fff))
* update base asset price before querying ([a2cb18a](https://github.com/VenusProtocol/isolated-pools/commit/a2cb18a74db663cb79890aa4d5891d840be32769))
* upgrade HAY rewards distributor on bsctestnet ([12dceac](https://github.com/VenusProtocol/isolated-pools/commit/12dceac5746d38654539453ffbdcef2ec3a8efb0))
* ven-1567 add sweep token function ([192a19d](https://github.com/VenusProtocol/isolated-pools/commit/192a19db17bef9e2f51c041b77abc6ff7077973e))
* ven-1743 Risk Fund ([7413501](https://github.com/VenusProtocol/isolated-pools/commit/7413501ac5210ff5e688d353f383aaf4e057a3c6))


### Bug Fixes

* [RFR-01][RFR-03] unify the meaning of minAmountToConvert ([db0e468](https://github.com/VenusProtocol/isolated-pools/commit/db0e468de1fc0f536e05d0a716b6572c60a28c53))
* [SSV-01] use _transferOutOrTrackDebt upon closing the auction ([5ca628c](https://github.com/VenusProtocol/isolated-pools/commit/5ca628c1a94abe654d8cc7461e0fe920898f808c))
* [VPB-04] fix potential re-entrancy issues ([42a9f78](https://github.com/VenusProtocol/isolated-pools/commit/42a9f78dbe59afa8477235f8a9be20bcacad6b7c))
* added SD rewards distributor ([ed4ed8a](https://github.com/VenusProtocol/isolated-pools/commit/ed4ed8a3a26620d06143cf9912889cb82bb35cd9))
* allow reward distributor with same reward token ([7603b4e](https://github.com/VenusProtocol/isolated-pools/commit/7603b4ed84040dd883aa3a8f411dd2d2d1fb4956))
* comments ([fecd4bb](https://github.com/VenusProtocol/isolated-pools/commit/fecd4bb093ff267c1ba5ec03cf574a9c0e137828))
* deployed latest comptroller ([3599ed4](https://github.com/VenusProtocol/isolated-pools/commit/3599ed40c6c10f1f09df2d7288566eccb7c6e2a2))
* deployed reward distributors for mainnet and testnet ([2aedd92](https://github.com/VenusProtocol/isolated-pools/commit/2aedd92714a101d2ce8d255ab24051049d647ed3))
* fix deployment of comptroller and verification ([50d6edd](https://github.com/VenusProtocol/isolated-pools/commit/50d6edd8e6184407777eeb8fc281fe3862a7988c))
* fixed tests ([83c1c3b](https://github.com/VenusProtocol/isolated-pools/commit/83c1c3b5a52c383241373dce676bab4c3b9e3fb5))
* gas optimisation + correct state update in transferReserveForAuction ([5dc8120](https://github.com/VenusProtocol/isolated-pools/commit/5dc81207394f80b35a9923ef5d6ea4ee65073996))
* include reward token in event ([b5b1558](https://github.com/VenusProtocol/isolated-pools/commit/b5b1558ef375adde0892343e4caed0ad18b6a045))
* lint ([ba43cef](https://github.com/VenusProtocol/isolated-pools/commit/ba43cef02cbf28995d0b7834b365eb1e6b907ac6))
* lint issues ([2cc0f29](https://github.com/VenusProtocol/isolated-pools/commit/2cc0f29baebc822280a65257b1feae061c4d729e))
* redeployed HAY reward distributors ([5c62416](https://github.com/VenusProtocol/isolated-pools/commit/5c62416d2fa791be949c7d37b0490ca221a87e9d))
* revert on approval failures ([6c559f1](https://github.com/VenusProtocol/isolated-pools/commit/6c559f1b31bd3b9ab1e8ff4023353e54308f8210))
* set the last reward distributor deployed for HAY ([0955403](https://github.com/VenusProtocol/isolated-pools/commit/09554032ca5ed3b04db228d5359a2e4db2fa8fd3))
* update assetsReserves mapping for every swap ([3427b24](https://github.com/VenusProtocol/isolated-pools/commit/3427b24382f6a59d8c132701afe9c2bd0c62d881))
* update method signature in access control check ([e4820ff](https://github.com/VenusProtocol/isolated-pools/commit/e4820ff035e06c5d83caa1397b28dd3ca3cc64a5))
* ven-1817 pve003 ([f603afd](https://github.com/VenusProtocol/isolated-pools/commit/f603afd7071c495971690e39f1bc4d59eb4df964))


### Code Refactoring

* [RHR-01] make poolsAssetsReserves internal ([9085787](https://github.com/VenusProtocol/isolated-pools/commit/908578705a8ab2cb6058bca205a6af3083895c13))
* align the gap in reserve helpers ([c47d6c0](https://github.com/VenusProtocol/isolated-pools/commit/c47d6c076b5caac4f544f1c8a499056d5f7f7eca))

## [2.0.0-dev.9](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.8...v2.0.0-dev.9) (2023-09-01)


### Features

* make convertibleBaseAsset configurable ([d8d49de](https://github.com/VenusProtocol/isolated-pools/commit/d8d49de42c718fdeceb6bf31da5dc9265ccaf191))

## [2.0.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.7...v2.0.0-dev.8) (2023-08-31)


### Features

* add deployment info for the last rewards in the LSB pool ([5e8a082](https://github.com/VenusProtocol/isolated-pools/commit/5e8a08218984caed92fb6591f03c53648478f8ea))
* deploy HAY rewards distributor ([30325ea](https://github.com/VenusProtocol/isolated-pools/commit/30325ea4a680f2b81457ce7f72f857292ccf18bf))
* deployed SD Rewards distributor ([98b514d](https://github.com/VenusProtocol/isolated-pools/commit/98b514dc49b38c3a37eaf9a8d69081ffdd7d7516))


### Bug Fixes

* added SD rewards distributor ([ed4ed8a](https://github.com/VenusProtocol/isolated-pools/commit/ed4ed8a3a26620d06143cf9912889cb82bb35cd9))
* deployed latest comptroller ([3599ed4](https://github.com/VenusProtocol/isolated-pools/commit/3599ed40c6c10f1f09df2d7288566eccb7c6e2a2))
* deployed reward distributors for mainnet and testnet ([2aedd92](https://github.com/VenusProtocol/isolated-pools/commit/2aedd92714a101d2ce8d255ab24051049d647ed3))
* fix deployment of comptroller and verification ([50d6edd](https://github.com/VenusProtocol/isolated-pools/commit/50d6edd8e6184407777eeb8fc281fe3862a7988c))
* redeployed HAY reward distributors ([5c62416](https://github.com/VenusProtocol/isolated-pools/commit/5c62416d2fa791be949c7d37b0490ca221a87e9d))
* set the last reward distributor deployed for HAY ([0955403](https://github.com/VenusProtocol/isolated-pools/commit/09554032ca5ed3b04db228d5359a2e4db2fa8fd3))

## [2.0.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.6...v2.0.0-dev.7) (2023-08-24)

## [2.0.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.5...v2.0.0-dev.6) (2023-08-24)


### Bug Fixes

* fixed tests ([83c1c3b](https://github.com/VenusProtocol/isolated-pools/commit/83c1c3b5a52c383241373dce676bab4c3b9e3fb5))
* include reward token in event ([b5b1558](https://github.com/VenusProtocol/isolated-pools/commit/b5b1558ef375adde0892343e4caed0ad18b6a045))

## [2.0.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.4...v2.0.0-dev.5) (2023-08-18)


### Bug Fixes

* allow reward distributor with same reward token ([7603b4e](https://github.com/VenusProtocol/isolated-pools/commit/7603b4ed84040dd883aa3a8f411dd2d2d1fb4956))

## [2.0.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.3...v2.0.0-dev.4) (2023-08-16)


### ⚠ BREAKING CHANGES

* [RHR-01] make poolsAssetsReserves internal

### Bug Fixes

* [RFR-01][RFR-03] unify the meaning of minAmountToConvert ([db0e468](https://github.com/VenusProtocol/isolated-pools/commit/db0e468de1fc0f536e05d0a716b6572c60a28c53))
* [SSV-01] use _transferOutOrTrackDebt upon closing the auction ([5ca628c](https://github.com/VenusProtocol/isolated-pools/commit/5ca628c1a94abe654d8cc7461e0fe920898f808c))
* [VPB-04] fix potential re-entrancy issues ([42a9f78](https://github.com/VenusProtocol/isolated-pools/commit/42a9f78dbe59afa8477235f8a9be20bcacad6b7c))
* revert on approval failures ([6c559f1](https://github.com/VenusProtocol/isolated-pools/commit/6c559f1b31bd3b9ab1e8ff4023353e54308f8210))
* update method signature in access control check ([e4820ff](https://github.com/VenusProtocol/isolated-pools/commit/e4820ff035e06c5d83caa1397b28dd3ca3cc64a5))


### Code Refactoring

* [RHR-01] make poolsAssetsReserves internal ([9085787](https://github.com/VenusProtocol/isolated-pools/commit/908578705a8ab2cb6058bca205a6af3083895c13))

## [2.0.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.2...v2.0.0-dev.3) (2023-08-10)


### Bug Fixes

* lint issues ([2cc0f29](https://github.com/VenusProtocol/isolated-pools/commit/2cc0f29baebc822280a65257b1feae061c4d729e))
* ven-1817 pve003 ([f603afd](https://github.com/VenusProtocol/isolated-pools/commit/f603afd7071c495971690e39f1bc4d59eb4df964))

## [2.0.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v2.0.0-dev.1...v2.0.0-dev.2) (2023-08-09)


### Bug Fixes

* comments ([fecd4bb](https://github.com/VenusProtocol/isolated-pools/commit/fecd4bb093ff267c1ba5ec03cf574a9c0e137828))

## [2.0.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0-dev.6...v2.0.0-dev.1) (2023-08-01)


### ⚠ BREAKING CHANGES

* align the gap in reserve helpers

### Features

* set risk fund percentage to 50% ([4ff68c0](https://github.com/VenusProtocol/isolated-pools/commit/4ff68c088bf83fe029b76016399f1a5bf1733631))
* update base asset price before querying ([a2cb18a](https://github.com/VenusProtocol/isolated-pools/commit/a2cb18a74db663cb79890aa4d5891d840be32769))


### Code Refactoring

* align the gap in reserve helpers ([c47d6c0](https://github.com/VenusProtocol/isolated-pools/commit/c47d6c076b5caac4f544f1c8a499056d5f7f7eca))

## [1.3.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0-dev.5...v1.3.0-dev.6) (2023-07-28)


### Features

* add a balance check to graceful transfer ([03370b9](https://github.com/VenusProtocol/isolated-pools/commit/03370b97fa767fc763fad157bd08e6158e441fbb))
* avoid locking on failed transfers to previous bidders ([a689850](https://github.com/VenusProtocol/isolated-pools/commit/a6898500d17e41a8db4e3bdd03e5feaf1cae5a63))

## [1.3.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0-dev.4...v1.3.0-dev.5) (2023-07-28)


### Features

* support deadline in swapPoolsAssets ([103be13](https://github.com/VenusProtocol/isolated-pools/commit/103be136015e45d88086a8e001bf7f01cc767fff))

## [1.3.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0-dev.3...v1.3.0-dev.4) (2023-07-26)


### Features

* add mainnet deployment ([3b29e3e](https://github.com/VenusProtocol/isolated-pools/commit/3b29e3e591078cab0aaf868b4187f735fa9a61db))
* add testnet deployment of new market in DeFi pool ([8c9053f](https://github.com/VenusProtocol/isolated-pools/commit/8c9053f75a8f0f3c0bf082cdb75a01a44ef29ca3))
* export ankrBNB market deployment ([ec43dd8](https://github.com/VenusProtocol/isolated-pools/commit/ec43dd8d2efd2eece7494f143089a9506d40ad14))


### Bug Fixes

* lint ([ba43cef](https://github.com/VenusProtocol/isolated-pools/commit/ba43cef02cbf28995d0b7834b365eb1e6b907ac6))

## [1.3.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0-dev.2...v1.3.0-dev.3) (2023-07-24)


### Features

* upgrade HAY rewards distributor on bsctestnet ([12dceac](https://github.com/VenusProtocol/isolated-pools/commit/12dceac5746d38654539453ffbdcef2ec3a8efb0))

## [1.3.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v1.3.0-dev.1...v1.3.0-dev.2) (2023-07-20)


### Features

* ven-1743 Risk Fund ([7413501](https://github.com/VenusProtocol/isolated-pools/commit/7413501ac5210ff5e688d353f383aaf4e057a3c6))


### Bug Fixes

* gas optimisation + correct state update in transferReserveForAuction ([5dc8120](https://github.com/VenusProtocol/isolated-pools/commit/5dc81207394f80b35a9923ef5d6ea4ee65073996))
* update assetsReserves mapping for every swap ([3427b24](https://github.com/VenusProtocol/isolated-pools/commit/3427b24382f6a59d8c132701afe9c2bd0c62d881))

## [1.3.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v1.2.0...v1.3.0-dev.1) (2023-07-20)


### Features

* add re-entrancy guard ([80c7435](https://github.com/VenusProtocol/isolated-pools/commit/80c74352e317d33df17daa95943c85f7648a35b4))
* ven-1567 add sweep token function ([192a19d](https://github.com/VenusProtocol/isolated-pools/commit/192a19db17bef9e2f51c041b77abc6ff7077973e))

## [1.2.0](https://github.com/VenusProtocol/isolated-pools/compare/v1.1.0...v1.2.0) (2023-07-12)


### Features

* add mainnet deployments for rewards distributors ([3a3a8a2](https://github.com/VenusProtocol/isolated-pools/commit/3a3a8a28a6563117604980fea689b5e3203fea85))
* add reward configs ([a6cd456](https://github.com/VenusProtocol/isolated-pools/commit/a6cd456cd84de28d0adc2c69637c74a29cb5224f))
* add testnet deployment for rewards distributors ([5cf6ea3](https://github.com/VenusProtocol/isolated-pools/commit/5cf6ea34496c1f17be196a40706cf0da64b8dd38))
* added tests for pausing rewards ([4d8720f](https://github.com/VenusProtocol/isolated-pools/commit/4d8720f483bc76d7c1f39d69a6a2ff32118111d3))
* redeploy PoolLens on mainnet ([feaeddf](https://github.com/VenusProtocol/isolated-pools/commit/feaeddf0b9a28c876cb4ca81b6129bbd69e4e348))
* redeploy PoolLens on testnet ([ea5c204](https://github.com/VenusProtocol/isolated-pools/commit/ea5c20422274d6137591344c5259593ad99e4dd4))
* set/update last rewarding block ([13bdc7f](https://github.com/VenusProtocol/isolated-pools/commit/13bdc7f862929f8cc350f47e0ba922cd2edfe65f))
* stop rewards at a block number ([4b2ada4](https://github.com/VenusProtocol/isolated-pools/commit/4b2ada43e7de8375062036d3be7e71f4dd672fdd))


### Bug Fixes

* bump hardhat deploy ([84a8a62](https://github.com/VenusProtocol/isolated-pools/commit/84a8a62ee3d289562f82109486dcbac0492552bd))
* fixed tests ([1b173dc](https://github.com/VenusProtocol/isolated-pools/commit/1b173dc1b0a7232a02c174559535ae18c3801b9e))
* pause rewards in  pool lens ([9b0566b](https://github.com/VenusProtocol/isolated-pools/commit/9b0566b24a06fe22180a3752eea0ac8c127eb4d7))
* shorten the size of revert string ([e32ef5d](https://github.com/VenusProtocol/isolated-pools/commit/e32ef5dd249db156821b21984b46fd4c507de51e))
* use getBlockNumber() ([71a36e6](https://github.com/VenusProtocol/isolated-pools/commit/71a36e64cf1f32d81ba9bd728f230fe488b9190b))
* use hardhat 2.16.1 ([a5c01e7](https://github.com/VenusProtocol/isolated-pools/commit/a5c01e7d452d04b10dba7466be9e7d25f43cf01b))
* use node 18 ([97d704e](https://github.com/VenusProtocol/isolated-pools/commit/97d704e0042a3d535d6605a8791541f2b671cdf3))
* VEN-1684 and VEN-1685 ([c459065](https://github.com/VenusProtocol/isolated-pools/commit/c4590657669993c901e64a5fe9837faeef5017d0))
* VENUS-RD-001 ([b6413c5](https://github.com/VenusProtocol/isolated-pools/commit/b6413c5908e3b62a14b038bc78486f2a765d085a))
* VENUS-RD-002 ([1c1f749](https://github.com/VenusProtocol/isolated-pools/commit/1c1f7498d144702f61ec37f27011f60f1b955216))
* VENUS-RD-003 ([07fd8f3](https://github.com/VenusProtocol/isolated-pools/commit/07fd8f3af742b7fa04f201f6024291ca46ba6a71))

## [1.2.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v1.2.0-dev.3...v1.2.0-dev.4) (2023-07-12)


### Features

* add mainnet deployments for rewards distributors ([3a3a8a2](https://github.com/VenusProtocol/isolated-pools/commit/3a3a8a28a6563117604980fea689b5e3203fea85))
* add reward configs ([a6cd456](https://github.com/VenusProtocol/isolated-pools/commit/a6cd456cd84de28d0adc2c69637c74a29cb5224f))
* add testnet deployment for rewards distributors ([5cf6ea3](https://github.com/VenusProtocol/isolated-pools/commit/5cf6ea34496c1f17be196a40706cf0da64b8dd38))
* redeploy PoolLens on mainnet ([feaeddf](https://github.com/VenusProtocol/isolated-pools/commit/feaeddf0b9a28c876cb4ca81b6129bbd69e4e348))
* redeploy PoolLens on testnet ([ea5c204](https://github.com/VenusProtocol/isolated-pools/commit/ea5c20422274d6137591344c5259593ad99e4dd4))

## [1.2.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v1.2.0-dev.2...v1.2.0-dev.3) (2023-07-12)

## [1.2.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v1.2.0-dev.1...v1.2.0-dev.2) (2023-07-10)


### Bug Fixes

* use hardhat 2.16.1 ([a5c01e7](https://github.com/VenusProtocol/isolated-pools/commit/a5c01e7d452d04b10dba7466be9e7d25f43cf01b))
* use node 18 ([97d704e](https://github.com/VenusProtocol/isolated-pools/commit/97d704e0042a3d535d6605a8791541f2b671cdf3))

## [1.2.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v1.1.1-dev.1...v1.2.0-dev.1) (2023-07-10)


### Features

* added tests for pausing rewards ([4d8720f](https://github.com/VenusProtocol/isolated-pools/commit/4d8720f483bc76d7c1f39d69a6a2ff32118111d3))
* set/update last rewarding block ([13bdc7f](https://github.com/VenusProtocol/isolated-pools/commit/13bdc7f862929f8cc350f47e0ba922cd2edfe65f))
* stop rewards at a block number ([4b2ada4](https://github.com/VenusProtocol/isolated-pools/commit/4b2ada43e7de8375062036d3be7e71f4dd672fdd))


### Bug Fixes

* fixed tests ([1b173dc](https://github.com/VenusProtocol/isolated-pools/commit/1b173dc1b0a7232a02c174559535ae18c3801b9e))
* pause rewards in  pool lens ([9b0566b](https://github.com/VenusProtocol/isolated-pools/commit/9b0566b24a06fe22180a3752eea0ac8c127eb4d7))
* shorten the size of revert string ([e32ef5d](https://github.com/VenusProtocol/isolated-pools/commit/e32ef5dd249db156821b21984b46fd4c507de51e))
* use getBlockNumber() ([71a36e6](https://github.com/VenusProtocol/isolated-pools/commit/71a36e64cf1f32d81ba9bd728f230fe488b9190b))
* VEN-1684 and VEN-1685 ([c459065](https://github.com/VenusProtocol/isolated-pools/commit/c4590657669993c901e64a5fe9837faeef5017d0))
* VENUS-RD-001 ([b6413c5](https://github.com/VenusProtocol/isolated-pools/commit/b6413c5908e3b62a14b038bc78486f2a765d085a))
* VENUS-RD-002 ([1c1f749](https://github.com/VenusProtocol/isolated-pools/commit/1c1f7498d144702f61ec37f27011f60f1b955216))
* VENUS-RD-003 ([07fd8f3](https://github.com/VenusProtocol/isolated-pools/commit/07fd8f3af742b7fa04f201f6024291ca46ba6a71))

## [1.1.1-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v1.1.0...v1.1.1-dev.1) (2023-07-05)


### Bug Fixes

* bump hardhat deploy ([84a8a62](https://github.com/VenusProtocol/isolated-pools/commit/84a8a62ee3d289562f82109486dcbac0492552bd))

## [1.1.0](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0...v1.1.0) (2023-07-04)


### Features

* add SwapRouter mainnet deployments ([c878a83](https://github.com/VenusProtocol/isolated-pools/commit/c878a83a75e0666be431ca42c318573d53583d06))
* add SwapRouter testnet deployments ([44d39f0](https://github.com/VenusProtocol/isolated-pools/commit/44d39f0397ba9855849d7801b6f8b297f9bd2c95))
* deploy IL phase 2 to mainnet ([4ae7a5d](https://github.com/VenusProtocol/isolated-pools/commit/4ae7a5d2fb2a63598a64c71c6e22768d2913f4a6))
* deploy IL phase 2 to testnet ([f3cabed](https://github.com/VenusProtocol/isolated-pools/commit/f3cabeda9b5850ce09673fb332252379f4e7aa99))


### Bug Fixes

* fix swapped mainnet and testnet vBNB ([1b00e5b](https://github.com/VenusProtocol/isolated-pools/commit/1b00e5b6393f1251d7777d98605238e2bb9590e1))
* redeploy SwapRouters to mainnet with the correct vBNB address ([925b709](https://github.com/VenusProtocol/isolated-pools/commit/925b709090171b47afb4b63cc95d615cf7eb97c6))
* redeploy SwapRouters to testnet with the correct vBNB address ([c9ffe5d](https://github.com/VenusProtocol/isolated-pools/commit/c9ffe5d0150a2c214f17100fe7a266884624385a))

## [1.1.0-dev.1](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0...v1.1.0-dev.1) (2023-07-03)


### Features

* add SwapRouter mainnet deployments ([c878a83](https://github.com/VenusProtocol/isolated-pools/commit/c878a83a75e0666be431ca42c318573d53583d06))
* add SwapRouter testnet deployments ([44d39f0](https://github.com/VenusProtocol/isolated-pools/commit/44d39f0397ba9855849d7801b6f8b297f9bd2c95))
* deploy IL phase 2 to mainnet ([4ae7a5d](https://github.com/VenusProtocol/isolated-pools/commit/4ae7a5d2fb2a63598a64c71c6e22768d2913f4a6))
* deploy IL phase 2 to testnet ([f3cabed](https://github.com/VenusProtocol/isolated-pools/commit/f3cabeda9b5850ce09673fb332252379f4e7aa99))


### Bug Fixes

* fix swapped mainnet and testnet vBNB ([1b00e5b](https://github.com/VenusProtocol/isolated-pools/commit/1b00e5b6393f1251d7777d98605238e2bb9590e1))
* redeploy SwapRouters to mainnet with the correct vBNB address ([925b709](https://github.com/VenusProtocol/isolated-pools/commit/925b709090171b47afb4b63cc95d615cf7eb97c6))
* redeploy SwapRouters to testnet with the correct vBNB address ([c9ffe5d](https://github.com/VenusProtocol/isolated-pools/commit/c9ffe5d0150a2c214f17100fe7a266884624385a))

## 1.0.0 (2023-06-26)


### ⚠ BREAKING CHANGES

* remove unused contracts
* pre-deploy vTokens and rate models
* remove contract creation when adding new pool
* [N-07] use SNAKE_CASE for constants
* allow to specify vTokenReceiver when adding markets
* remove risk rating from PoolRegistry
* [VEN-1331][VPB-22] remove getPoolReserve
* remove reference to risk fund from pool registry
* remove riskFund from VToken initializer
* [007] replace Comptroller error reporter with custom errors
* make IL VToken interfaces compatible with core
* [007] use custom errors for authorization failures
* add old pool name to PoolNameSet event
* [012] add _disableInitializers to all upgradeable contracts
* [012] use _disableInitializers in Comptroller and VToken
* [024] use Ownable2Step instead of single-step Ownable
* replace a custom WithAdmin with Ownable2StepUpgradeable
* [013] change RewardDistributor function naming
* [013] change Comptroller function naming and access controls
* [013] change VToken function naming and returns
* consolidate VToken contracts
* replace Unitroller with a transparent proxy

### Features

* [007] replace Comptroller error reporter with custom errors ([21a8a7d](https://github.com/VenusProtocol/isolated-pools/commit/21a8a7d490dad35c8e9459994684e86c44efda5a))
* [007] use custom errors for authorization failures ([9dca17e](https://github.com/VenusProtocol/isolated-pools/commit/9dca17e4903bf859741284c2ce0b172f09548cd5))
* [024] use Ownable2Step instead of single-step Ownable ([747a5de](https://github.com/VenusProtocol/isolated-pools/commit/747a5def6deea69fd7f0d72efce870fa24bcd39c))
* [N-25] add indexes to events ([513fbe4](https://github.com/VenusProtocol/isolated-pools/commit/513fbe484ac46060814ec5fdcb8e92d90f7fe8ff))
* [VEN-953] add ACM check to setCloseFactor ([d8494f7](https://github.com/VenusProtocol/isolated-pools/commit/d8494f77484ae45e1ce16b94d026240c0dd4c5a8))
* [VEN-953] add ACM check to setMinAmountToConvert ([c75580a](https://github.com/VenusProtocol/isolated-pools/commit/c75580aa84a0ffa51a20c324b2e16c354d54ddaf))
* [VEN-953] add ACM check to setRewardTokenSpeeds ([6f0cc0e](https://github.com/VenusProtocol/isolated-pools/commit/6f0cc0e68f82b463792166f94bfbc75138a04203))
* [VEN-953] add ACM to PoolRegistry ([307f1a9](https://github.com/VenusProtocol/isolated-pools/commit/307f1a96dc5cb3a8d9acc62e79bbf9cc9a6affbf))
* [VEN-953] add ACM to RewardsDistributor ([407139e](https://github.com/VenusProtocol/isolated-pools/commit/407139ecf7cd4eaf2ae3c246151ea19aaa76302f))
* [VEN-953] add ACM to Shortfall ([a113526](https://github.com/VenusProtocol/isolated-pools/commit/a113526a8d634de5aea1ae658d3818f63b940923))
* [VEN-953] make (re)starting an auction access-controlled ([6d37880](https://github.com/VenusProtocol/isolated-pools/commit/6d378800d65e58ef576d940ea02964bf68e70c37))
* [VEN-953] make pool config access-controlled ([5d79a75](https://github.com/VenusProtocol/isolated-pools/commit/5d79a755414b37d31363b97c4901e50449b02a04))
* [VEN-953] replace owner with ACM in JumpRateModel ([37808f4](https://github.com/VenusProtocol/isolated-pools/commit/37808f4b1d7f6634d37c1a939b2afb03d34e6e40))
* add ability to pause auctions ([c12a6da](https://github.com/VenusProtocol/isolated-pools/commit/c12a6da15b4fe582f5486e86413d12c01bfb1171))
* add AccessControlled mixin ([abfd5b8](https://github.com/VenusProtocol/isolated-pools/commit/abfd5b8d88d1989e51ff04e4b3d95c53399aabbd))
* add bscmainnet deployment ([f71a9c8](https://github.com/VenusProtocol/isolated-pools/commit/f71a9c8b219d65c479f43144854f54d1142d5e25))
* add event for new rewards distributor ([2b34cd4](https://github.com/VenusProtocol/isolated-pools/commit/2b34cd4f4c55166d2010eb7cb302da757a67f472))
* add geater and mapping for controller, pool ([9ab0a5e](https://github.com/VenusProtocol/isolated-pools/commit/9ab0a5edea51637ed883484b344465493eb223c9))
* add getBorrowingPower function giving account liquidity with respect to liq threshold and also cahnged getAccountLiquidity to give liquidity information with respect to liquidation threshold ([57aed20](https://github.com/VenusProtocol/isolated-pools/commit/57aed200cbe34dcb390932a54c70f856d8e7bd65))
* add getPoolBadDebt to PoolLens ([0dda9a8](https://github.com/VenusProtocol/isolated-pools/commit/0dda9a8474ea16a1d8fa157ff362648502d415cd))
* add old pool name to PoolNameSet event ([d7ad187](https://github.com/VenusProtocol/isolated-pools/commit/d7ad18793cb2b9068202f5f405134b0d7167dd74))
* add reward speed by market view ([5b639f9](https://github.com/VenusProtocol/isolated-pools/commit/5b639f975482de13b593f3f821d76080d008a0b3))
* add reward totals to events ([3a53dc1](https://github.com/VenusProtocol/isolated-pools/commit/3a53dc195bba4989dee15fcb953fd8ba0ea0227c))
* add semantic relese ([994a0b5](https://github.com/VenusProtocol/isolated-pools/commit/994a0b592ff6ce524fc47813110ec04da2a28fa6))
* add supply and borrow caps to lens ([bf18630](https://github.com/VenusProtocol/isolated-pools/commit/bf18630cb122fba11f9d7b0d5e50b59660eec546))
* add SwapRouter_Stablecoins deployment ([075f976](https://github.com/VenusProtocol/isolated-pools/commit/075f976da2f28395b35ddc60d889d2ce74366968))
* add testnet deployment ([55d3cd5](https://github.com/VenusProtocol/isolated-pools/commit/55d3cd520c3081e61eb37e38d78dd326da0b22e9))
* added balanceAfter memory variable to avoid reading from storage ([c29e229](https://github.com/VenusProtocol/isolated-pools/commit/c29e229f43898e1377dbb0a9c73b4261246b1db0))
* allow to specify vTokenReceiver when adding markets ([4560b04](https://github.com/VenusProtocol/isolated-pools/commit/4560b04daa24487a5464d58bb854662b9b172491))
* basic unchecked flags ([3bb2e54](https://github.com/VenusProtocol/isolated-pools/commit/3bb2e54e1fa23f3dae09cbc49c5404e65004128a))
* bundle typechain typings into the package ([450d647](https://github.com/VenusProtocol/isolated-pools/commit/450d647207df71881099932f39d38a6ec4ea334a))
* decouple IL deployment from funds deployment ([0fc3a6c](https://github.com/VenusProtocol/isolated-pools/commit/0fc3a6cf1ce9f6bb7ce56d12baed8e57015f9ad9))
* **deployment:** add new complete IL testnet deployment ([17d4883](https://github.com/VenusProtocol/isolated-pools/commit/17d4883825eeca3884170237c44018dc6575d17a))
* emit BadDebtRecovered event ([7fbe7fc](https://github.com/VenusProtocol/isolated-pools/commit/7fbe7fc805eb1446eca284c710437d692654535d))
* gas optimization in getter, improve redablity ([176008d](https://github.com/VenusProtocol/isolated-pools/commit/176008d628eb4c6a868b03275ee99055b14378b1))
* in addMarket ensure the pool is registered ([15a0262](https://github.com/VenusProtocol/isolated-pools/commit/15a0262ad654660fe92994747aa254d0f941ee9e))
* License added ([12a49d0](https://github.com/VenusProtocol/isolated-pools/commit/12a49d07bbbdf7160053871385d3473d4ea43e8c))
* make incentiveBps configurable ([e5fd812](https://github.com/VenusProtocol/isolated-pools/commit/e5fd8121f96680b5b45d3ee32c0e2a697b84ca8d))
* make nextBidderBlockLimit configurable ([396d755](https://github.com/VenusProtocol/isolated-pools/commit/396d75537da29c8da0e40755092ef154aeab0d53))
* make PoolRegistry state public ([31ff4e0](https://github.com/VenusProtocol/isolated-pools/commit/31ff4e0ed592395351a25c68f4385b77cfc7af90))
* make protocol seize share configurable ([9ae3208](https://github.com/VenusProtocol/isolated-pools/commit/9ae3208ab62a7283a435aa2b2b20a152964c046f))
* make Shortfall and ProtocolShareReserve configurable ([6f01a11](https://github.com/VenusProtocol/isolated-pools/commit/6f01a112e84a0ba5ff4c8268dd984ae5aa20ff22))
* Mint and Redeem events emit the updated account balance ([1ec4989](https://github.com/VenusProtocol/isolated-pools/commit/1ec498911820017b599b389b3508d5c5b89dcce1))
* move admin logic to a mixin ([8812422](https://github.com/VenusProtocol/isolated-pools/commit/8812422560fecf7275470824295ac86118e85f05))
* pre-deploy vTokens and rate models ([15b2099](https://github.com/VenusProtocol/isolated-pools/commit/15b20999855eae9a8cdc5fd8ee9ae3acf5ab2825))
* remove contract creation when adding new pool ([3cb0301](https://github.com/VenusProtocol/isolated-pools/commit/3cb0301cd833aceb4de41e5dd655d57a8eded9cb))
* remove reference to risk fund from pool registry ([e43428d](https://github.com/VenusProtocol/isolated-pools/commit/e43428d876745c6cad7ca305eaaca9ba34d5fca8))
* remove risk rating from PoolRegistry ([4542641](https://github.com/VenusProtocol/isolated-pools/commit/45426416ed22b18640beb661f12cb68ca7f1b3bd))
* remove riskFund from VToken initializer ([9b9c44b](https://github.com/VenusProtocol/isolated-pools/commit/9b9c44b37be52afa631a8411057176870cd79088))
* replace a custom WithAdmin with Ownable2StepUpgradeable ([281d7bb](https://github.com/VenusProtocol/isolated-pools/commit/281d7bb3646f8f4a824da269b3309439fd85f553))
* replace Unitroller with a transparent proxy ([b273492](https://github.com/VenusProtocol/isolated-pools/commit/b2734926954edb8dd60690535638d0a2e31358bc))
* Risk fund management ([#26](https://github.com/VenusProtocol/isolated-pools/issues/26)) ([5d66109](https://github.com/VenusProtocol/isolated-pools/commit/5d661091d45cc86b9cc4a3202be4dee346ae041a))
* support deflationary tokens in addMarket ([d472822](https://github.com/VenusProtocol/isolated-pools/commit/d472822604d44de9d2dac7ea14c15b82c7041ef9))
* upgrade oz to ^4.8.0 to support Ownable2StepUpgradeable ([0c245c7](https://github.com/VenusProtocol/isolated-pools/commit/0c245c7e6e1b0119e6e2bdf1b786633caee995b8))
* use core pool behavior for jump rate multiplier ([c75cfe4](https://github.com/VenusProtocol/isolated-pools/commit/c75cfe476091c0629266b2755c93d2d42d7802b8))
* use of governance-contracts dependency ([95eb6ca](https://github.com/VenusProtocol/isolated-pools/commit/95eb6ca1db165e71169dcdef86e913cc5f67d94a))
* ven-1559 ([52fd123](https://github.com/VenusProtocol/isolated-pools/commit/52fd123081999942f76bcc46c99a93a479b7fe18))
* ven-1560 ([3546f67](https://github.com/VenusProtocol/isolated-pools/commit/3546f672a00b9904da74ae9fc7644b138d7b3a03))

## [1.0.0-dev.19](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.18...v1.0.0-dev.19) (2023-07-03)


### Features

* add SwapRouter mainnet deployments ([c878a83](https://github.com/VenusProtocol/isolated-pools/commit/c878a83a75e0666be431ca42c318573d53583d06))
* add SwapRouter testnet deployments ([44d39f0](https://github.com/VenusProtocol/isolated-pools/commit/44d39f0397ba9855849d7801b6f8b297f9bd2c95))
* deploy IL phase 2 to mainnet ([4ae7a5d](https://github.com/VenusProtocol/isolated-pools/commit/4ae7a5d2fb2a63598a64c71c6e22768d2913f4a6))
* deploy IL phase 2 to testnet ([f3cabed](https://github.com/VenusProtocol/isolated-pools/commit/f3cabeda9b5850ce09673fb332252379f4e7aa99))

### Bug Fixes

* [002] use address(0) instead of DEFAULT_ADMIN_ROLE ([8d531d8](https://github.com/VenusProtocol/isolated-pools/commit/8d531d8b4d7afae061180a59776f391e67aa4a0d))
* [005] use safeTransfer instead of transfer ([c059e6b](https://github.com/VenusProtocol/isolated-pools/commit/c059e6b13215b3dd0f029aa3750996ca7e90c86e))
* [008] emit events on state changes ([ddc27c9](https://github.com/VenusProtocol/isolated-pools/commit/ddc27c90d7803eaebf5e5f9252d2879f1b5bcf8c))
* [009] lock pragma in non-interface contracts ([20bcfa2](https://github.com/VenusProtocol/isolated-pools/commit/20bcfa29fc396d63caa37e532aa504a41f9bb7b3))
* [011] remove bookmarks from chain ([b62928b](https://github.com/VenusProtocol/isolated-pools/commit/b62928b83ddcfbac054080ba5f52382e0de195b3))
* [012] add _disableInitializers to all upgradeable contracts ([afd9fea](https://github.com/VenusProtocol/isolated-pools/commit/afd9feadf0b8fd7c6c76d1b7dcfb2bd34ada5614))
* [012] use _disableInitializers in Comptroller and VToken ([1952261](https://github.com/VenusProtocol/isolated-pools/commit/1952261582a22e8b5db0b0d104214efc210244e1))
* [013] change Comptroller function naming and access controls ([26f91b8](https://github.com/VenusProtocol/isolated-pools/commit/26f91b89c0070dc8e2ae9275f13f74fde02d2fc2))
* [013] change RewardDistributor function naming ([eca7741](https://github.com/VenusProtocol/isolated-pools/commit/eca77413dc0be33c034ef9fdf1decb3b726eebd1))
* [013] change VToken function naming and returns ([cd2b639](https://github.com/VenusProtocol/isolated-pools/commit/cd2b639e300a1040301143e686dc7c0bf89bb569))
* [017] approve zero before approving nonzero amount ([f034973](https://github.com/VenusProtocol/isolated-pools/commit/f034973de548408d17132011e139b658931bb613))
* [020] only allow owner to set pool name ([a8353ed](https://github.com/VenusProtocol/isolated-pools/commit/a8353ed9b5c4c8e092aaa511671adcdd198890fc))
* [966] second part remaining function ([39a1a17](https://github.com/VenusProtocol/isolated-pools/commit/39a1a17c0af2d0c15fc83fb7c88d8a346e450f41))
* [imp004] cache array lengths in for loops ([1c6489b](https://github.com/VenusProtocol/isolated-pools/commit/1c6489b4da60b9c9403139ee9b6c1eb412bf7d19))
* [imp005] add indexes to event parameters ([4747081](https://github.com/VenusProtocol/isolated-pools/commit/4747081e7a38b497ab7cca06cb39c88a47385876))
* [imp006] avoid initializing to zero ([3227ebf](https://github.com/VenusProtocol/isolated-pools/commit/3227ebf8250466c8ce4105acabc8e7ccc1ed910e))
* [VEN-1042]:L10. Variable Shadowing ([0e53c7f](https://github.com/VenusProtocol/isolated-pools/commit/0e53c7f1846326d392d825e06d51c1f34ce4d7c2))
* [VEN-1333][SSP-01] disallow new bids for stale auctions ([06e8ca2](https://github.com/VenusProtocol/isolated-pools/commit/06e8ca20d279dc1e6233580b274c630b9ed85c79))
* [VEN-1338][VPB-21] disallow too long names for pools ([92de902](https://github.com/VenusProtocol/isolated-pools/commit/92de9024282fc783e7d0ea1445fb2657e3252de7))
* [VEN-1338][VPB-21] transfer initial supply from the market creator ([fa4ffcc](https://github.com/VenusProtocol/isolated-pools/commit/fa4ffcc3e08562a0c385231032e8ab840f9a1e84))
* [VEN-1495] ([f9a83c9](https://github.com/VenusProtocol/isolated-pools/commit/f9a83c9b016d525bc390bf189f7f64adb633a19c))
* [VEN-1496] ([eb6a31a](https://github.com/VenusProtocol/isolated-pools/commit/eb6a31a1b3a3dd36dc8b4cd6f7c50cc053b51d78))
* [VEN-949] CVP-01 fix sign in liquidation threshold check ([934e7fd](https://github.com/VenusProtocol/isolated-pools/commit/934e7fd050814280cb8ac603e16447d10656d087))
* [VEN-975] CVP-04 check for shortfall in heal and batch liquidate ([1c8cc30](https://github.com/VenusProtocol/isolated-pools/commit/1c8cc30e72686c525b2f68ec5e2b493f1405823c))
* add access control to swap pool asset ([13cc23e](https://github.com/VenusProtocol/isolated-pools/commit/13cc23e88d2b1e46fc13d3064ea2123ba6d6395e))
* add copy_contracts to files array ([65ac9fb](https://github.com/VenusProtocol/isolated-pools/commit/65ac9fb5413472f921ee365d1cf182a07daa895d))
* add missing contract types in deployments ([26767c4](https://github.com/VenusProtocol/isolated-pools/commit/26767c488fad86b0e01eb0757cc52110b326740a))
* allow setting _setMinLiquidatableCollateral ([7bd15e4](https://github.com/VenusProtocol/isolated-pools/commit/7bd15e4a1c78702c46acc7c7bb59dbd4ea1dc6d2))
* blocker for deployment of upgradable script ([12648ee](https://github.com/VenusProtocol/isolated-pools/commit/12648eeeaf1ece2714cd3ae26c7e5df7a5c5cf84))
* calculate values dynamically in tests ([8dea24c](https://github.com/VenusProtocol/isolated-pools/commit/8dea24c308fe1a8dbc538929977f68c2d4d6cf2e))
* check the right loop lengths in enterMarkets and addRewardDistributor ([da284b4](https://github.com/VenusProtocol/isolated-pools/commit/da284b4a01828ea1ae4c13b207ba7d2e73ceec0b))
* compiler warning ([ad901ee](https://github.com/VenusProtocol/isolated-pools/commit/ad901eef898d7dea609ad4ca17a3b0544c0d58fb))
* conflicts ([a04fe14](https://github.com/VenusProtocol/isolated-pools/commit/a04fe14aa62bdd934cbc0d97047f5f285a73e053))
* **dependencies:** bump Oracle package version ([d07183a](https://github.com/VenusProtocol/isolated-pools/commit/d07183aa92371430ea43c12edb02c1fdb40de69a))
* deploy command ([75bd7a1](https://github.com/VenusProtocol/isolated-pools/commit/75bd7a1945525217117032fda60fe425346cfd7a))
* deployer can set caps ([9876266](https://github.com/VenusProtocol/isolated-pools/commit/987626637eda6e48d416eb8301ed76208442b50b))
* **deployment:** use legacy ACM in live networks ([1ed9647](https://github.com/VenusProtocol/isolated-pools/commit/1ed9647be7f290f8b8d1dcc07bc272d7fb1fa18c))
* deploytment scripts for integration tests ([562d965](https://github.com/VenusProtocol/isolated-pools/commit/562d965e52d27ca5bb034051b38386e489638d44))
* disable yul optimization in ci ([10da2d6](https://github.com/VenusProtocol/isolated-pools/commit/10da2d6b5a94d9e74a5ed8c5b2545620c0e79355))
* fix ACM version ([bf84eb1](https://github.com/VenusProtocol/isolated-pools/commit/bf84eb1c3f6568d6fa989faf41666651cd91c3b6))
* fix after VToken refatoring ([831af56](https://github.com/VenusProtocol/isolated-pools/commit/831af56b713e6aeaa5366d89055a9459b151f569))
* fix capitalization of lens test dir ([db6e931](https://github.com/VenusProtocol/isolated-pools/commit/db6e9317aef4e158841648c6d4d7fcd768a27db8))
* fix protocolSeizeTokens calculations ([d32f5a3](https://github.com/VenusProtocol/isolated-pools/commit/d32f5a3aba1b573e25e392e9ab4cc3f0a000cc4b))
* fix test commands ([ccf2f7d](https://github.com/VenusProtocol/isolated-pools/commit/ccf2f7d0c5e43cc9497f3563e1e56db2787a7f0f))
* fix typescript build errors ([be02c22](https://github.com/VenusProtocol/isolated-pools/commit/be02c22add731ae5aaca2981502c90493d069d9d))
* fixed integration test ([5fbdcc0](https://github.com/VenusProtocol/isolated-pools/commit/5fbdcc09a2535657b10e1d5a037e604494bbf161))
* fixed JumpRateModelV2 tests ([e0410f3](https://github.com/VenusProtocol/isolated-pools/commit/e0410f3fd66fd9522788d324328948c9b525eba6))
* implement stricter validation for the bidbps ([61e1890](https://github.com/VenusProtocol/isolated-pools/commit/61e189076d89e75d6d19b5a79ee3d3ee77d1b526))
* imports ([15c303e](https://github.com/VenusProtocol/isolated-pools/commit/15c303ea7bb9c5740f2574438b7d2ede8ad4c175))
* include copy contracts in package ([b4c1ca0](https://github.com/VenusProtocol/isolated-pools/commit/b4c1ca088ea69647d2d06cd8d9e86c0ab160907e))
* integration test and refactoring ([51b23df](https://github.com/VenusProtocol/isolated-pools/commit/51b23dff6b6e77588071b003685c9e5b54cadca7))
* **lens:** [VEN-1328][PLV-01] fix pending reward computation ([8f45885](https://github.com/VenusProtocol/isolated-pools/commit/8f45885a322ebda9ee2e1204691d1d6500df1271))
* lint ([a850761](https://github.com/VenusProtocol/isolated-pools/commit/a8507619d105e022f153ca278a7b91859c61e4fa))
* lint issues. ([c925fec](https://github.com/VenusProtocol/isolated-pools/commit/c925fec45c3f8d3992ef0b33e364ba19db04334a))
* make IL VToken interfaces compatible with core ([fec3a2d](https://github.com/VenusProtocol/isolated-pools/commit/fec3a2d2fb0f1cbc09c42528355c8b873963704a))
* Minor fix ([6156cea](https://github.com/VenusProtocol/isolated-pools/commit/6156cea8b58fb12223331697cdac0a8eee543910))
* minor issue in PVE004-3 test ([9a61c2f](https://github.com/VenusProtocol/isolated-pools/commit/9a61c2f397ca48a8627e268d0b690d408f866b2a))
* minor wording issue ([a849e40](https://github.com/VenusProtocol/isolated-pools/commit/a849e40d86c5a4d388419bc29f410c0300676524))
* Note(1) 1,3 ([fab692c](https://github.com/VenusProtocol/isolated-pools/commit/fab692c8fe2aa9c1f3bc06865b56a11d1d8f13dd))
* Note(2)-1,3,4,5 ([028ec30](https://github.com/VenusProtocol/isolated-pools/commit/028ec304d420b86bcfa92271bab4a79f357b866b))
* Note(4) ([bc696f3](https://github.com/VenusProtocol/isolated-pools/commit/bc696f3a97fb51ac74e3a61f5a09a79abaededcd))
* overflow for expScale ([e74d64e](https://github.com/VenusProtocol/isolated-pools/commit/e74d64edb29f7f46319dba4dc5a6f9fffe1ac249))
* owner governace check ([059d9a5](https://github.com/VenusProtocol/isolated-pools/commit/059d9a5fc00557d7dcab289e1d1bc1a077b73ae1))
* place bid method. ([3b4ce93](https://github.com/VenusProtocol/isolated-pools/commit/3b4ce931105dedf6c9e4bb339209b077eb51d2ab))
* poolmetadata spelling ([1b27b33](https://github.com/VenusProtocol/isolated-pools/commit/1b27b338c253692943b67770ec62791c17a80bf3))
* pr comment ([cf868ef](https://github.com/VenusProtocol/isolated-pools/commit/cf868efd80c19191e0d396413e438f2604716b73))
* pr comments ([4651fb2](https://github.com/VenusProtocol/isolated-pools/commit/4651fb2039bb0f5ad7bc667b2269087b10f7b6f0))
* PR comments. ([422b002](https://github.com/VenusProtocol/isolated-pools/commit/422b0029127edf5fe1a3295553f928ca41d77213))
* PR comments. ([3a5c40b](https://github.com/VenusProtocol/isolated-pools/commit/3a5c40bc91ff341e05a80fd74032ddfa85203bea))
* prevent _ensureMaxLoops revert during liquidation ([#237](https://github.com/VenusProtocol/isolated-pools/issues/237)) ([6519349](https://github.com/VenusProtocol/isolated-pools/commit/651934903c288f28abaf35cf8765bc0b9b8b8805))
* prevent decimals underflow in exchange rate computation ([9520b88](https://github.com/VenusProtocol/isolated-pools/commit/9520b8854cac05cc6cc5615e8ec93b942986c1d5))
* Protocol share reserve for each market. ([958bfc5](https://github.com/VenusProtocol/isolated-pools/commit/958bfc533d62eb50a4db4b15622212d9321028ed))
* PVE001 ([75d02da](https://github.com/VenusProtocol/isolated-pools/commit/75d02da1a1ea81514718b2e64724d6ea47a16cbb))
* PVE003 ([4e9070f](https://github.com/VenusProtocol/isolated-pools/commit/4e9070fabeac52d03f99fe3164a64eee208ec9fc))
* PVE004-3 ([b4cc242](https://github.com/VenusProtocol/isolated-pools/commit/b4cc242f4ff172696fbe1e2626faf60c4640d5aa))
* PVE005 ([f4129a4](https://github.com/VenusProtocol/isolated-pools/commit/f4129a4ab328489c89b3359019b972d47b004748))
* PVE006 ([c178a69](https://github.com/VenusProtocol/isolated-pools/commit/c178a69739a2b2fcdbf9939c05d3a10a15bacedc))
* PVE009 ([d102243](https://github.com/VenusProtocol/isolated-pools/commit/d10224372fc9ec0120b26a093550ed384854e3f6))
* PVE010 ([f88230d](https://github.com/VenusProtocol/isolated-pools/commit/f88230d5e8816e5d5c66bcad96e36374f74f4b9c))
* remove .DS_Store that got committed ([3c9279b](https://github.com/VenusProtocol/isolated-pools/commit/3c9279bba44fac887c8a9d88df95985505e506b1))
* remove dependency on typechain from deployments ([e6e309a](https://github.com/VenusProtocol/isolated-pools/commit/e6e309a5c5e1e8a0a76db52ccf49879f30b721e4))
* remove PriceOracle infavor of interface from oracle package ([c002263](https://github.com/VenusProtocol/isolated-pools/commit/c00226369987827234345fe2292da2c3fc3124c7))
* remove PriceOracle infavor of interface from oracle package ([5d7556f](https://github.com/VenusProtocol/isolated-pools/commit/5d7556f422f86f667e3cf8bc86ea02cf3c49f7ab))
* remove PriceOracle infavor of interface from oracle package ([7cb7705](https://github.com/VenusProtocol/isolated-pools/commit/7cb7705887962784a10a1dca5ac7fec5b6ff0996))
* remove typechain imports from deploy files ([df989d8](https://github.com/VenusProtocol/isolated-pools/commit/df989d81eea36dab85fc2f14cd9bb7c14b2ee788))
* remove unused ActionPaused event ([4b1afc3](https://github.com/VenusProtocol/isolated-pools/commit/4b1afc3a972168daf2cda41e48daff56185c5df5))
* remove unused function to track bad debt ([ad5406d](https://github.com/VenusProtocol/isolated-pools/commit/ad5406d388be12f842b8b9fff5ad91f1f35bbec7))
* replace PriceOracle with ResilientOracleInterface ([7fb1b65](https://github.com/VenusProtocol/isolated-pools/commit/7fb1b6587330cd5928c97f7f744f703cdec516ff))
* replaced pool address for fork tests ([58a9e69](https://github.com/VenusProtocol/isolated-pools/commit/58a9e690a70ba34075b1ccc9f9d354d23636e59f))
* resolve comments ([3fd29da](https://github.com/VenusProtocol/isolated-pools/commit/3fd29dac299b786124541ac84b70cda1266cdd6a))
* resolved typos and comments ([8d119ad](https://github.com/VenusProtocol/isolated-pools/commit/8d119ad8ca295b7bf7bbbd5969248b1a360b6c34))
* set transferReserveForAuction to only be callable by shortfall ([bc42657](https://github.com/VenusProtocol/isolated-pools/commit/bc42657d7e4680e07aa86dcca828c0e75f23fd62))
* shortfall test ([8656341](https://github.com/VenusProtocol/isolated-pools/commit/86563416822f9ccf8c9a17ff3dfc449faf2b2bf5))
* shortfall tests ([492f604](https://github.com/VenusProtocol/isolated-pools/commit/492f60496d8d9c38be3e377cb4816a2e6390227b))
* specify assets and min amount out when swapping ([b2acc1b](https://github.com/VenusProtocol/isolated-pools/commit/b2acc1b25b458731d7cbbc3acb7866ac6404704c))
* supply cap implementation ([f025840](https://github.com/VenusProtocol/isolated-pools/commit/f02584039035b58379b78eb244f90bfbeb00b757))
* typechain issues ([97bff0b](https://github.com/VenusProtocol/isolated-pools/commit/97bff0b191dbdb8efa096c2235f2dcd3cc997815))
* update deployment scripts comptroller updates ([40ca904](https://github.com/VenusProtocol/isolated-pools/commit/40ca9042e2b822491fd0d39bf72a54d9764ed736))
* update deployment scripts per oracle updates ([529c9d1](https://github.com/VenusProtocol/isolated-pools/commit/529c9d1fa6f1ab654541daaa46ae3a7ccb15b9a0))
* update deployment scripts per oracle updates ([c22f9b6](https://github.com/VenusProtocol/isolated-pools/commit/c22f9b636dd2ed651f36e81c993624910f315988))
* update import path for new oracle package ([984cc41](https://github.com/VenusProtocol/isolated-pools/commit/984cc411de61b688cda00e7941959721b810e101))
* update release and fix integration tests ([7591e24](https://github.com/VenusProtocol/isolated-pools/commit/7591e24afe5f3d613013033bb48ab685e5bcbe37))
* use MockPriceOracle in hardhat tests ([0362943](https://github.com/VenusProtocol/isolated-pools/commit/0362943b44f3286b1dd66e9937c57627aa40d452))
* use two-step approval for initial supply ([f0500ae](https://github.com/VenusProtocol/isolated-pools/commit/f0500aec904cbdfa90393927971062ef2e923c9e))
* use updated price oracle script that supports mocks in nonlive envs ([3f6b5ad](https://github.com/VenusProtocol/isolated-pools/commit/3f6b5ad42a18bad0693cd05f2c29e920ffc4a6cc))
* VEN-1487 ([9d200e7](https://github.com/VenusProtocol/isolated-pools/commit/9d200e7aec13cdb703d280a655aabf5d7b30c9b7))
* VEN-1488 ([b6e0b93](https://github.com/VenusProtocol/isolated-pools/commit/b6e0b934d2a99d9acd368c2e96b18be8742f2f47))
* ven-1494 ([f46d889](https://github.com/VenusProtocol/isolated-pools/commit/f46d889200c8439229c7b598aa009d0ec290952b))
* ven-1500 check for auction start block ([d8ff98a](https://github.com/VenusProtocol/isolated-pools/commit/d8ff98a404506f53f05a201b6aacdaa5d1b79b39))
* ven-1510 NC-03 ([4043673](https://github.com/VenusProtocol/isolated-pools/commit/4043673d5c33f1ab7c01712c64c6687b1fbdc5e0))
* ven-1587 ([f2977e0](https://github.com/VenusProtocol/isolated-pools/commit/f2977e0b033104055ed758e38d57bcca189b640e))
* ven-1589 ([22b1243](https://github.com/VenusProtocol/isolated-pools/commit/22b124317d8f7313c9135baf0a01f2e20718054f))
* ven-1590 ([108aa56](https://github.com/VenusProtocol/isolated-pools/commit/108aa561f07115b8a571bfba92c89f6055b675c7))
* VPB-19 | Atypical Constructor Implementation ([422ac6d](https://github.com/VenusProtocol/isolated-pools/commit/422ac6df9b3183ee99c64194f20e1e90e9121b7b))


### Performance Improvements

* (related to G-03) avoid copying struct to memory ([2eab77b](https://github.com/VenusProtocol/isolated-pools/commit/2eab77bd0bea5df7c540a718ea83391db12fa1b5))
* [G-04] cache storage vars on stack where it makes sense ([f41f5fd](https://github.com/VenusProtocol/isolated-pools/commit/f41f5fd54140c5481ecf180449aac07a1d67cdba))
* [G-05] cache mapping/array members in storage vars ([b86ce6c](https://github.com/VenusProtocol/isolated-pools/commit/b86ce6cd51b105d82aaed3ba16265f2c4307349d))
* [G-06] cache the result of vToken.underlying() ([8482abb](https://github.com/VenusProtocol/isolated-pools/commit/8482abb47559c2edc5153030dc388a03e9239bd7))
* [G-08] use unchecked where applicable ([fe1aeb1](https://github.com/VenusProtocol/isolated-pools/commit/fe1aeb1c00049c4bce85e17bcb1f745e0e969970))
* [G-14] save 3 gas on >= instead of > ([0709639](https://github.com/VenusProtocol/isolated-pools/commit/07096394847a7a8425f1e4f5ea3ee41e8f7d9754))
* [G‑16] use pre-increment instead of post-increment ([a014c48](https://github.com/VenusProtocol/isolated-pools/commit/a014c4832065569ef9c1e2a845776acdb63f5aa9))
* [N-14] use external instead of public where applicable ([9131384](https://github.com/VenusProtocol/isolated-pools/commit/9131384ccdf5cad12a36a28e538a2a08172f11a2))
* [VEN-1332][WPM-01] make wp rate model params immutable ([13b081f](https://github.com/VenusProtocol/isolated-pools/commit/13b081f69a17fb3ac00f6493e7e02f2c1b8a6bae))
* add utils helper for fork test ([8295332](https://github.com/VenusProtocol/isolated-pools/commit/8295332ca9ca18041e5a6af6f1a48319d202a7ea))
* use calldata instead of memory ([976cf49](https://github.com/VenusProtocol/isolated-pools/commit/976cf49b194edc988c31fb42d07bd2b7a97bbc23))


### Reverts

* Revert "fix: [VEN-1497]" ([36feb1c](https://github.com/VenusProtocol/isolated-pools/commit/36feb1c4ae514e7cc8dbb581c5d40a0b0c86f949))
* Revert "fix : [VEN-1044] L12. Contract Should be Library" ([4d01fb4](https://github.com/VenusProtocol/isolated-pools/commit/4d01fb4890581a85815f640a5b20594116ce79f1))
* Revert "update types" ([d0fc928](https://github.com/VenusProtocol/isolated-pools/commit/d0fc92878b6b983bd86809c1bc03bc0e86a8a28c))
* Revert "fixed tests" ([a8b12bb](https://github.com/VenusProtocol/isolated-pools/commit/a8b12bb121959860c4dca792ff5a5ab51e26fd42))


### Styles

* [N-07] use SNAKE_CASE for constants ([3b6d8be](https://github.com/VenusProtocol/isolated-pools/commit/3b6d8be9bff061c610132519703cdb2c24904350))


### Code Refactoring

* [VEN-1331][VPB-22] remove getPoolReserve ([552755b](https://github.com/VenusProtocol/isolated-pools/commit/552755b6e85f76328569e77f6d6a8440195cb287))
* consolidate VToken contracts ([251e9b7](https://github.com/VenusProtocol/isolated-pools/commit/251e9b7493f920ebc9179e7739f3d8316b8eab3e))
* remove unused contracts ([14e5dce](https://github.com/VenusProtocol/isolated-pools/commit/14e5dce91b60b68bb2ad18bd88de8067c3da2438))
* fix swapped mainnet and testnet vBNB ([1b00e5b](https://github.com/VenusProtocol/isolated-pools/commit/1b00e5b6393f1251d7777d98605238e2bb9590e1))
* redeploy SwapRouters to mainnet with the correct vBNB address ([925b709](https://github.com/VenusProtocol/isolated-pools/commit/925b709090171b47afb4b63cc95d615cf7eb97c6))
* redeploy SwapRouters to testnet with the correct vBNB address ([c9ffe5d](https://github.com/VenusProtocol/isolated-pools/commit/c9ffe5d0150a2c214f17100fe7a266884624385a))

## [1.0.0-dev.18](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.17...v1.0.0-dev.18) (2023-06-26)


### Features

* add bscmainnet deployment ([f71a9c8](https://github.com/VenusProtocol/isolated-pools/commit/f71a9c8b219d65c479f43144854f54d1142d5e25))
* add SwapRouter_Stablecoins deployment ([075f976](https://github.com/VenusProtocol/isolated-pools/commit/075f976da2f28395b35ddc60d889d2ce74366968))

## [1.0.0-dev.17](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.16...v1.0.0-dev.17) (2023-06-26)


### Features

* use core pool behavior for jump rate multiplier ([c75cfe4](https://github.com/VenusProtocol/isolated-pools/commit/c75cfe476091c0629266b2755c93d2d42d7802b8))


### Bug Fixes

* fixed integration test ([5fbdcc0](https://github.com/VenusProtocol/isolated-pools/commit/5fbdcc09a2535657b10e1d5a037e604494bbf161))
* fixed JumpRateModelV2 tests ([e0410f3](https://github.com/VenusProtocol/isolated-pools/commit/e0410f3fd66fd9522788d324328948c9b525eba6))

## [1.0.0-dev.16](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.15...v1.0.0-dev.16) (2023-06-26)

## [1.0.0-dev.15](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.14...v1.0.0-dev.15) (2023-06-26)


### Bug Fixes

* conflicts ([a04fe14](https://github.com/VenusProtocol/isolated-pools/commit/a04fe14aa62bdd934cbc0d97047f5f285a73e053))
* pr comments ([4651fb2](https://github.com/VenusProtocol/isolated-pools/commit/4651fb2039bb0f5ad7bc667b2269087b10f7b6f0))
* replaced pool address for fork tests ([58a9e69](https://github.com/VenusProtocol/isolated-pools/commit/58a9e690a70ba34075b1ccc9f9d354d23636e59f))
* resolve comments ([3fd29da](https://github.com/VenusProtocol/isolated-pools/commit/3fd29dac299b786124541ac84b70cda1266cdd6a))
* resolved typos and comments ([8d119ad](https://github.com/VenusProtocol/isolated-pools/commit/8d119ad8ca295b7bf7bbbd5969248b1a360b6c34))


### Performance Improvements

* add utils helper for fork test ([8295332](https://github.com/VenusProtocol/isolated-pools/commit/8295332ca9ca18041e5a6af6f1a48319d202a7ea))

## [1.0.0-dev.14](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.13...v1.0.0-dev.14) (2023-06-26)


### Bug Fixes

* imports ([15c303e](https://github.com/VenusProtocol/isolated-pools/commit/15c303ea7bb9c5740f2574438b7d2ede8ad4c175))

## [1.0.0-dev.13](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.12...v1.0.0-dev.13) (2023-06-22)


### Features

* add testnet deployment ([55d3cd5](https://github.com/VenusProtocol/isolated-pools/commit/55d3cd520c3081e61eb37e38d78dd326da0b22e9))
* bundle typechain typings into the package ([450d647](https://github.com/VenusProtocol/isolated-pools/commit/450d647207df71881099932f39d38a6ec4ea334a))


### Bug Fixes

* add missing contract types in deployments ([26767c4](https://github.com/VenusProtocol/isolated-pools/commit/26767c488fad86b0e01eb0757cc52110b326740a))

## [1.0.0-dev.12](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.11...v1.0.0-dev.12) (2023-06-21)


### Bug Fixes

* calculate values dynamically in tests ([8dea24c](https://github.com/VenusProtocol/isolated-pools/commit/8dea24c308fe1a8dbc538929977f68c2d4d6cf2e))
* fix protocolSeizeTokens calculations ([d32f5a3](https://github.com/VenusProtocol/isolated-pools/commit/d32f5a3aba1b573e25e392e9ab4cc3f0a000cc4b))

## [1.0.0-dev.11](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.10...v1.0.0-dev.11) (2023-06-21)


### Bug Fixes

* implement stricter validation for the bidbps ([61e1890](https://github.com/VenusProtocol/isolated-pools/commit/61e189076d89e75d6d19b5a79ee3d3ee77d1b526))
* pr comment ([cf868ef](https://github.com/VenusProtocol/isolated-pools/commit/cf868efd80c19191e0d396413e438f2604716b73))
* shortfall test ([8656341](https://github.com/VenusProtocol/isolated-pools/commit/86563416822f9ccf8c9a17ff3dfc449faf2b2bf5))
* ven-1500 check for auction start block ([d8ff98a](https://github.com/VenusProtocol/isolated-pools/commit/d8ff98a404506f53f05a201b6aacdaa5d1b79b39))

## [1.0.0-dev.10](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.9...v1.0.0-dev.10) (2023-06-20)


### Bug Fixes

* ven-1494 ([f46d889](https://github.com/VenusProtocol/isolated-pools/commit/f46d889200c8439229c7b598aa009d0ec290952b))
* ven-1510 NC-03 ([4043673](https://github.com/VenusProtocol/isolated-pools/commit/4043673d5c33f1ab7c01712c64c6687b1fbdc5e0))

## [1.0.0-dev.9](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.8...v1.0.0-dev.9) (2023-06-15)


### ⚠ BREAKING CHANGES

* remove unused contracts
* pre-deploy vTokens and rate models
* remove contract creation when adding new pool

### Features

* in addMarket ensure the pool is registered ([15a0262](https://github.com/VenusProtocol/isolated-pools/commit/15a0262ad654660fe92994747aa254d0f941ee9e))
* pre-deploy vTokens and rate models ([15b2099](https://github.com/VenusProtocol/isolated-pools/commit/15b20999855eae9a8cdc5fd8ee9ae3acf5ab2825))
* remove contract creation when adding new pool ([3cb0301](https://github.com/VenusProtocol/isolated-pools/commit/3cb0301cd833aceb4de41e5dd655d57a8eded9cb))


### Code Refactoring

* remove unused contracts ([14e5dce](https://github.com/VenusProtocol/isolated-pools/commit/14e5dce91b60b68bb2ad18bd88de8067c3da2438))

## [1.0.0-dev.8](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.7...v1.0.0-dev.8) (2023-06-13)

## [1.0.0-dev.7](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.6...v1.0.0-dev.7) (2023-06-12)


### Bug Fixes

* ven-1587 ([f2977e0](https://github.com/VenusProtocol/isolated-pools/commit/f2977e0b033104055ed758e38d57bcca189b640e))
* ven-1589 ([22b1243](https://github.com/VenusProtocol/isolated-pools/commit/22b124317d8f7313c9135baf0a01f2e20718054f))
* ven-1590 ([108aa56](https://github.com/VenusProtocol/isolated-pools/commit/108aa561f07115b8a571bfba92c89f6055b675c7))

## [1.0.0-dev.6](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.5...v1.0.0-dev.6) (2023-06-12)


### Reverts

* Revert "fix: [VEN-1497]" ([36feb1c](https://github.com/VenusProtocol/isolated-pools/commit/36feb1c4ae514e7cc8dbb581c5d40a0b0c86f949))

## [1.0.0-dev.5](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.4...v1.0.0-dev.5) (2023-06-12)


### Bug Fixes

* prevent _ensureMaxLoops revert during liquidation ([#237](https://github.com/VenusProtocol/isolated-pools/issues/237)) ([6519349](https://github.com/VenusProtocol/isolated-pools/commit/651934903c288f28abaf35cf8765bc0b9b8b8805))

## [1.0.0-dev.4](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.3...v1.0.0-dev.4) (2023-06-08)


### Bug Fixes

* lint issues. ([c925fec](https://github.com/VenusProtocol/isolated-pools/commit/c925fec45c3f8d3992ef0b33e364ba19db04334a))
* place bid method. ([3b4ce93](https://github.com/VenusProtocol/isolated-pools/commit/3b4ce931105dedf6c9e4bb339209b077eb51d2ab))
* shortfall tests ([492f604](https://github.com/VenusProtocol/isolated-pools/commit/492f60496d8d9c38be3e377cb4816a2e6390227b))

## [1.0.0-dev.3](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.2...v1.0.0-dev.3) (2023-06-02)

## [1.0.0-dev.2](https://github.com/VenusProtocol/isolated-pools/compare/v1.0.0-dev.1...v1.0.0-dev.2) (2023-06-01)


### Features

* ven-1559 ([52fd123](https://github.com/VenusProtocol/isolated-pools/commit/52fd123081999942f76bcc46c99a93a479b7fe18))
* ven-1560 ([3546f67](https://github.com/VenusProtocol/isolated-pools/commit/3546f672a00b9904da74ae9fc7644b138d7b3a03))

## 1.0.0-dev.1 (2023-06-01)


### ⚠ BREAKING CHANGES

* [N-07] use SNAKE_CASE for constants
* allow to specify vTokenReceiver when adding markets
* remove risk rating from PoolRegistry
* [VEN-1331][VPB-22] remove getPoolReserve
* remove reference to risk fund from pool registry
* remove riskFund from VToken initializer
* [007] replace Comptroller error reporter with custom errors
* make IL VToken interfaces compatible with core
* [007] use custom errors for authorization failures
* add old pool name to PoolNameSet event
* [012] add _disableInitializers to all upgradeable contracts
* [012] use _disableInitializers in Comptroller and VToken
* [024] use Ownable2Step instead of single-step Ownable
* replace a custom WithAdmin with Ownable2StepUpgradeable
* [013] change RewardDistributor function naming
* [013] change Comptroller function naming and access controls
* [013] change VToken function naming and returns
* consolidate VToken contracts
* replace Unitroller with a transparent proxy

### Features

* [007] replace Comptroller error reporter with custom errors ([21a8a7d](https://github.com/VenusProtocol/isolated-pools/commit/21a8a7d490dad35c8e9459994684e86c44efda5a))
* [007] use custom errors for authorization failures ([9dca17e](https://github.com/VenusProtocol/isolated-pools/commit/9dca17e4903bf859741284c2ce0b172f09548cd5))
* [024] use Ownable2Step instead of single-step Ownable ([747a5de](https://github.com/VenusProtocol/isolated-pools/commit/747a5def6deea69fd7f0d72efce870fa24bcd39c))
* [N-25] add indexes to events ([513fbe4](https://github.com/VenusProtocol/isolated-pools/commit/513fbe484ac46060814ec5fdcb8e92d90f7fe8ff))
* [VEN-953] add ACM check to setCloseFactor ([d8494f7](https://github.com/VenusProtocol/isolated-pools/commit/d8494f77484ae45e1ce16b94d026240c0dd4c5a8))
* [VEN-953] add ACM check to setMinAmountToConvert ([c75580a](https://github.com/VenusProtocol/isolated-pools/commit/c75580aa84a0ffa51a20c324b2e16c354d54ddaf))
* [VEN-953] add ACM check to setRewardTokenSpeeds ([6f0cc0e](https://github.com/VenusProtocol/isolated-pools/commit/6f0cc0e68f82b463792166f94bfbc75138a04203))
* [VEN-953] add ACM to PoolRegistry ([307f1a9](https://github.com/VenusProtocol/isolated-pools/commit/307f1a96dc5cb3a8d9acc62e79bbf9cc9a6affbf))
* [VEN-953] add ACM to RewardsDistributor ([407139e](https://github.com/VenusProtocol/isolated-pools/commit/407139ecf7cd4eaf2ae3c246151ea19aaa76302f))
* [VEN-953] add ACM to Shortfall ([a113526](https://github.com/VenusProtocol/isolated-pools/commit/a113526a8d634de5aea1ae658d3818f63b940923))
* [VEN-953] make (re)starting an auction access-controlled ([6d37880](https://github.com/VenusProtocol/isolated-pools/commit/6d378800d65e58ef576d940ea02964bf68e70c37))
* [VEN-953] make pool config access-controlled ([5d79a75](https://github.com/VenusProtocol/isolated-pools/commit/5d79a755414b37d31363b97c4901e50449b02a04))
* [VEN-953] replace owner with ACM in JumpRateModel ([37808f4](https://github.com/VenusProtocol/isolated-pools/commit/37808f4b1d7f6634d37c1a939b2afb03d34e6e40))
* add ability to pause auctions ([c12a6da](https://github.com/VenusProtocol/isolated-pools/commit/c12a6da15b4fe582f5486e86413d12c01bfb1171))
* add AccessControlled mixin ([abfd5b8](https://github.com/VenusProtocol/isolated-pools/commit/abfd5b8d88d1989e51ff04e4b3d95c53399aabbd))
* add event for new rewards distributor ([2b34cd4](https://github.com/VenusProtocol/isolated-pools/commit/2b34cd4f4c55166d2010eb7cb302da757a67f472))
* add geater and mapping for controller, pool ([9ab0a5e](https://github.com/VenusProtocol/isolated-pools/commit/9ab0a5edea51637ed883484b344465493eb223c9))
* add getBorrowingPower function giving account liquidity with respect to liq threshold and also cahnged getAccountLiquidity to give liquidity information with respect to liquidation threshold ([57aed20](https://github.com/VenusProtocol/isolated-pools/commit/57aed200cbe34dcb390932a54c70f856d8e7bd65))
* add getPoolBadDebt to PoolLens ([0dda9a8](https://github.com/VenusProtocol/isolated-pools/commit/0dda9a8474ea16a1d8fa157ff362648502d415cd))
* add old pool name to PoolNameSet event ([d7ad187](https://github.com/VenusProtocol/isolated-pools/commit/d7ad18793cb2b9068202f5f405134b0d7167dd74))
* add reward speed by market view ([5b639f9](https://github.com/VenusProtocol/isolated-pools/commit/5b639f975482de13b593f3f821d76080d008a0b3))
* add reward totals to events ([3a53dc1](https://github.com/VenusProtocol/isolated-pools/commit/3a53dc195bba4989dee15fcb953fd8ba0ea0227c))
* add semantic relese ([994a0b5](https://github.com/VenusProtocol/isolated-pools/commit/994a0b592ff6ce524fc47813110ec04da2a28fa6))
* add supply and borrow caps to lens ([bf18630](https://github.com/VenusProtocol/isolated-pools/commit/bf18630cb122fba11f9d7b0d5e50b59660eec546))
* added balanceAfter memory variable to avoid reading from storage ([c29e229](https://github.com/VenusProtocol/isolated-pools/commit/c29e229f43898e1377dbb0a9c73b4261246b1db0))
* allow to specify vTokenReceiver when adding markets ([4560b04](https://github.com/VenusProtocol/isolated-pools/commit/4560b04daa24487a5464d58bb854662b9b172491))
* basic unchecked flags ([3bb2e54](https://github.com/VenusProtocol/isolated-pools/commit/3bb2e54e1fa23f3dae09cbc49c5404e65004128a))
* decouple IL deployment from funds deployment ([0fc3a6c](https://github.com/VenusProtocol/isolated-pools/commit/0fc3a6cf1ce9f6bb7ce56d12baed8e57015f9ad9))
* **deployment:** add new complete IL testnet deployment ([17d4883](https://github.com/VenusProtocol/isolated-pools/commit/17d4883825eeca3884170237c44018dc6575d17a))
* emit BadDebtRecovered event ([7fbe7fc](https://github.com/VenusProtocol/isolated-pools/commit/7fbe7fc805eb1446eca284c710437d692654535d))
* gas optimization in getter, improve redablity ([176008d](https://github.com/VenusProtocol/isolated-pools/commit/176008d628eb4c6a868b03275ee99055b14378b1))
* License added ([12a49d0](https://github.com/VenusProtocol/isolated-pools/commit/12a49d07bbbdf7160053871385d3473d4ea43e8c))
* make incentiveBps configurable ([e5fd812](https://github.com/VenusProtocol/isolated-pools/commit/e5fd8121f96680b5b45d3ee32c0e2a697b84ca8d))
* make nextBidderBlockLimit configurable ([396d755](https://github.com/VenusProtocol/isolated-pools/commit/396d75537da29c8da0e40755092ef154aeab0d53))
* make PoolRegistry state public ([31ff4e0](https://github.com/VenusProtocol/isolated-pools/commit/31ff4e0ed592395351a25c68f4385b77cfc7af90))
* make protocol seize share configurable ([9ae3208](https://github.com/VenusProtocol/isolated-pools/commit/9ae3208ab62a7283a435aa2b2b20a152964c046f))
* make Shortfall and ProtocolShareReserve configurable ([6f01a11](https://github.com/VenusProtocol/isolated-pools/commit/6f01a112e84a0ba5ff4c8268dd984ae5aa20ff22))
* Mint and Redeem events emit the updated account balance ([1ec4989](https://github.com/VenusProtocol/isolated-pools/commit/1ec498911820017b599b389b3508d5c5b89dcce1))
* move admin logic to a mixin ([8812422](https://github.com/VenusProtocol/isolated-pools/commit/8812422560fecf7275470824295ac86118e85f05))
* remove reference to risk fund from pool registry ([e43428d](https://github.com/VenusProtocol/isolated-pools/commit/e43428d876745c6cad7ca305eaaca9ba34d5fca8))
* remove risk rating from PoolRegistry ([4542641](https://github.com/VenusProtocol/isolated-pools/commit/45426416ed22b18640beb661f12cb68ca7f1b3bd))
* remove riskFund from VToken initializer ([9b9c44b](https://github.com/VenusProtocol/isolated-pools/commit/9b9c44b37be52afa631a8411057176870cd79088))
* replace a custom WithAdmin with Ownable2StepUpgradeable ([281d7bb](https://github.com/VenusProtocol/isolated-pools/commit/281d7bb3646f8f4a824da269b3309439fd85f553))
* replace Unitroller with a transparent proxy ([b273492](https://github.com/VenusProtocol/isolated-pools/commit/b2734926954edb8dd60690535638d0a2e31358bc))
* Risk fund management ([#26](https://github.com/VenusProtocol/isolated-pools/issues/26)) ([5d66109](https://github.com/VenusProtocol/isolated-pools/commit/5d661091d45cc86b9cc4a3202be4dee346ae041a))
* support deflationary tokens in addMarket ([d472822](https://github.com/VenusProtocol/isolated-pools/commit/d472822604d44de9d2dac7ea14c15b82c7041ef9))
* upgrade oz to ^4.8.0 to support Ownable2StepUpgradeable ([0c245c7](https://github.com/VenusProtocol/isolated-pools/commit/0c245c7e6e1b0119e6e2bdf1b786633caee995b8))
* use of governance-contracts dependency ([95eb6ca](https://github.com/VenusProtocol/isolated-pools/commit/95eb6ca1db165e71169dcdef86e913cc5f67d94a))


### Bug Fixes

* [002] use address(0) instead of DEFAULT_ADMIN_ROLE ([8d531d8](https://github.com/VenusProtocol/isolated-pools/commit/8d531d8b4d7afae061180a59776f391e67aa4a0d))
* [005] use safeTransfer instead of transfer ([c059e6b](https://github.com/VenusProtocol/isolated-pools/commit/c059e6b13215b3dd0f029aa3750996ca7e90c86e))
* [008] emit events on state changes ([ddc27c9](https://github.com/VenusProtocol/isolated-pools/commit/ddc27c90d7803eaebf5e5f9252d2879f1b5bcf8c))
* [009] lock pragma in non-interface contracts ([20bcfa2](https://github.com/VenusProtocol/isolated-pools/commit/20bcfa29fc396d63caa37e532aa504a41f9bb7b3))
* [011] remove bookmarks from chain ([b62928b](https://github.com/VenusProtocol/isolated-pools/commit/b62928b83ddcfbac054080ba5f52382e0de195b3))
* [012] add _disableInitializers to all upgradeable contracts ([afd9fea](https://github.com/VenusProtocol/isolated-pools/commit/afd9feadf0b8fd7c6c76d1b7dcfb2bd34ada5614))
* [012] use _disableInitializers in Comptroller and VToken ([1952261](https://github.com/VenusProtocol/isolated-pools/commit/1952261582a22e8b5db0b0d104214efc210244e1))
* [013] change Comptroller function naming and access controls ([26f91b8](https://github.com/VenusProtocol/isolated-pools/commit/26f91b89c0070dc8e2ae9275f13f74fde02d2fc2))
* [013] change RewardDistributor function naming ([eca7741](https://github.com/VenusProtocol/isolated-pools/commit/eca77413dc0be33c034ef9fdf1decb3b726eebd1))
* [013] change VToken function naming and returns ([cd2b639](https://github.com/VenusProtocol/isolated-pools/commit/cd2b639e300a1040301143e686dc7c0bf89bb569))
* [017] approve zero before approving nonzero amount ([f034973](https://github.com/VenusProtocol/isolated-pools/commit/f034973de548408d17132011e139b658931bb613))
* [020] only allow owner to set pool name ([a8353ed](https://github.com/VenusProtocol/isolated-pools/commit/a8353ed9b5c4c8e092aaa511671adcdd198890fc))
* [966] second part remaining function ([39a1a17](https://github.com/VenusProtocol/isolated-pools/commit/39a1a17c0af2d0c15fc83fb7c88d8a346e450f41))
* [imp004] cache array lengths in for loops ([1c6489b](https://github.com/VenusProtocol/isolated-pools/commit/1c6489b4da60b9c9403139ee9b6c1eb412bf7d19))
* [imp005] add indexes to event parameters ([4747081](https://github.com/VenusProtocol/isolated-pools/commit/4747081e7a38b497ab7cca06cb39c88a47385876))
* [imp006] avoid initializing to zero ([3227ebf](https://github.com/VenusProtocol/isolated-pools/commit/3227ebf8250466c8ce4105acabc8e7ccc1ed910e))
* [VEN-1042]:L10. Variable Shadowing ([0e53c7f](https://github.com/VenusProtocol/isolated-pools/commit/0e53c7f1846326d392d825e06d51c1f34ce4d7c2))
* [VEN-1333][SSP-01] disallow new bids for stale auctions ([06e8ca2](https://github.com/VenusProtocol/isolated-pools/commit/06e8ca20d279dc1e6233580b274c630b9ed85c79))
* [VEN-1338][VPB-21] disallow too long names for pools ([92de902](https://github.com/VenusProtocol/isolated-pools/commit/92de9024282fc783e7d0ea1445fb2657e3252de7))
* [VEN-1338][VPB-21] transfer initial supply from the market creator ([fa4ffcc](https://github.com/VenusProtocol/isolated-pools/commit/fa4ffcc3e08562a0c385231032e8ab840f9a1e84))
* [VEN-1495] ([f9a83c9](https://github.com/VenusProtocol/isolated-pools/commit/f9a83c9b016d525bc390bf189f7f64adb633a19c))
* [VEN-1496] ([eb6a31a](https://github.com/VenusProtocol/isolated-pools/commit/eb6a31a1b3a3dd36dc8b4cd6f7c50cc053b51d78))
* [VEN-1497] ([8262af9](https://github.com/VenusProtocol/isolated-pools/commit/8262af93f45f0d94122248984216ae0c40325c7f))
* [VEN-949] CVP-01 fix sign in liquidation threshold check ([934e7fd](https://github.com/VenusProtocol/isolated-pools/commit/934e7fd050814280cb8ac603e16447d10656d087))
* [VEN-975] CVP-04 check for shortfall in heal and batch liquidate ([1c8cc30](https://github.com/VenusProtocol/isolated-pools/commit/1c8cc30e72686c525b2f68ec5e2b493f1405823c))
* add access control to swap pool asset ([13cc23e](https://github.com/VenusProtocol/isolated-pools/commit/13cc23e88d2b1e46fc13d3064ea2123ba6d6395e))
* add copy_contracts to files array ([65ac9fb](https://github.com/VenusProtocol/isolated-pools/commit/65ac9fb5413472f921ee365d1cf182a07daa895d))
* allow setting _setMinLiquidatableCollateral ([7bd15e4](https://github.com/VenusProtocol/isolated-pools/commit/7bd15e4a1c78702c46acc7c7bb59dbd4ea1dc6d2))
* blocker for deployment of upgradable script ([12648ee](https://github.com/VenusProtocol/isolated-pools/commit/12648eeeaf1ece2714cd3ae26c7e5df7a5c5cf84))
* check the right loop lengths in enterMarkets and addRewardDistributor ([da284b4](https://github.com/VenusProtocol/isolated-pools/commit/da284b4a01828ea1ae4c13b207ba7d2e73ceec0b))
* compiler warning ([ad901ee](https://github.com/VenusProtocol/isolated-pools/commit/ad901eef898d7dea609ad4ca17a3b0544c0d58fb))
* **dependencies:** bump Oracle package version ([d07183a](https://github.com/VenusProtocol/isolated-pools/commit/d07183aa92371430ea43c12edb02c1fdb40de69a))
* deploy command ([75bd7a1](https://github.com/VenusProtocol/isolated-pools/commit/75bd7a1945525217117032fda60fe425346cfd7a))
* deployer can set caps ([9876266](https://github.com/VenusProtocol/isolated-pools/commit/987626637eda6e48d416eb8301ed76208442b50b))
* **deployment:** use legacy ACM in live networks ([1ed9647](https://github.com/VenusProtocol/isolated-pools/commit/1ed9647be7f290f8b8d1dcc07bc272d7fb1fa18c))
* deploytment scripts for integration tests ([562d965](https://github.com/VenusProtocol/isolated-pools/commit/562d965e52d27ca5bb034051b38386e489638d44))
* disable yul optimization in ci ([10da2d6](https://github.com/VenusProtocol/isolated-pools/commit/10da2d6b5a94d9e74a5ed8c5b2545620c0e79355))
* fix ACM version ([bf84eb1](https://github.com/VenusProtocol/isolated-pools/commit/bf84eb1c3f6568d6fa989faf41666651cd91c3b6))
* fix after VToken refatoring ([831af56](https://github.com/VenusProtocol/isolated-pools/commit/831af56b713e6aeaa5366d89055a9459b151f569))
* fix capitalization of lens test dir ([db6e931](https://github.com/VenusProtocol/isolated-pools/commit/db6e9317aef4e158841648c6d4d7fcd768a27db8))
* fix test commands ([ccf2f7d](https://github.com/VenusProtocol/isolated-pools/commit/ccf2f7d0c5e43cc9497f3563e1e56db2787a7f0f))
* fix typescript build errors ([be02c22](https://github.com/VenusProtocol/isolated-pools/commit/be02c22add731ae5aaca2981502c90493d069d9d))
* include copy contracts in package ([b4c1ca0](https://github.com/VenusProtocol/isolated-pools/commit/b4c1ca088ea69647d2d06cd8d9e86c0ab160907e))
* integration test and refactoring ([51b23df](https://github.com/VenusProtocol/isolated-pools/commit/51b23dff6b6e77588071b003685c9e5b54cadca7))
* **lens:** [VEN-1328][PLV-01] fix pending reward computation ([8f45885](https://github.com/VenusProtocol/isolated-pools/commit/8f45885a322ebda9ee2e1204691d1d6500df1271))
* lint ([a850761](https://github.com/VenusProtocol/isolated-pools/commit/a8507619d105e022f153ca278a7b91859c61e4fa))
* make IL VToken interfaces compatible with core ([fec3a2d](https://github.com/VenusProtocol/isolated-pools/commit/fec3a2d2fb0f1cbc09c42528355c8b873963704a))
* Minor fix ([6156cea](https://github.com/VenusProtocol/isolated-pools/commit/6156cea8b58fb12223331697cdac0a8eee543910))
* minor issue in PVE004-3 test ([9a61c2f](https://github.com/VenusProtocol/isolated-pools/commit/9a61c2f397ca48a8627e268d0b690d408f866b2a))
* minor wording issue ([a849e40](https://github.com/VenusProtocol/isolated-pools/commit/a849e40d86c5a4d388419bc29f410c0300676524))
* Note(1) 1,3 ([fab692c](https://github.com/VenusProtocol/isolated-pools/commit/fab692c8fe2aa9c1f3bc06865b56a11d1d8f13dd))
* Note(2)-1,3,4,5 ([028ec30](https://github.com/VenusProtocol/isolated-pools/commit/028ec304d420b86bcfa92271bab4a79f357b866b))
* Note(4) ([bc696f3](https://github.com/VenusProtocol/isolated-pools/commit/bc696f3a97fb51ac74e3a61f5a09a79abaededcd))
* overflow for expScale ([e74d64e](https://github.com/VenusProtocol/isolated-pools/commit/e74d64edb29f7f46319dba4dc5a6f9fffe1ac249))
* owner governace check ([059d9a5](https://github.com/VenusProtocol/isolated-pools/commit/059d9a5fc00557d7dcab289e1d1bc1a077b73ae1))
* poolmetadata spelling ([1b27b33](https://github.com/VenusProtocol/isolated-pools/commit/1b27b338c253692943b67770ec62791c17a80bf3))
* PR comments. ([422b002](https://github.com/VenusProtocol/isolated-pools/commit/422b0029127edf5fe1a3295553f928ca41d77213))
* PR comments. ([3a5c40b](https://github.com/VenusProtocol/isolated-pools/commit/3a5c40bc91ff341e05a80fd74032ddfa85203bea))
* prevent decimals underflow in exchange rate computation ([9520b88](https://github.com/VenusProtocol/isolated-pools/commit/9520b8854cac05cc6cc5615e8ec93b942986c1d5))
* Protocol share reserve for each market. ([958bfc5](https://github.com/VenusProtocol/isolated-pools/commit/958bfc533d62eb50a4db4b15622212d9321028ed))
* PVE001 ([75d02da](https://github.com/VenusProtocol/isolated-pools/commit/75d02da1a1ea81514718b2e64724d6ea47a16cbb))
* PVE003 ([4e9070f](https://github.com/VenusProtocol/isolated-pools/commit/4e9070fabeac52d03f99fe3164a64eee208ec9fc))
* PVE004-3 ([b4cc242](https://github.com/VenusProtocol/isolated-pools/commit/b4cc242f4ff172696fbe1e2626faf60c4640d5aa))
* PVE005 ([f4129a4](https://github.com/VenusProtocol/isolated-pools/commit/f4129a4ab328489c89b3359019b972d47b004748))
* PVE006 ([c178a69](https://github.com/VenusProtocol/isolated-pools/commit/c178a69739a2b2fcdbf9939c05d3a10a15bacedc))
* PVE009 ([d102243](https://github.com/VenusProtocol/isolated-pools/commit/d10224372fc9ec0120b26a093550ed384854e3f6))
* PVE010 ([f88230d](https://github.com/VenusProtocol/isolated-pools/commit/f88230d5e8816e5d5c66bcad96e36374f74f4b9c))
* remove .DS_Store that got committed ([3c9279b](https://github.com/VenusProtocol/isolated-pools/commit/3c9279bba44fac887c8a9d88df95985505e506b1))
* remove dependency on typechain from deployments ([e6e309a](https://github.com/VenusProtocol/isolated-pools/commit/e6e309a5c5e1e8a0a76db52ccf49879f30b721e4))
* remove PriceOracle infavor of interface from oracle package ([c002263](https://github.com/VenusProtocol/isolated-pools/commit/c00226369987827234345fe2292da2c3fc3124c7))
* remove PriceOracle infavor of interface from oracle package ([5d7556f](https://github.com/VenusProtocol/isolated-pools/commit/5d7556f422f86f667e3cf8bc86ea02cf3c49f7ab))
* remove PriceOracle infavor of interface from oracle package ([7cb7705](https://github.com/VenusProtocol/isolated-pools/commit/7cb7705887962784a10a1dca5ac7fec5b6ff0996))
* remove typechain imports from deploy files ([df989d8](https://github.com/VenusProtocol/isolated-pools/commit/df989d81eea36dab85fc2f14cd9bb7c14b2ee788))
* remove unused ActionPaused event ([4b1afc3](https://github.com/VenusProtocol/isolated-pools/commit/4b1afc3a972168daf2cda41e48daff56185c5df5))
* remove unused function to track bad debt ([ad5406d](https://github.com/VenusProtocol/isolated-pools/commit/ad5406d388be12f842b8b9fff5ad91f1f35bbec7))
* replace PriceOracle with ResilientOracleInterface ([7fb1b65](https://github.com/VenusProtocol/isolated-pools/commit/7fb1b6587330cd5928c97f7f744f703cdec516ff))
* set transferReserveForAuction to only be callable by shortfall ([bc42657](https://github.com/VenusProtocol/isolated-pools/commit/bc42657d7e4680e07aa86dcca828c0e75f23fd62))
* specify assets and min amount out when swapping ([b2acc1b](https://github.com/VenusProtocol/isolated-pools/commit/b2acc1b25b458731d7cbbc3acb7866ac6404704c))
* supply cap implementation ([f025840](https://github.com/VenusProtocol/isolated-pools/commit/f02584039035b58379b78eb244f90bfbeb00b757))
* typechain issues ([97bff0b](https://github.com/VenusProtocol/isolated-pools/commit/97bff0b191dbdb8efa096c2235f2dcd3cc997815))
* update deployment scripts comptroller updates ([40ca904](https://github.com/VenusProtocol/isolated-pools/commit/40ca9042e2b822491fd0d39bf72a54d9764ed736))
* update deployment scripts per oracle updates ([529c9d1](https://github.com/VenusProtocol/isolated-pools/commit/529c9d1fa6f1ab654541daaa46ae3a7ccb15b9a0))
* update deployment scripts per oracle updates ([c22f9b6](https://github.com/VenusProtocol/isolated-pools/commit/c22f9b636dd2ed651f36e81c993624910f315988))
* update import path for new oracle package ([984cc41](https://github.com/VenusProtocol/isolated-pools/commit/984cc411de61b688cda00e7941959721b810e101))
* update release and fix integration tests ([7591e24](https://github.com/VenusProtocol/isolated-pools/commit/7591e24afe5f3d613013033bb48ab685e5bcbe37))
* use MockPriceOracle in hardhat tests ([0362943](https://github.com/VenusProtocol/isolated-pools/commit/0362943b44f3286b1dd66e9937c57627aa40d452))
* use two-step approval for initial supply ([f0500ae](https://github.com/VenusProtocol/isolated-pools/commit/f0500aec904cbdfa90393927971062ef2e923c9e))
* use updated price oracle script that supports mocks in nonlive envs ([3f6b5ad](https://github.com/VenusProtocol/isolated-pools/commit/3f6b5ad42a18bad0693cd05f2c29e920ffc4a6cc))
* VEN-1487 ([9d200e7](https://github.com/VenusProtocol/isolated-pools/commit/9d200e7aec13cdb703d280a655aabf5d7b30c9b7))
* VEN-1488 ([b6e0b93](https://github.com/VenusProtocol/isolated-pools/commit/b6e0b934d2a99d9acd368c2e96b18be8742f2f47))
* VPB-19 | Atypical Constructor Implementation ([422ac6d](https://github.com/VenusProtocol/isolated-pools/commit/422ac6df9b3183ee99c64194f20e1e90e9121b7b))


### Performance Improvements

* (related to G-03) avoid copying struct to memory ([2eab77b](https://github.com/VenusProtocol/isolated-pools/commit/2eab77bd0bea5df7c540a718ea83391db12fa1b5))
* [G-04] cache storage vars on stack where it makes sense ([f41f5fd](https://github.com/VenusProtocol/isolated-pools/commit/f41f5fd54140c5481ecf180449aac07a1d67cdba))
* [G-05] cache mapping/array members in storage vars ([b86ce6c](https://github.com/VenusProtocol/isolated-pools/commit/b86ce6cd51b105d82aaed3ba16265f2c4307349d))
* [G-06] cache the result of vToken.underlying() ([8482abb](https://github.com/VenusProtocol/isolated-pools/commit/8482abb47559c2edc5153030dc388a03e9239bd7))
* [G-08] use unchecked where applicable ([fe1aeb1](https://github.com/VenusProtocol/isolated-pools/commit/fe1aeb1c00049c4bce85e17bcb1f745e0e969970))
* [G-14] save 3 gas on >= instead of > ([0709639](https://github.com/VenusProtocol/isolated-pools/commit/07096394847a7a8425f1e4f5ea3ee41e8f7d9754))
* [G‑16] use pre-increment instead of post-increment ([a014c48](https://github.com/VenusProtocol/isolated-pools/commit/a014c4832065569ef9c1e2a845776acdb63f5aa9))
* [N-14] use external instead of public where applicable ([9131384](https://github.com/VenusProtocol/isolated-pools/commit/9131384ccdf5cad12a36a28e538a2a08172f11a2))
* [VEN-1332][WPM-01] make wp rate model params immutable ([13b081f](https://github.com/VenusProtocol/isolated-pools/commit/13b081f69a17fb3ac00f6493e7e02f2c1b8a6bae))
* use calldata instead of memory ([976cf49](https://github.com/VenusProtocol/isolated-pools/commit/976cf49b194edc988c31fb42d07bd2b7a97bbc23))


### Reverts

* Revert "update types" ([d0fc928](https://github.com/VenusProtocol/isolated-pools/commit/d0fc92878b6b983bd86809c1bc03bc0e86a8a28c))
* Revert "fixed tests" ([a8b12bb](https://github.com/VenusProtocol/isolated-pools/commit/a8b12bb121959860c4dca792ff5a5ab51e26fd42))


### Code Refactoring

* [VEN-1331][VPB-22] remove getPoolReserve ([552755b](https://github.com/VenusProtocol/isolated-pools/commit/552755b6e85f76328569e77f6d6a8440195cb287))
* consolidate VToken contracts ([251e9b7](https://github.com/VenusProtocol/isolated-pools/commit/251e9b7493f920ebc9179e7739f3d8316b8eab3e))


### Styles

* [N-07] use SNAKE_CASE for constants ([3b6d8be](https://github.com/VenusProtocol/isolated-pools/commit/3b6d8be9bff061c610132519703cdb2c24904350))

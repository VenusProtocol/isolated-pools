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

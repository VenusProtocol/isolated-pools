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

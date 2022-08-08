// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "../Comptroller.sol";
import "../Unitroller.sol";
import "../PriceOracle.sol";

import "../Factories/CErc20ImmutableFactory.sol";
import "../Factories/JumpRateModelFactory.sol";
import "../Factories/WhitePaperInterestRateModelFactory.sol";
import "../WhitePaperInterestRateModel.sol";
import "../JumpRateModelV2.sol";
import "../CErc20Immutable.sol";
import "../InterestRateModel.sol";
import "../Governance/AccessControlManager.sol";

/**
 * @title PoolRegistry
 * @notice PoolRegistry is a registry for Venus interest rate pools.
 */
contract PoolRegistry is OwnableUpgradeable {
    CErc20ImmutableFactory private cTokenFactory;
    JumpRateModelFactory private jumpRateFactory;
    WhitePaperInterestRateModelFactory private whitePaperFactory;

    /**
     * @dev Initializes the deployer to owner.
     */
    function initialize(
        CErc20ImmutableFactory _cTokenFactory,
        JumpRateModelFactory _jumpRateFactory,
        WhitePaperInterestRateModelFactory _whitePaperFactory
    ) public initializer {
        __Ownable_init();

        cTokenFactory = _cTokenFactory;
        jumpRateFactory = _jumpRateFactory;
        whitePaperFactory = _whitePaperFactory;
    }

    /**
     * @dev Struct for a Venus interest rate pool.
     */
    struct VenusPool {
        uint256 poolId;
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
    }
    
    /**
     * @dev Enum for risk rating of Venus interest rate pool.
     */
    enum RiskRating {
        VERY_HIGH_RISK,
        HIGH_RISK,
        MEDIUM_RISK,
        LOW_RISK,
        MINIMAL_RISK
    }
    
    /**
     * @dev Struct for a Venus interest rate pool metadata.
     */
    struct VenusPoolMetaData {
        RiskRating riskRating;
        string category;
        string logoURL;
        string description;
    }

    /**
     * @dev Maps venus pool id to metadata
     */
    mapping(uint256 => VenusPoolMetaData) public metadata;

    /**
     * @dev Array of Venus pools.
     */
    mapping(uint256 => VenusPool) private _poolsByID;

    /**
     * @dev Total number of pools created.
     */
    uint256 private _numberOfPools;

    /**
    * @dev Maps comptroller address to Venus pool Index.
    */
    mapping(address => uint256) private _poolByComptroller;

    /**
     * @dev Maps Ethereum accounts to arrays of Venus pool Comptroller proxy contract addresses.
     */
    mapping(address => address[]) private _bookmarks;

    /**
     * @dev Maps pool id to asset to cToken.
     */
    mapping(uint256 => mapping(address => address)) private _cTokens;

    /**
     * @dev Maps asset to list of supported pools.
     */
    mapping(address => uint256[]) private _supportedPools;

    enum InterestRateModels {
        WhitePaper,
        JumpRate
    }

    struct AddMarketInput {
        uint256 poolId;
        address asset;
        uint8 decimals;
        string name;
        string symbol;
        InterestRateModels rateModel;
        uint256 baseRatePerYear;
        uint256 multiplierPerYear;
        uint256 jumpMultiplierPerYear;
        uint256 kink_;
        uint256 collateralFactor;
        AccessControlManager accessControlManager;
    }

    /**
     * @dev Emitted when a new Venus pool is added to the directory.
     */
    event PoolRegistered(uint256 index, VenusPool pool);

    /**
     * @dev Emitted when a pool name is set.
     */
    event PoolNameSet(uint256 index, string name);

    /**
     * @dev Adds a new Venus pool to the directory (without checking msg.sender).
     * @param name The name of the pool.
     * @param comptroller The pool's Comptroller proxy contract address.
     * @return The index of the registered Venus pool.
     */
    function _registerPool(string memory name, address comptroller)
        internal
        returns (uint256)
    {
        VenusPool memory venusPool = _poolsByID[_poolByComptroller[comptroller]];
        
        require(venusPool.creator == address(0),
            "RegistryPool: Pool already exists in the directory."
        );
        
        require(bytes(name).length <= 100, "No pool name supplied.");

        _numberOfPools++;
        
        VenusPool memory pool = VenusPool(
            _numberOfPools,
            name,
            msg.sender,
            comptroller,
            block.number,
            block.timestamp
        );

        _poolsByID[_numberOfPools] = pool;
        _poolByComptroller[comptroller] = _numberOfPools;

        emit PoolRegistered(_numberOfPools, pool);
        return _numberOfPools;
    }

    /**
     * @dev Deploys a new Venus pool and adds to the directory.
     * @param name The name of the pool.
     * @param implementation The Comptroller implementation address.
     * @param closeFactor The pool's close factor (scaled by 1e18).
     * @param liquidationIncentive The pool's liquidation incentive (scaled by 1e18).
     * @param priceOracle The pool's PriceOracle address.
     * @return The index of the registered Venus pool and the proxy(Unitroller ) address.
     */
    function createRegistryPool(
        string memory name,
        address implementation,
        uint256 closeFactor,
        uint256 liquidationIncentive,
        address priceOracle
    ) external virtual onlyOwner returns (uint256, address) {
        // Input validation
        require(
            implementation != address(0),
            "RegistryPool: Invalid Comptroller implementation address."
        );
        require(
            priceOracle != address(0),
            "RegistryPool: Invalid PriceOracle address."
        );
        // Setup Unitroller(Proxy)
        Unitroller unitroller = new Unitroller();
        address proxy = address(unitroller);
        require(
            unitroller._setPendingImplementation(implementation) == 0,
            "RegistryPool: Failed to set pending implementation in Unitroller."
        );
        Comptroller comptrollerImplementation = Comptroller(implementation);
        comptrollerImplementation._become(unitroller);
        Comptroller comptrollerProxy = Comptroller(proxy);

        // Set Venus pool parameters
        require(
            comptrollerProxy._setCloseFactor(closeFactor) == 0,
            "RegistryPool: Failed to set close factor of Pool."
        );
        require(
            comptrollerProxy._setLiquidationIncentive(liquidationIncentive) ==
                0,
            "RegistryPool: Failed to set liquidation incentive of Pool."
        );
        require(
            comptrollerProxy._setPriceOracle(PriceOracle(priceOracle)) == 0,
            "RegistryPool: Failed to set price oracle of Pool."
        );

        // Make msg.sender the admin
        require(
            unitroller._setPendingAdmin(msg.sender) == 0,
            "RegistryPool: Failed to set pending admin in Unitroller."
        );

        // Register the pool with this PoolRegistry
        return (_registerPool(name, proxy), proxy);
    }

    /**
     * @notice Modify existing Venus pool name.
     */
    function setPoolName(uint256 poolId, string calldata name) external {
        Comptroller _comptroller = Comptroller(_poolsByID[poolId].comptroller);

        // Note: Compiler throws stack to deep if autoformatted with Prettier
        // prettier-ignore
        require(msg.sender == _comptroller.admin() || msg.sender == owner());

        _poolsByID[poolId].name = name;
        emit PoolNameSet(poolId, name);
    }

    /**
     * @notice Bookmarks a Venus pool Unitroller (Comptroller proxy) contract addresses.
     */
    function bookmarkPool(address comptroller) external {
        _bookmarks[msg.sender].push(comptroller);
    }

    /**
     * @notice Returns arrays of all Venus pools' data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getAllPools() external view returns (VenusPool[] memory) {
        VenusPool[] memory _pools = new VenusPool[](_numberOfPools);
        for (uint256 i = 1; i <= _numberOfPools; i++) {
            _pools[i - 1] = (_poolsByID[i]);
        }
        return _pools;
    }

    /**
     * @notice Returns Venus pool by PoolID.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getPoolByID(uint256 poolId)
        external
        view
        returns (VenusPool memory)
    {
        return _poolsByID[poolId];
    }

    /**
     * @param comptroller The Comptroller implementation address.
     * @notice Returns Venus pool.
     */
    function getPoolByComptroller(address comptroller)
        external
        view
        returns (VenusPool memory)
    {
        return _poolsByID[_poolByComptroller[comptroller]];
    }

    /**
     * @param comptroller The Comptroller implementation address.
     * @notice Returns poolID.
     */
    function getPoolIDByComptroller(address comptroller)
        external
        view
        returns (uint256)
    {
        return _poolByComptroller[comptroller];
    }

    /**
     * @notice Returns arrays of Venus pool Unitroller (Comptroller proxy) contract addresses bookmarked by `account`.
     */
    function getBookmarks(address account)
        external
        view
        returns (address[] memory)
    {
        return _bookmarks[account];
    }

    /**
     * @notice Add a market to an existing pool
     */
    function addMarket(
        AddMarketInput memory input
    ) external {
        InterestRateModel rate;
        if (input.rateModel == InterestRateModels.JumpRate) {
            rate = InterestRateModel(
                jumpRateFactory.deploy(
                    input.baseRatePerYear,
                    input.multiplierPerYear,
                    input.jumpMultiplierPerYear,
                    input.kink_,
                    msg.sender
                )
            );
        } else {
            rate = InterestRateModel(
                whitePaperFactory.deploy(
                    input.baseRatePerYear,
                    input.multiplierPerYear
                )
            );
        }

        Comptroller comptroller = Comptroller(
            _poolsByID[input.poolId].comptroller
        );

        CErc20Immutable cToken = cTokenFactory.deployCErc20(
            input.asset,
            comptroller,
            rate,
            10**input.decimals,
            input.name,
            input.symbol,
            input.decimals,
            payable(msg.sender),
			input.accessControlManager
        );

        comptroller._supportMarket(cToken);
        comptroller._setCollateralFactor(cToken, input.collateralFactor);

        _cTokens[input.poolId][input.asset] = address(cToken);
        _supportedPools[input.asset].push(input.poolId);
    }

    function getCTokenForAsset(uint256 poolId, address asset)
        external
        view
        returns (address)
    {
        return _cTokens[poolId][asset];
    }

    function getPoolsSupportedByAsset(address asset)
        external
        view
        returns (uint256[] memory)
    {
        return _supportedPools[asset];
    }

    /**
     * @notice Update metadata of an existing pool
     */
    function updatePoolMetadata(uint256 poolId, VenusPoolMetaData memory _metadata) external onlyOwner {
        metadata[poolId] = _metadata;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@venusprotocol/oracle/contracts/PriceOracle.sol";

import "../Comptroller.sol";
import "../Factories/VTokenProxyFactory.sol";
import "../Factories/JumpRateModelFactory.sol";
import "../Factories/WhitePaperInterestRateModelFactory.sol";
import "../WhitePaperInterestRateModel.sol";
import "../JumpRateModelV2.sol";
import "../VToken.sol";
import "../InterestRateModel.sol";
import "../Governance/AccessControlManager.sol";
import "../Shortfall/Shortfall.sol";
import "../ComptrollerInterface.sol";
import "../VTokenInterfaces.sol";

/**
 * @title PoolRegistry
 * @notice PoolRegistry is a registry for Venus interest rate pools.
 */
contract PoolRegistry is OwnableUpgradeable {
    VTokenProxyFactory private vTokenFactory;
    JumpRateModelFactory private jumpRateFactory;
    WhitePaperInterestRateModelFactory private whitePaperFactory;
    Shortfall private shortfall;
    address payable private riskFund;
    address payable private protocolShareReserve;

    /**
     * @dev Initializes the deployer to owner.
     * @param _vTokenFactory vToken factory address.
     * @param _jumpRateFactory jump rate factory address.
     * @param _whitePaperFactory white paper factory address.
     * @param riskFund_ risk fund address.
     * @param protocolShareReserve_ protocol's shares reserve address.
     */
    function initialize(
        VTokenProxyFactory _vTokenFactory,
        JumpRateModelFactory _jumpRateFactory,
        WhitePaperInterestRateModelFactory _whitePaperFactory,
        Shortfall _shortfall,
        address payable riskFund_,
        address payable protocolShareReserve_
    ) public initializer {
        __Ownable_init();

        vTokenFactory = _vTokenFactory;
        jumpRateFactory = _jumpRateFactory;
        whitePaperFactory = _whitePaperFactory;
        shortfall = _shortfall;
        riskFund = riskFund_;
        protocolShareReserve = protocolShareReserve_;
    }

    /**
     * @dev Struct for a Venus interest rate pool.
     */
    struct VenusPool {
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
    mapping(address => VenusPoolMetaData) public metadata;

    /**
     * @dev Array of Venus pool comptroller addresses.
     * Used for iterating over all pools
     */
    mapping(uint256 => address) private _poolsByID;

    /**
     * @dev Total number of pools created.
     */
    uint256 private _numberOfPools;

    /**
     * @dev Maps comptroller address to Venus pool Index.
     */
    mapping(address => VenusPool) private _poolByComptroller;

    /**
     * @dev Maps pool id to asset to vToken.
     */
    mapping(address => mapping(address => address)) private _vTokens;

    /**
     * @dev Maps asset to list of supported pools.
     */
    mapping(address => address[]) private _supportedPools;

    enum InterestRateModels {
        WhitePaper,
        JumpRate
    }

    struct AddMarketInput {
        address comptroller;
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
        uint256 liquidationThreshold;
        AccessControlManager accessControlManager;
        address vTokenProxyAdmin;
        VToken tokenImplementation_;
    }

    /**
     * @dev Emitted when a new Venus pool is added to the directory.
     */
    event PoolRegistered(address indexed comptroller, VenusPool pool);

    /**
     * @dev Emitted when a pool name is set.
     */
    event PoolNameSet(address indexed comptroller, string name);

    /**
     * @dev Emitted when a pool metadata is updated.
     */
    event PoolMetadataUpdated(
        address indexed comptroller,
        VenusPoolMetaData oldMetadata,
        VenusPoolMetaData newMetadata
    );

    /**
     * @dev Emitted when a Market is added to the pool.
     */
    event MarketAdded(address indexed comptroller, address vTokenAddress);

    /**
     * @dev Adds a new Venus pool to the directory (without checking msg.sender).
     * @param name The name of the pool.
     * @param comptroller The pool's Comptroller proxy contract address.
     * @return The index of the registered Venus pool.
     */
    function _registerPool(string memory name, address comptroller) internal returns (uint256) {
        VenusPool memory venusPool = _poolByComptroller[comptroller];

        require(venusPool.creator == address(0), "RegistryPool: Pool already exists in the directory.");

        require(bytes(name).length <= 100, "No pool name supplied.");

        _numberOfPools++;

        VenusPool memory pool = VenusPool(name, msg.sender, comptroller, block.number, block.timestamp);

        _poolsByID[_numberOfPools] = comptroller;
        _poolByComptroller[comptroller] = pool;

        emit PoolRegistered(comptroller, pool);
        return _numberOfPools;
    }

    /**
     * @dev Deploys a new Venus pool and adds to the directory.
     * @param name The name of the pool.
     * @param proxyAdmin The address of the ProxyAdmin contract.
     * @param implementationAddress The Comptroller implementation address.
     * @param closeFactor The pool's close factor (scaled by 1e18).
     * @param liquidationIncentive The pool's liquidation incentive (scaled by 1e18).
     * @param priceOracle The pool's PriceOracle address.
     * @return index The index of the registered Venus pool.
     * @return proxyAddress The the Comptroller proxy address.
     */
    function createRegistryPool(
        string memory name,
        address proxyAdmin,
        address implementationAddress,
        uint256 closeFactor,
        uint256 liquidationIncentive,
        uint256 minLiquidatableCollateral,
        address priceOracle
    ) external virtual onlyOwner returns (uint256 index, address proxyAddress) {
        // Input validation
        require(implementationAddress != address(0), "RegistryPool: Invalid Comptroller implementation address.");
        require(priceOracle != address(0), "RegistryPool: Invalid PriceOracle address.");

        Comptroller implementation = Comptroller(implementationAddress);

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            implementationAddress,
            proxyAdmin,
            abi.encodeWithSelector(implementation.initialize.selector)
        );
        proxyAddress = address(proxy);
        Comptroller comptrollerProxy = Comptroller(proxyAddress);

        // Set Venus pool parameters
        require(comptrollerProxy.setCloseFactor(closeFactor) == 0, "RegistryPool: Failed to set close factor of Pool.");
        require(
            comptrollerProxy.setLiquidationIncentive(liquidationIncentive) == 0,
            "RegistryPool: Failed to set liquidation incentive of Pool."
        );

        comptrollerProxy.setMinLiquidatableCollateral(minLiquidatableCollateral);

        require(
            comptrollerProxy.setPriceOracle(PriceOracle(priceOracle)) == 0,
            "RegistryPool: Failed to set price oracle of Pool."
        );

        // Make msg.sender the admin
        comptrollerProxy.setPendingAdmin(msg.sender);

        // Register the pool with this PoolRegistry
        return (_registerPool(name, proxyAddress), proxyAddress);
    }

    /**
     * @notice Modify existing Venus pool name.
     */
    function setPoolName(address comptroller, string calldata name) external {
        Comptroller _comptroller = Comptroller(comptroller);

        // Note: Compiler throws stack to deep if autoformatted with Prettier
        // prettier-ignore
        require(msg.sender == _comptroller.admin() || msg.sender == owner());
        _poolByComptroller[comptroller].name = name;
        emit PoolNameSet(comptroller, name);
    }

    /**
     * @notice Returns arrays of all Venus pools' data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getAllPools() external view returns (VenusPool[] memory) {
        VenusPool[] memory _pools = new VenusPool[](_numberOfPools);
        for (uint256 i = 1; i <= _numberOfPools; ++i) {
            address comptroller = _poolsByID[i];
            _pools[i - 1] = (_poolByComptroller[comptroller]);
        }
        return _pools;
    }

    /**
     * @param comptroller The Comptroller implementation address.
     * @notice Returns Venus pool.
     */
    function getPoolByComptroller(address comptroller) external view returns (VenusPool memory) {
        return _poolByComptroller[comptroller];
    }

    /**
     * @param comptroller comptroller of Venus pool.
     * @notice Returns Metadata of Venus pool.
     */
    function getVenusPoolMetadata(address comptroller) external view returns (VenusPoolMetaData memory) {
        return metadata[comptroller];
    }

    /**
     * @notice Add a market to an existing pool
     */
    function addMarket(AddMarketInput memory input) external onlyOwner {
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
            rate = InterestRateModel(whitePaperFactory.deploy(input.baseRatePerYear, input.multiplierPerYear));
        }

        Comptroller comptroller = Comptroller(input.comptroller);

        VTokenProxyFactory.VTokenArgs memory initializeArgs = VTokenProxyFactory.VTokenArgs(
            input.asset,
            comptroller,
            rate,
            10**input.decimals,
            input.name,
            input.symbol,
            input.decimals,
            payable(msg.sender),
            input.accessControlManager,
            VTokenInterface.RiskManagementInit(address(shortfall), riskFund, protocolShareReserve),
            input.vTokenProxyAdmin,
            input.tokenImplementation_
        );

        VToken vToken = vTokenFactory.deployVTokenProxy(initializeArgs);

        comptroller.supportMarket(vToken);
        comptroller.setCollateralFactor(vToken, input.collateralFactor, input.liquidationThreshold);

        _vTokens[input.comptroller][input.asset] = address(vToken);
        _supportedPools[input.asset].push(input.comptroller);

        emit MarketAdded(address(comptroller), address(vToken));
    }

    function getVTokenForAsset(address comptroller, address asset) external view returns (address) {
        return _vTokens[comptroller][asset];
    }

    function getPoolsSupportedByAsset(address asset) external view returns (address[] memory) {
        return _supportedPools[asset];
    }

    /**
     * @notice Update metadata of an existing pool
     */
    function updatePoolMetadata(address comptroller, VenusPoolMetaData memory _metadata) external onlyOwner {
        VenusPoolMetaData memory oldMetadata = metadata[comptroller];
        metadata[comptroller] = _metadata;
        emit PoolMetadataUpdated(comptroller, oldMetadata, _metadata);
    }
}

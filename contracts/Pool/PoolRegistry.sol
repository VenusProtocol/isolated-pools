// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { PoolRegistryInterface } from "./PoolRegistryInterface.sol";
import { Comptroller } from "../Comptroller.sol";
import { VToken } from "../VToken.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";

/**
 * @title PoolRegistry
 * @author Venus
 * @notice The Isolated Pools architecture centers around the `PoolRegistry` contract. The `PoolRegistry` maintains a directory of isolated lending
 * pools and can perform actions like creating and registering new pools, adding new markets to existing pools, setting and updating the pool's required
 * metadata, and providing the getter methods to get information on the pools.
 *
 * Isolated lending has three main components: PoolRegistry, pools, and markets. The PoolRegistry is responsible for managing pools.
 * It can create new pools, update pool metadata and manage markets within pools. PoolRegistry contains getter methods to get the details of
 * any existing pool like `getVTokenForAsset` and `getPoolsSupportedByAsset`. It also contains methods for updating pool metadata (`updatePoolMetadata`)
 * and setting pool name (`setPoolName`).
 *
 * The directory of pools is managed through two mappings: `_poolByComptroller` which is a hashmap with the comptroller address as the key and `VenusPool` as
 * the value and `_poolsByID` which is an array of comptroller addresses. Individual pools can be accessed by calling `getPoolByComptroller` with the pool's
 * comptroller address. `_poolsByID` is used to iterate through all of the pools.
 *
 * PoolRegistry also contains a map of asset addresses called `_supportedPools` that maps to an array of assets suppored by each pool. This array of pools by
 * asset is retrieved by calling `getPoolsSupportedByAsset`.
 *
 * PoolRegistry registers new isolated pools in the directory with the `createRegistryPool` method. Isolated pools are composed of independent markets with
 * specific assets and custom risk management configurations according to their markets.
 */
contract PoolRegistry is Ownable2StepUpgradeable, AccessControlledV8, PoolRegistryInterface {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct AddMarketInput {
        VToken vToken;
        uint256 collateralFactor;
        uint256 liquidationThreshold;
        uint256 initialSupply;
        address vTokenReceiver;
        uint256 supplyCap;
        uint256 borrowCap;
    }

    uint256 internal constant MAX_POOL_NAME_LENGTH = 100;

    /**
     * @notice Maps pool's comptroller address to metadata.
     */
    mapping(address => VenusPoolMetaData) public metadata;

    /**
     * @dev Maps pool ID to pool's comptroller address
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
     * @dev Maps pool's comptroller address to asset to vToken.
     */
    mapping(address => mapping(address => address)) private _vTokens;

    /**
     * @dev Maps asset to list of supported pools.
     */
    mapping(address => address[]) private _supportedPools;

    /**
     * @notice Emitted when a new Venus pool is added to the directory.
     */
    event PoolRegistered(address indexed comptroller, VenusPool pool);

    /**
     * @notice Emitted when a pool name is set.
     */
    event PoolNameSet(address indexed comptroller, string oldName, string newName);

    /**
     * @notice Emitted when a pool metadata is updated.
     */
    event PoolMetadataUpdated(
        address indexed comptroller,
        VenusPoolMetaData oldMetadata,
        VenusPoolMetaData newMetadata
    );

    /**
     * @notice Emitted when a Market is added to the pool.
     */
    event MarketAdded(address indexed comptroller, address indexed vTokenAddress);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Initializes the deployer to owner
     * @param accessControlManager_ AccessControlManager contract address
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
    }

    /**
     * @notice Adds a new Venus pool to the directory
     * @dev Price oracle must be configured before adding a pool
     * @param name The name of the pool
     * @param comptroller Pool's Comptroller contract
     * @param closeFactor The pool's close factor (scaled by 1e18)
     * @param liquidationIncentive The pool's liquidation incentive (scaled by 1e18)
     * @param minLiquidatableCollateral Minimal collateral for regular (non-batch) liquidations flow
     * @return index The index of the registered Venus pool
     * @custom:error ZeroAddressNotAllowed is thrown when Comptroller address is zero
     * @custom:error ZeroAddressNotAllowed is thrown when price oracle address is zero
     */
    function addPool(
        string calldata name,
        Comptroller comptroller,
        uint256 closeFactor,
        uint256 liquidationIncentive,
        uint256 minLiquidatableCollateral
    ) external virtual returns (uint256 index) {
        _checkAccessAllowed("addPool(string,address,uint256,uint256,uint256)");
        // Input validation
        ensureNonzeroAddress(address(comptroller));
        ensureNonzeroAddress(address(comptroller.oracle()));

        uint256 poolId = _registerPool(name, address(comptroller));

        // Set Venus pool parameters
        comptroller.setCloseFactor(closeFactor);
        comptroller.setLiquidationIncentive(liquidationIncentive);
        comptroller.setMinLiquidatableCollateral(minLiquidatableCollateral);

        return poolId;
    }

    /**
     * @notice Add a market to an existing pool and then mint to provide initial supply
     * @param input The structure describing the parameters for adding a market to a pool
     * @custom:error ZeroAddressNotAllowed is thrown when vToken address is zero
     * @custom:error ZeroAddressNotAllowed is thrown when vTokenReceiver address is zero
     */
    function addMarket(AddMarketInput memory input) external {
        _checkAccessAllowed("addMarket(AddMarketInput)");
        ensureNonzeroAddress(address(input.vToken));
        ensureNonzeroAddress(input.vTokenReceiver);
        require(input.initialSupply > 0, "PoolRegistry: initialSupply is zero");

        VToken vToken = input.vToken;
        address vTokenAddress = address(vToken);
        address comptrollerAddress = address(vToken.comptroller());
        Comptroller comptroller = Comptroller(comptrollerAddress);
        address underlyingAddress = vToken.underlying();
        IERC20Upgradeable underlying = IERC20Upgradeable(underlyingAddress);

        require(_poolByComptroller[comptrollerAddress].creator != address(0), "PoolRegistry: Pool not registered");
        // solhint-disable-next-line reason-string
        require(
            _vTokens[comptrollerAddress][underlyingAddress] == address(0),
            "PoolRegistry: Market already added for asset comptroller combination"
        );

        comptroller.supportMarket(vToken);
        comptroller.setCollateralFactor(vToken, input.collateralFactor, input.liquidationThreshold);

        uint256[] memory newSupplyCaps = new uint256[](1);
        uint256[] memory newBorrowCaps = new uint256[](1);
        VToken[] memory vTokens = new VToken[](1);

        newSupplyCaps[0] = input.supplyCap;
        newBorrowCaps[0] = input.borrowCap;
        vTokens[0] = vToken;

        comptroller.setMarketSupplyCaps(vTokens, newSupplyCaps);
        comptroller.setMarketBorrowCaps(vTokens, newBorrowCaps);

        _vTokens[comptrollerAddress][underlyingAddress] = vTokenAddress;
        _supportedPools[underlyingAddress].push(comptrollerAddress);

        uint256 amountToSupply = _transferIn(underlying, msg.sender, input.initialSupply);
        underlying.approve(vTokenAddress, 0);
        underlying.approve(vTokenAddress, amountToSupply);
        vToken.mintBehalf(input.vTokenReceiver, amountToSupply);

        emit MarketAdded(comptrollerAddress, vTokenAddress);
    }

    /**
     * @notice Modify existing Venus pool name
     * @param comptroller Pool's Comptroller
     * @param name New pool name
     */
    function setPoolName(address comptroller, string calldata name) external {
        _checkAccessAllowed("setPoolName(address,string)");
        _ensureValidName(name);
        VenusPool storage pool = _poolByComptroller[comptroller];
        string memory oldName = pool.name;
        pool.name = name;
        emit PoolNameSet(comptroller, oldName, name);
    }

    /**
     * @notice Update metadata of an existing pool
     * @param comptroller Pool's Comptroller
     * @param metadata_ New pool metadata
     */
    function updatePoolMetadata(address comptroller, VenusPoolMetaData calldata metadata_) external {
        _checkAccessAllowed("updatePoolMetadata(address,VenusPoolMetaData)");
        VenusPoolMetaData memory oldMetadata = metadata[comptroller];
        metadata[comptroller] = metadata_;
        emit PoolMetadataUpdated(comptroller, oldMetadata, metadata_);
    }

    /**
     * @notice Returns arrays of all Venus pools' data
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive
     * @return A list of all pools within PoolRegistry, with details for each pool
     */
    function getAllPools() external view override returns (VenusPool[] memory) {
        uint256 numberOfPools_ = _numberOfPools; // storage load to save gas
        VenusPool[] memory _pools = new VenusPool[](numberOfPools_);
        for (uint256 i = 1; i <= numberOfPools_; ++i) {
            address comptroller = _poolsByID[i];
            _pools[i - 1] = (_poolByComptroller[comptroller]);
        }
        return _pools;
    }

    /**
     * @param comptroller The comptroller proxy address associated to the pool
     * @return  Returns Venus pool
     */
    function getPoolByComptroller(address comptroller) external view override returns (VenusPool memory) {
        return _poolByComptroller[comptroller];
    }

    /**
     * @param comptroller comptroller of Venus pool
     * @return Returns Metadata of Venus pool
     */
    function getVenusPoolMetadata(address comptroller) external view override returns (VenusPoolMetaData memory) {
        return metadata[comptroller];
    }

    function getVTokenForAsset(address comptroller, address asset) external view override returns (address) {
        return _vTokens[comptroller][asset];
    }

    function getPoolsSupportedByAsset(address asset) external view override returns (address[] memory) {
        return _supportedPools[asset];
    }

    /**
     * @dev Adds a new Venus pool to the directory (without checking msg.sender).
     * @param name The name of the pool
     * @param comptroller The pool's Comptroller proxy contract address
     * @return The index of the registered Venus pool
     */
    function _registerPool(string calldata name, address comptroller) internal returns (uint256) {
        VenusPool storage storedPool = _poolByComptroller[comptroller];

        require(storedPool.creator == address(0), "PoolRegistry: Pool already exists in the directory.");
        _ensureValidName(name);

        ++_numberOfPools;
        uint256 numberOfPools_ = _numberOfPools; // cache on stack to save storage read gas

        VenusPool memory pool = VenusPool(name, msg.sender, comptroller, block.number, block.timestamp);

        _poolsByID[numberOfPools_] = comptroller;
        _poolByComptroller[comptroller] = pool;

        emit PoolRegistered(comptroller, pool);
        return numberOfPools_;
    }

    function _transferIn(IERC20Upgradeable token, address from, uint256 amount) internal returns (uint256) {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    function _ensureValidName(string calldata name) internal pure {
        require(bytes(name).length <= MAX_POOL_NAME_LENGTH, "Pool's name is too large");
    }
}

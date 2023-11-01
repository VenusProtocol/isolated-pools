// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { MaxLoopsLimitHelper } from "../../MaxLoopsLimitHelper.sol";

error InvalidAddress();
error UnsupportedAsset();
error InvalidTotalPercentage();
error InvalidMaxLoopsLimit();

interface IIncomeDestination {
    function updateAssetsState(address comptroller, address asset) external;
}

interface IVToken {
    function underlying() external view returns (address);
}

interface PoolRegistryInterface {
    /*** get VToken in the Pool for an Asset ***/
    function getVTokenForAsset(address comptroller, address asset) external view returns (address);
}

interface ComptrollerInterface {
    function isComptroller() external view returns (bool);
}

interface IMockProtocolShareReserve {
    /// @notice it represents the type of vToken income
    enum IncomeType {
        SPREAD,
        LIQUIDATION
    }

    function updateAssetsState(address comptroller, address asset, IncomeType incomeType) external;
}

contract MockProtocolShareReserve is
    AccessControlledV8,
    ReentrancyGuardUpgradeable,
    MaxLoopsLimitHelper,
    IMockProtocolShareReserve
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice protocol income is categorized into two schemas.
    /// The first schema is for spread income
    /// The second schema is for liquidation income
    enum Schema {
        PROTOCOL_RESERVES,
        ADDITIONAL_REVENUE
    }

    struct DistributionConfig {
        Schema schema;
        /// @dev percenatge is represented without any scale
        uint8 percentage;
        address destination;
    }

    /// @notice address of core pool comptroller contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable CORE_POOL_COMPTROLLER;

    /// @notice address of WBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WBNB;

    /// @notice address of vBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable vBNB;

    /// @notice address of pool registry contract
    address public poolRegistry;

    uint8 public constant MAX_PERCENT = 100;

    /// @notice comptroller => asset => schema => balance
    mapping(address => mapping(address => mapping(Schema => uint256))) public assetsReserves;

    /// @notice asset => balance
    mapping(address => uint256) public totalAssetReserve;

    /// @notice configuration for different income distribution targets
    DistributionConfig[] public distributionTargets;

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Event emitted after the updation of the assets reserves.
    event AssetsReservesUpdated(
        address indexed comptroller,
        address indexed asset,
        uint256 amount,
        IncomeType incomeType,
        Schema schema
    );

    /// @notice Event emitted when an asset is released to a target
    event AssetReleased(
        address indexed destination,
        address indexed asset,
        Schema schema,
        uint256 percent,
        uint256 amount
    );

    /// @notice Event emitted when asset reserves state is updated
    event ReservesUpdated(
        address indexed comptroller,
        address indexed asset,
        Schema schema,
        uint256 oldBalance,
        uint256 newBalance
    );

    /// @notice Event emitted when distribution configuration is updated
    event DistributionConfigUpdated(
        address indexed destination,
        uint8 oldPercentage,
        uint8 newPercentage,
        Schema schema
    );

    /// @notice Event emitted when distribution configuration is added
    event DistributionConfigAdded(address indexed destination, uint8 percentage, Schema schema);

    /// @notice Event emitted when distribution configuration is removed
    event DistributionConfigRemoved(address indexed destination, uint8 percentage, Schema schema);

    /**
     * @dev Constructor to initialize the immutable variables
     * @param _corePoolComptroller The address of core pool comptroller
     * @param _wbnb The address of WBNB
     * @param _vbnb The address of vBNB
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _corePoolComptroller, address _wbnb, address _vbnb) {
        if (_corePoolComptroller == address(0)) revert InvalidAddress();
        if (_wbnb == address(0)) revert InvalidAddress();
        if (_vbnb == address(0)) revert InvalidAddress();

        CORE_POOL_COMPTROLLER = _corePoolComptroller;
        WBNB = _wbnb;
        vBNB = _vbnb;

        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param _accessControlManager The address of ACM contract
     * @param _loopsLimit Limit for the loops in the contract to avoid DOS
     */
    function initialize(address _accessControlManager, uint256 _loopsLimit) external initializer {
        __AccessControlled_init(_accessControlManager);
        __ReentrancyGuard_init();
        _setMaxLoopsLimit(_loopsLimit);
    }

    /**
     * @dev Pool registry setter.
     * @param _poolRegistry Address of the pool registry
     */
    function setPoolRegistry(address _poolRegistry) external onlyOwner {
        if (_poolRegistry == address(0)) revert InvalidAddress();
        emit PoolRegistryUpdated(poolRegistry, _poolRegistry);
        poolRegistry = _poolRegistry;
    }

    /**
     * @dev Add or update destination targets based on destination address
     * @param configs configurations of the destinations.
     */
    function addOrUpdateDistributionConfigs(DistributionConfig[] calldata configs) external nonReentrant {
        _checkAccessAllowed("addOrUpdateDistributionConfigs(DistributionConfig[])");

        for (uint256 i = 0; i < configs.length; ) {
            DistributionConfig memory _config = configs[i];
            if (_config.destination == address(0)) revert InvalidAddress();

            bool updated = false;
            uint256 distributionTargetsLength = distributionTargets.length;
            for (uint256 j = 0; j < distributionTargetsLength; ) {
                DistributionConfig storage config = distributionTargets[j];

                if (_config.schema == config.schema && config.destination == _config.destination) {
                    emit DistributionConfigUpdated(
                        _config.destination,
                        config.percentage,
                        _config.percentage,
                        _config.schema
                    );
                    config.percentage = _config.percentage;
                    updated = true;
                    break;
                }

                unchecked {
                    ++j;
                }
            }

            if (!updated) {
                distributionTargets.push(_config);
                emit DistributionConfigAdded(_config.destination, _config.percentage, _config.schema);
            }

            unchecked {
                ++i;
            }
        }

        _ensurePercentages();
        _ensureMaxLoops(distributionTargets.length);
    }

    /**
     * @dev Remove destionation target if percentage is 0
     * @param schema schema of the configuration
     * @param destination destination address of the configuration
     */
    function removeDistributionConfig(Schema schema, address destination) external {
        _checkAccessAllowed("removeDistributionConfig(Schema,address)");

        uint256 distributionIndex;
        bool found = false;
        for (uint256 i = 0; i < distributionTargets.length; ) {
            DistributionConfig storage config = distributionTargets[i];

            if (schema == config.schema && destination == config.destination && config.percentage == 0) {
                found = true;
                distributionIndex = i;
                break;
            }

            unchecked {
                ++i;
            }
        }

        if (found) {
            emit DistributionConfigRemoved(
                distributionTargets[distributionIndex].destination,
                distributionTargets[distributionIndex].percentage,
                distributionTargets[distributionIndex].schema
            );

            distributionTargets[distributionIndex] = distributionTargets[distributionTargets.length - 1];
            distributionTargets.pop();
        }

        _ensurePercentages();
    }

    /**
     * @dev Release funds
     * @param comptroller the comptroller address of the pool
     * @param assets assets to be released to distribution targets
     */
    function releaseFunds(address comptroller, address[] calldata assets) external nonReentrant {
        for (uint256 i = 0; i < assets.length; ) {
            _releaseFund(comptroller, assets[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Used to find out the amount of funds that's going to be released when release funds is called.
     * @param comptroller the comptroller address of the pool
     * @param schema the schema of the distribution target
     * @param destination the destination address of the distribution target
     * @param asset the asset address which will be released
     */
    function getUnreleasedFunds(
        address comptroller,
        Schema schema,
        address destination,
        address asset
    ) external view returns (uint256) {
        uint256 distributionTargetsLength = distributionTargets.length;
        for (uint256 i = 0; i < distributionTargetsLength; ) {
            DistributionConfig storage _config = distributionTargets[i];
            if (_config.schema == schema && _config.destination == destination) {
                uint256 total = assetsReserves[comptroller][asset][schema];
                return (total * _config.percentage) / MAX_PERCENT;
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Returns the total number of distribution targets
     */
    function totalDistributions() external view returns (uint256) {
        return distributionTargets.length;
    }

    /**
     * @dev Used to find out the percentage distribution for a particular destination based on schema
     * @param destination the destination address of the distribution target
     * @param schema the schema of the distribution target
     * @return percentage percentage distribution
     */
    function getPercentageDistribution(address destination, Schema schema) external view returns (uint256) {
        uint256 distributionTargetsLength = distributionTargets.length;
        for (uint256 i = 0; i < distributionTargetsLength; ) {
            DistributionConfig memory config = distributionTargets[i];

            if (config.destination == destination && config.schema == schema) {
                return config.percentage;
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to the protocol share reserve.
     * @param comptroller  Comptroller address(pool)
     * @param asset Asset address.
     * @param incomeType type of income
     */
    function updateAssetsState(
        address comptroller,
        address asset,
        IncomeType incomeType
    ) public override(IMockProtocolShareReserve) nonReentrant {
        if (!ComptrollerInterface(comptroller).isComptroller()) revert InvalidAddress();
        if (asset == address(0)) revert InvalidAddress();
        if (
            comptroller != CORE_POOL_COMPTROLLER &&
            PoolRegistryInterface(poolRegistry).getVTokenForAsset(comptroller, asset) == address(0)
        ) revert InvalidAddress();

        Schema schema = _getSchema(incomeType);
        uint256 currentBalance = IERC20Upgradeable(asset).balanceOf(address(this));
        uint256 assetReserve = totalAssetReserve[asset];

        if (currentBalance > assetReserve) {
            uint256 balanceDifference;
            unchecked {
                balanceDifference = currentBalance - assetReserve;
            }

            assetsReserves[comptroller][asset][schema] += balanceDifference;
            totalAssetReserve[asset] += balanceDifference;
            emit AssetsReservesUpdated(comptroller, asset, balanceDifference, incomeType, schema);
        }
    }

    /**
     * @dev asset from a particular pool to be release to distribution targets
     * @param comptroller  Comptroller address(pool)
     * @param asset Asset address.
     */
    function _releaseFund(address comptroller, address asset) internal {
        uint256 totalSchemas = uint256(type(Schema).max) + 1;
        uint256[] memory schemaBalances = new uint256[](totalSchemas);
        uint256 totalBalance;
        for (uint256 schemaValue; schemaValue < totalSchemas; ) {
            schemaBalances[schemaValue] = assetsReserves[comptroller][asset][Schema(schemaValue)];
            totalBalance += schemaBalances[schemaValue];

            unchecked {
                ++schemaValue;
            }
        }

        if (totalBalance == 0) {
            return;
        }

        uint256[] memory totalTransferAmounts = new uint256[](totalSchemas);
        for (uint256 i = 0; i < distributionTargets.length; ) {
            DistributionConfig memory _config = distributionTargets[i];

            uint256 transferAmount = (schemaBalances[uint256(_config.schema)] * _config.percentage) / MAX_PERCENT;
            totalTransferAmounts[uint256(_config.schema)] += transferAmount;

            if (transferAmount != 0) {
                IERC20Upgradeable(asset).safeTransfer(_config.destination, transferAmount);
                IIncomeDestination(_config.destination).updateAssetsState(comptroller, asset);

                emit AssetReleased(_config.destination, asset, _config.schema, _config.percentage, transferAmount);
            }

            unchecked {
                ++i;
            }
        }

        uint256[] memory newSchemaBalances = new uint256[](totalSchemas);
        for (uint256 schemaValue = 0; schemaValue < totalSchemas; ) {
            newSchemaBalances[schemaValue] = schemaBalances[schemaValue] - totalTransferAmounts[schemaValue];
            assetsReserves[comptroller][asset][Schema(schemaValue)] = newSchemaBalances[schemaValue];
            totalAssetReserve[asset] = totalAssetReserve[asset] - totalTransferAmounts[schemaValue];

            emit ReservesUpdated(
                comptroller,
                asset,
                Schema(schemaValue),
                schemaBalances[schemaValue],
                newSchemaBalances[schemaValue]
            );

            unchecked {
                ++schemaValue;
            }
        }
    }

    /**
     * @dev Returns the schema based on income type
     * @param incomeType type of income
     * @return schema schema for distribution
     */
    function _getSchema(IncomeType incomeType) internal view returns (Schema schema) {
        schema = Schema.ADDITIONAL_REVENUE;

        if (incomeType == IncomeType.SPREAD) {
            schema = Schema.PROTOCOL_RESERVES;
        }
    }

    /**
     * @dev This ensures that the total percentage of all the distribution targets is 100% or 0%
     */
    function _ensurePercentages() internal view {
        uint256 totalSchemas = uint256(type(Schema).max) + 1;
        uint8[] memory totalPercentages = new uint8[](totalSchemas);

        uint256 distributionTargetsLength = distributionTargets.length;
        for (uint256 i = 0; i < distributionTargetsLength; ) {
            DistributionConfig memory config = distributionTargets[i];
            totalPercentages[uint256(config.schema)] += config.percentage;

            unchecked {
                ++i;
            }
        }
        for (uint256 schemaValue = 0; schemaValue < totalSchemas; ) {
            if (totalPercentages[schemaValue] != MAX_PERCENT && totalPercentages[schemaValue] != 0)
                revert InvalidTotalPercentage();

            unchecked {
                ++schemaValue;
            }
        }
    }

    /**
     * @dev Returns the underlying asset address for the vToken
     * @param vToken vToken address
     * @return asset address of asset
     */
    function _getUnderlying(address vToken) internal view returns (address) {
        if (vToken == vBNB) {
            return WBNB;
        } else {
            return IVToken(vToken).underlying();
        }
    }
}

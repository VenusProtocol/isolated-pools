// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PoolRegistryInterface } from "../Pool/PoolRegistryInterface.sol";
import { MaxLoopsLimitHelper } from "../MaxLoopsLimitHelper.sol";
import { VTokenInterface } from "../VTokenInterfaces.sol";
import { VenusERC4626 } from "./VenusERC4626.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

/// @title VenusERC4626Factory
/// @notice Factory for creating VenusERC4626 contracts
contract VenusERC4626Factory is AccessControlledV8, MaxLoopsLimitHelper {
    /// @notice A constant salt value used for deterministic contract deployment
    bytes32 public constant SALT = keccak256("Venus-ERC4626 Vault");

    /// @notice The beacon contract for VenusERC4626 proxies
    UpgradeableBeacon public beacon;

    /// @notice The Pool Registry contract
    PoolRegistryInterface public poolRegistry;

    /// @notice The address that will receive the liquidity mining rewards
    address public rewardRecipient;

    // @notice Map of vaults created by this factory
    mapping(address vToken => ERC4626Upgradeable vault) public createdVaults;

    /// @notice Emitted when a new ERC4626 vault has been created
    /// @param vToken The vToken used by the vault
    /// @param vault The vault that was created
    event CreateERC4626(VTokenInterface indexed vToken, ERC4626Upgradeable indexed vault);

    /// @notice Emitted when the reward recipient address is updated.
    /// @param oldRecipient The previous reward recipient address.
    /// @param newRecipient The new reward recipient address.
    event RewardRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    /// @notice Thrown when the provided vToken is not registered in PoolRegistry
    error VenusERC4626Factory__InvalidVToken();

    /// @notice Thrown when a VenusERC4626 already exists for the provided vToken
    error VenusERC4626Factory__ERC4626AlreadyExists();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param accessControlManager Address of the ACM contract
    /// @param poolRegistryAddress Address of the Pool Registry contract
    /// @param rewardRecipientAddress Reward recipient address
    /// @param venusERC4626Implementation Address of the VenusERC4626 implementation contract
    /// @param loopsLimitNumber The loops limit for the MaxLoopsLimit helper
    function initialize(
        address accessControlManager,
        address poolRegistryAddress,
        address rewardRecipientAddress,
        address venusERC4626Implementation,
        uint256 loopsLimitNumber
    ) external initializer {
        ensureNonzeroAddress(accessControlManager);
        ensureNonzeroAddress(poolRegistryAddress);
        ensureNonzeroAddress(rewardRecipientAddress);
        ensureNonzeroAddress(venusERC4626Implementation);

        __AccessControlled_init(accessControlManager);

        poolRegistry = PoolRegistryInterface(poolRegistryAddress);
        rewardRecipient = rewardRecipientAddress;
        _setMaxLoopsLimit(loopsLimitNumber);

        // Deploy the upgradeable beacon with the initial implementation
        beacon = new UpgradeableBeacon(venusERC4626Implementation);

        // The owner of the beacon will initially be the owner of the factory
        beacon.transferOwnership(owner());
    }

    /// @notice Sets a new reward recipient address
    /// @param newRecipient The address of the new reward recipient
    /// @custom:access Controlled by ACM
    /// @custom:error ZeroAddressNotAllowed is thrown when the new recipient address is zero
    /// @custom:event RewardRecipientUpdated is emitted when the reward recipient address is updated
    function setRewardRecipient(address newRecipient) external {
        _checkAccessAllowed("setRewardRecipient(address)");
        ensureNonzeroAddress(newRecipient);

        emit RewardRecipientUpdated(rewardRecipient, newRecipient);
        rewardRecipient = newRecipient;
    }

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param loopsLimit Number of loops limit
     * @custom:event Emits MaxLoopsLimitUpdated event on success
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    /// @notice Creates a VenusERC4626 vault for a given asset and comptroller
    /// @param vToken The vToken address to create the vault
    /// @return vault The deployed VenusERC4626 vault
    /// @custom:error ZeroAddressNotAllowed is thrown when the vToken address is zero
    /// @custom:error VenusERC4626Factory__InvalidVToken is thrown when the provided vToken is not supported by the poolRegistry
    /// @custom:error VenusERC4626Factory__ERC4626AlreadyExists is thrown when this factory already created a VenusERC4626 for the provided vToken
    /// @custom:event CreateERC4626 is emitted when the ERC4626 wrapper is created
    function createERC4626(address vToken) external returns (ERC4626Upgradeable vault) {
        ensureNonzeroAddress(vToken);

        if (address(createdVaults[vToken]) != address(0)) {
            revert VenusERC4626Factory__ERC4626AlreadyExists();
        }

        VTokenInterface vToken_ = VTokenInterface(vToken);

        address comptroller = address(vToken_.comptroller());

        if (vToken != poolRegistry.getVTokenForAsset(comptroller, vToken_.underlying())) {
            revert VenusERC4626Factory__InvalidVToken();
        }

        VenusERC4626 venusERC4626 = VenusERC4626(
            address(
                new BeaconProxy{ salt: SALT }(
                    address(beacon),
                    abi.encodeWithSelector(VenusERC4626.initialize.selector, vToken)
                )
            )
        );

        // TODO replace this with `_accessControlManager` when the inherited attribute is internal instead of private
        address accessControlManager = address(this.accessControlManager());
        venusERC4626.initialize2(accessControlManager, rewardRecipient, maxLoopsLimit, owner());

        vault = ERC4626Upgradeable(address(venusERC4626));

        createdVaults[vToken] = vault;

        emit CreateERC4626(vToken_, vault);
    }

    /// @notice Predicts the vault address for a given vToken
    /// @param vToken The vToken address
    /// @return The precomputed vault address
    function computeVaultAddress(address vToken) public view returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                SALT,
                                keccak256(
                                    abi.encodePacked(
                                        type(BeaconProxy).creationCode,
                                        abi.encode(
                                            address(beacon),
                                            abi.encodeWithSelector(VenusERC4626.initialize.selector, vToken)
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            );
    }
}

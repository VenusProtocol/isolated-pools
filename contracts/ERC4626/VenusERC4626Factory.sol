// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PoolRegistryInterface } from ".././Pool/PoolRegistryInterface.sol";
import { VTokenInterface } from "../VTokenInterfaces.sol";
import { VenusERC4626 } from "./VenusERC4626.sol";
import { ensureNonzeroAddress } from ".././lib/validators.sol";

/// @title VenusERC4626Factory
/// @notice Factory for creating VenusERC4626 contracts
contract VenusERC4626Factory is Ownable2StepUpgradeable, AccessControlledV8 {
    /// @notice A constant salt value used for deterministic contract deployment
    bytes32 public constant SALT = keccak256("Venus-ERC4626 Vault");

    /// @notice The beacon contract for VenusERC4626 proxies
    UpgradeableBeacon public beacon;

    /// @notice The Pool Registry contract
    PoolRegistryInterface public poolRegistry;

    /// @notice The address that will receive the liquidity mining rewards
    address public rewardRecipient;

    /// @notice The maximum number of loops allowed in the MaxLoopsLimit helper
    uint256 public loopsLimit;

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
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager);

        poolRegistry = PoolRegistryInterface(poolRegistryAddress);
        rewardRecipient = rewardRecipientAddress;
        loopsLimit = loopsLimitNumber;

        // Deploy the upgradeable beacon with the initial implementation
        beacon = new UpgradeableBeacon(venusERC4626Implementation);
    }

    /// @notice Sets a new reward recipient address
    /// @param newRecipient The address of the new reward recipient
    /// @custom:access Requires access control
    /// @custom:error ZeroAddressNotAllowed is thrown when the new recipient address is zero
    /// @custom:event RewardRecipientUpdated is emitted when the reward recipient address is updated
    function setRewardRecipient(address newRecipient) external {
        _checkAccessAllowed("setRewardRecipient(address)");
        ensureNonzeroAddress(newRecipient);

        emit RewardRecipientUpdated(rewardRecipient, newRecipient);
        rewardRecipient = newRecipient;
    }

    /// @notice Creates a VenusERC4626 vault for a given asset and comptroller
    /// @param vToken The vToken address to create the vault
    /// @return vault The deployed VenusERC4626 vault
    function createERC4626(address vToken) external returns (ERC4626Upgradeable vault) {
        ensureNonzeroAddress(vToken);

        VTokenInterface vToken_ = VTokenInterface(vToken);

        address comptroller = address(vToken_.comptroller());

        if (vToken != poolRegistry.getVTokenForAsset(comptroller, vToken_.underlying())) {
            revert VenusERC4626Factory__InvalidVToken();
        }

        vault = ERC4626Upgradeable(
            address(
                new BeaconProxy{ salt: SALT }(
                    address(beacon),
                    abi.encodeWithSelector(VenusERC4626.initialize.selector, vToken, rewardRecipient, loopsLimit)
                )
            )
        );

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
                                            abi.encodeWithSelector(
                                                VenusERC4626.initialize.selector,
                                                vToken,
                                                rewardRecipient,
                                                loopsLimit
                                            )
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

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { ERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PoolRegistryInterface } from ".././Pool/PoolRegistryInterface.sol";
import { VenusERC4626 } from "./VenusERC4626.sol";
import { ensureNonzeroAddress } from ".././lib/validators.sol";

/// @title VenusERC4626Factory
/// @notice Factory for creating VenusERC4626 contracts
contract VenusERC4626Factory is Ownable2StepUpgradeable, AccessControlledV8 {
    using SafeERC20Upgradeable for ERC20Upgradeable;

    /// @notice The beacon contract for VenusERC4626 proxies
    UpgradeableBeacon public beacon;

    /// @notice The Pool Registry contract
    PoolRegistryInterface public poolRegistry;

    /// @notice The address that will receive the liquidity mining rewards
    address public rewardRecipient;

    /// @notice The loops limit for the MaxLoopsLimit helper
    uint256 public loopsLimit;

    /// @notice Emitted when a new ERC4626 vault has been created
    /// @param asset The base asset used by the vault
    /// @param vault The vault that was created
    event CreateERC4626(address indexed asset, ERC4626Upgradeable indexed vault);

    /// @notice Emitted when the reward recipient address is updated.
    /// @param oldRecipient The previous reward recipient address.
    /// @param newRecipient The new reward recipient address.
    event RewardRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    /// @notice Thrown when the provided comptroller is invalid (not registered in PoolRegistry)
    error VenusERC4626Factory__InvalidComptroller();

    /// @notice Thrown when trying to deploy a VenusERC4626 vault using an asset without a vToken
    error VenusERC4626Factory__VTokenNonexistent();

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
        // checks are missing
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
    /// @param comptroller The comptroller's address to which asset belongs
    /// @param asset The ERC20 asset address belongs to the comptroller
    /// @return vault The deployed VenusERC4626 vault
    function createERC4626(address comptroller, address asset) external returns (ERC4626Upgradeable vault) {
        if (poolRegistry.getPoolByComptroller(comptroller).comptroller == address(0)) {
            revert VenusERC4626Factory__InvalidComptroller();
        }

        address vToken = poolRegistry.getVTokenForAsset(comptroller, asset);
        if (vToken == address(0)) {
            revert VenusERC4626Factory__VTokenNonexistent();
        }

        vault = ERC4626Upgradeable(
            address(
                new BeaconProxy(
                    address(beacon),
                    abi.encodeWithSelector(VenusERC4626.initialize.selector, vToken, rewardRecipient, loopsLimit)
                )
            )
        );

        emit CreateERC4626(asset, vault);
    }
}

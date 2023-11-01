// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/**
 * @title IProtocolShareReserve
 * @author Venus
 * @notice Interface implemented by `ProtocolShareReserve`.
 */
interface IProtocolShareReserve {
    function updateAssetsState(address comptroller, address asset) external;
}

// interface IMockProtocolShareReserve {
//     enum Schema {
//         PROTOCOL_RESERVES,
//         ADDITIONAL_REVENUE
//     }

//     struct DistributionConfig {
//         Schema schema;
//         /// @dev percenatge is represented without any scale
//         uint8 percentage;
//         address destination;
//     }
//     function updateAssetsState(address comptroller, address asset) external;
//     function addOrUpdateDistributionConfigs(DistributionConfig[] calldata configs) external;
//     function acceptOwnership() external;
//     function releaseFunds(address comptroller, address asset, uint256 amount) external;
//     function distributionTargets(uint256 index) external view returns (DistributionConfig memory);
// }

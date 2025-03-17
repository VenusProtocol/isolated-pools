// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { VenusERC4626 } from "./VenusERC4626.sol";
import { IComptroller } from "./Interfaces/IComptroller.sol";
import { ERC4626Factory } from "./Base/ERC4626Factory.sol";
import { VToken } from "../VToken.sol";
import { PoolRegistryInterface } from ".././Pool/PoolRegistryInterface.sol";

/// @title VenusERC4626Factory
/// @notice Factory for creating VenusERC4626 contracts
contract VenusERC4626Factory is ERC4626Factory {
    using SafeERC20 for ERC20;

    /// -----------------------------------------------------------------------
    /// Immutable params
    /// -----------------------------------------------------------------------

    /// @notice The address that will receive the liquidity mining rewards (if any)
    address public immutable REWARD_RECIPIENT;

    /// @notice The Venus Comptroller contract
    IComptroller public immutable COMPTROLLER;

    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    /// @notice Thrown when trying to deploy a VenusERC4626 vault using an asset without a vToken
    error VenusERC4626Factory__VTokenNonexistent();

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------
    constructor(IComptroller comptroller_, address rewardRecipient_) {
        COMPTROLLER = comptroller_;
        REWARD_RECIPIENT = rewardRecipient_;
    }

    /// -----------------------------------------------------------------------
    /// External functions
    /// -----------------------------------------------------------------------

    /// @inheritdoc ERC4626Factory
    function createERC4626(ERC20 asset) external virtual override returns (ERC4626 vault) {
        VToken vToken = VToken(
            PoolRegistryInterface(COMPTROLLER.poolRegistry()).getVTokenForAsset(address(COMPTROLLER), address(asset))
        );
        if (address(vToken) == address(0)) {
            revert VenusERC4626Factory__VTokenNonexistent();
        }

        vault = new VenusERC4626{ salt: bytes32(0) }(vToken, REWARD_RECIPIENT);

        emit CreateERC4626(asset, vault);
    }

    /// @inheritdoc ERC4626Factory
    function computeERC4626Address(ERC20 asset) external view virtual override returns (ERC4626 vault) {
        VToken vToken = VToken(
            PoolRegistryInterface(COMPTROLLER.poolRegistry()).getVTokenForAsset(address(COMPTROLLER), address(asset))
        );
        if (address(vToken) == address(0)) {
            revert VenusERC4626Factory__VTokenNonexistent();
        }
        vault = ERC4626(
            _computeCreate2Address(
                keccak256(
                    abi.encodePacked(
                        // Deployment bytecode:
                        type(VenusERC4626).creationCode,
                        // Constructor arguments:
                        abi.encode(asset, vToken, REWARD_RECIPIENT, COMPTROLLER)
                    )
                )
            )
        );
    }
}

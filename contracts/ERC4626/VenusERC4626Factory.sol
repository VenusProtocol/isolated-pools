// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { VenusERC4626 } from "./VenusERC4626.sol";
import { IComptroller } from "./Interfaces/IComptroller.sol";
import { ERC4626Factory } from "./Base/ERC4626Factory.sol";
import { VToken } from "../VToken.sol";
import { RewardDistributorInterface } from "./Interfaces/IRewardDistributor.sol"; // Interface for claiming rewards.

/// @title VenusERC4626Factory
/// @notice Factory for creating VenusERC4626 contracts
contract VenusERC4626Factory is ERC4626Factory {
    using SafeERC20 for ERC20;

    /// -----------------------------------------------------------------------
    /// Immutable params
    /// -----------------------------------------------------------------------

    /// @notice The XVS token contract
    ERC20 public immutable XVS;

    /// @notice The address that will receive the liquidity mining rewards (if any)
    address public immutable REWARD_RECIPIENT;

    /// @notice The Venus Comptroller contract
    IComptroller public immutable COMPTROLLER;

    /// @notice The reward distributor contract
    RewardDistributorInterface public immutable REWARD_DISTRIBUTOR;

    /// -----------------------------------------------------------------------
    /// Storage variables
    /// -----------------------------------------------------------------------

    /// @notice Maps underlying asset to the corresponding vToken
    mapping(ERC20 => VToken) public underlyingToVToken;

    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    /// @notice Thrown when trying to deploy a VenusERC4626 vault using an asset without a vToken
    error VenusERC4626Factory__VTokenNonexistent();

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------
    constructor(IComptroller comptroller_, address rewardRecipient_, ERC20 xvs_) {
        COMPTROLLER = comptroller_;
        REWARD_RECIPIENT = rewardRecipient_;
        XVS = xvs_;

        // Initialize with all valid vTokens from Comptroller
        _updateVTokenMappings(COMPTROLLER.getAllMarkets());
    }

    /// -----------------------------------------------------------------------
    /// External functions
    /// -----------------------------------------------------------------------

    /// @notice External function to update specific vTokens in the underlyingToVToken mapping.
    /// @param vTokens The addresses of vTokens to update.
    function updateUnderlyingToVToken(VToken[] calldata vTokens) external {
        _updateVTokenMappings(vTokens);
    }

    /// @inheritdoc ERC4626Factory
    function createERC4626(ERC20 asset) external virtual override returns (ERC4626 vault) {
        VToken vToken = underlyingToVToken[asset];
        if (address(vToken) == address(0)) {
            revert VenusERC4626Factory__VTokenNonexistent();
        }

        vault = new VenusERC4626{ salt: bytes32(0) }(
            asset,
            XVS,
            vToken,
            REWARD_RECIPIENT,
            COMPTROLLER,
            REWARD_DISTRIBUTOR
        );

        emit CreateERC4626(asset, vault);
    }

    /// @inheritdoc ERC4626Factory
    function computeERC4626Address(ERC20 asset) external view virtual override returns (ERC4626 vault) {
        vault = ERC4626(
            _computeCreate2Address(
                keccak256(
                    abi.encodePacked(
                        // Deployment bytecode:
                        type(VenusERC4626).creationCode,
                        // Constructor arguments:
                        abi.encode(asset, XVS, underlyingToVToken[asset], REWARD_RECIPIENT, COMPTROLLER)
                    )
                )
            )
        );
    }

    /// @notice Function to update the underlyingToVToken mapping.
    /// @param vTokens The array of vToken addresses to update.
    function _updateVTokenMappings(VToken[] memory vTokens) private {
        VToken[] memory allMarkets = COMPTROLLER.getAllMarkets();

        for (uint256 i; i < vTokens.length; ) {
            VToken vToken = vTokens[i];

            // Check if the vToken exists in the Comptroller's markets
            bool isValid = false;
            for (uint256 j; j < allMarkets.length; ) {
                if (address(allMarkets[j]) == address(vToken)) {
                    isValid = true;
                    break;
                }
                unchecked {
                    ++j;
                }
            }

            // If valid, update mapping
            if (isValid) {
                underlyingToVToken[ERC20(vToken.underlying())] = vToken;
            }

            unchecked {
                ++i;
            }
        }
    }
}

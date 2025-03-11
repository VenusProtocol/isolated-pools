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
    ERC20 public immutable xvs;

    /// @notice The address that will receive the liquidity mining rewards (if any)
    address public immutable rewardRecipient;

    /// @notice The Venus Comptroller contract
    IComptroller public immutable comptroller;

    /// @notice The reward distributor contract
    RewardDistributorInterface public immutable rewardDistributor;

    /// @notice The Venus vBNB address
    address public immutable vBNBAddress;

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
    constructor(IComptroller comptroller_, address vBNBAddress_, address rewardRecipient_, ERC20 xvs_) {
        comptroller = comptroller_;
        vBNBAddress = vBNBAddress_;
        rewardRecipient = rewardRecipient_;
        xvs = xvs_;

        // Initialize underlyingToVToken
        VToken[] memory allVTokens = comptroller_.getAllMarkets();
        uint256 numVTokens = allVTokens.length;
        VToken vToken;
        for (uint256 i; i < numVTokens; ) {
            vToken = allVTokens[i];
            if (address(vToken) != vBNBAddress_) {
                underlyingToVToken[ERC20(vToken.underlying())] = vToken;
            }

            unchecked {
                ++i;
            }
        }
    }

    /// -----------------------------------------------------------------------
    /// External functions
    /// -----------------------------------------------------------------------

    /// @notice Updates the underlyingToVToken mapping in order to support newly added vTokens
    /// @dev This is needed because Venus doesn't have an onchain registry of vTokens corresponding to underlying assets.
    /// @param newVTokenIndices The indices of the new vTokens to register in the comptroller.allMarkets array
    function updateUnderlyingToVToken(uint256[] calldata newVTokenIndices) external {
        VToken[] memory allVTokens = comptroller.getAllMarkets();
        uint256 numVTokens = newVTokenIndices.length;
        VToken vToken;
        uint256 index;

        for (uint256 i; i < numVTokens; ) {
            index = newVTokenIndices[i];
            vToken = allVTokens[index];

            if (address(vToken) != vBNBAddress) {
                underlyingToVToken[ERC20(vToken.underlying())] = vToken;
            }

            unchecked {
                ++i;
            }
        }
    }

    /// @inheritdoc ERC4626Factory
    function createERC4626(ERC20 asset) external virtual override returns (ERC4626 vault) {
        VToken vToken = underlyingToVToken[asset];
        if (address(vToken) == address(0)) {
            revert VenusERC4626Factory__VTokenNonexistent();
        }

        vault = new VenusERC4626{ salt: bytes32(0) }(
            asset,
            xvs,
            vToken,
            rewardRecipient,
            comptroller,
            rewardDistributor
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
                        abi.encode(asset, xvs, underlyingToVToken[asset], rewardRecipient, comptroller)
                    )
                )
            )
        );
    }
}

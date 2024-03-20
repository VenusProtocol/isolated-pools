// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ComptrollerInterface } from "../ComptrollerInterface.sol";
import { IRiskFund } from "./IRiskFund.sol";
import { ReserveHelpers } from "./ReserveHelpers.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { VToken } from "../VToken.sol";
import { ComptrollerViewInterface } from "../ComptrollerInterface.sol";
import { Comptroller } from "../Comptroller.sol";
import { PoolRegistry } from "../Pool/PoolRegistry.sol";
import { IPancakeswapV2Router } from "../IPancakeswapV2Router.sol";
import { MaxLoopsLimitHelper } from "../MaxLoopsLimitHelper.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ApproveOrRevert } from "../lib/ApproveOrRevert.sol";

/**
 * @title RiskFund
 * @author Venus
 * @notice Contract with basic features to track/hold different assets for different Comptrollers.
 * @dev This contract does not support BNB.
 */
contract RiskFund is AccessControlledV8, ExponentialNoError, ReserveHelpers, MaxLoopsLimitHelper, IRiskFund {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ApproveOrRevert for IERC20Upgradeable;

    address public convertibleBaseAsset;
    address public shortfall;
    address public pancakeSwapRouter;
    uint256 public minAmountToConvert;

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when shortfall contract address is updated
    event ShortfallContractUpdated(address indexed oldShortfallContract, address indexed newShortfallContract);

    /// @notice Emitted when convertible base asset is updated
    event ConvertibleBaseAssetUpdated(address indexed oldConvertibleBaseAsset, address indexed newConvertibleBaseAsset);

    /// @notice Emitted when PancakeSwap router contract address is updated
    event PancakeSwapRouterUpdated(address indexed oldPancakeSwapRouter, address indexed newPancakeSwapRouter);

    /// @notice Emitted when minimum amount to convert is updated
    event MinAmountToConvertUpdated(uint256 oldMinAmountToConvert, uint256 newMinAmountToConvert);

    /// @notice Emitted when pools assets are swapped
    event SwappedPoolsAssets(address[] markets, uint256[] amountsOutMin, uint256 totalAmount);

    /// @notice Emitted when reserves are transferred for auction
    event TransferredReserveForAuction(address indexed comptroller, uint256 amount);

    /// @dev Note that the contract is upgradeable. Use initialize() or reinitializers
    ///      to set the state variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address corePoolComptroller_,
        address vbnb_,
        address nativeWrapped_
    ) ReserveHelpers(corePoolComptroller_, vbnb_, nativeWrapped_) {
        _disableInitializers();
    }

    /**
     * @notice Initializes the deployer to owner.
     * @param pancakeSwapRouter_ Address of the PancakeSwap router
     * @param minAmountToConvert_ Minimum amount assets must be worth to convert into base asset
     * @param convertibleBaseAsset_ Address of the base asset
     * @param accessControlManager_ Address of the access control contract
     * @param loopsLimit_ Limit for the loops in the contract to avoid DOS
     * @custom:error ZeroAddressNotAllowed is thrown when PCS router address is zero
     * @custom:error ZeroAddressNotAllowed is thrown when convertible base asset address is zero
     */
    function initialize(
        address pancakeSwapRouter_,
        uint256 minAmountToConvert_,
        address convertibleBaseAsset_,
        address accessControlManager_,
        uint256 loopsLimit_
    ) external initializer {
        ensureNonzeroAddress(pancakeSwapRouter_);
        ensureNonzeroAddress(convertibleBaseAsset_);
        require(minAmountToConvert_ > 0, "Risk Fund: Invalid min amount to convert");
        require(loopsLimit_ > 0, "Risk Fund: Loops limit can not be zero");

        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);

        pancakeSwapRouter = pancakeSwapRouter_;
        minAmountToConvert = minAmountToConvert_;
        convertibleBaseAsset = convertibleBaseAsset_;

        _setMaxLoopsLimit(loopsLimit_);
    }

    /**
     * @notice Pool registry setter
     * @param poolRegistry_ Address of the pool registry
     * @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
     */
    function setPoolRegistry(address poolRegistry_) external onlyOwner {
        ensureNonzeroAddress(poolRegistry_);
        address oldPoolRegistry = poolRegistry;
        poolRegistry = poolRegistry_;
        emit PoolRegistryUpdated(oldPoolRegistry, poolRegistry_);
    }

    /**
     * @notice Shortfall contract address setter
     * @param shortfallContractAddress_ Address of the auction contract
     * @custom:error ZeroAddressNotAllowed is thrown when shortfall contract address is zero
     */
    function setShortfallContractAddress(address shortfallContractAddress_) external onlyOwner {
        ensureNonzeroAddress(shortfallContractAddress_);

        address oldShortfallContractAddress = shortfall;
        shortfall = shortfallContractAddress_;
        emit ShortfallContractUpdated(oldShortfallContractAddress, shortfallContractAddress_);
    }

    /**
     * @notice PancakeSwap router address setter
     * @param pancakeSwapRouter_ Address of the PancakeSwap router
     * @custom:error ZeroAddressNotAllowed is thrown when PCS router address is zero
     */
    function setPancakeSwapRouter(address pancakeSwapRouter_) external onlyOwner {
        ensureNonzeroAddress(pancakeSwapRouter_);
        address oldPancakeSwapRouter = pancakeSwapRouter;
        pancakeSwapRouter = pancakeSwapRouter_;
        emit PancakeSwapRouterUpdated(oldPancakeSwapRouter, pancakeSwapRouter_);
    }

    /**
     * @notice Min amount to convert setter
     * @param minAmountToConvert_ Min amount to convert.
     */
    function setMinAmountToConvert(uint256 minAmountToConvert_) external {
        _checkAccessAllowed("setMinAmountToConvert(uint256)");
        require(minAmountToConvert_ > 0, "Risk Fund: Invalid min amount to convert");
        uint256 oldMinAmountToConvert = minAmountToConvert;
        minAmountToConvert = minAmountToConvert_;
        emit MinAmountToConvertUpdated(oldMinAmountToConvert, minAmountToConvert_);
    }

    /**
     * @notice Sets a new convertible base asset
     * @param _convertibleBaseAsset Address for new convertible base asset.
     */
    function setConvertibleBaseAsset(address _convertibleBaseAsset) external {
        _checkAccessAllowed("setConvertibleBaseAsset(address)");
        require(_convertibleBaseAsset != address(0), "Risk Fund: new convertible base asset address invalid");

        address oldConvertibleBaseAsset = convertibleBaseAsset;
        convertibleBaseAsset = _convertibleBaseAsset;

        emit ConvertibleBaseAssetUpdated(oldConvertibleBaseAsset, _convertibleBaseAsset);
    }

    /**
     * @notice Swap array of pool assets into base asset's tokens of at least a minimum amount
     * @param markets Array of vTokens whose assets to swap for base asset
     * @param amountsOutMin Minimum amount to receive for swap
     * @param paths A path consisting of PCS token pairs for each swap
     * @param deadline Deadline for the swap
     * @return Number of swapped tokens
     * @custom:error ZeroAddressNotAllowed is thrown if PoolRegistry contract address is not configured
     */
    function swapPoolsAssets(
        address[] calldata markets,
        uint256[] calldata amountsOutMin,
        address[][] calldata paths,
        uint256 deadline
    ) external override nonReentrant returns (uint256) {
        _checkAccessAllowed("swapPoolsAssets(address[],uint256[],address[][],uint256)");
        require(deadline >= block.timestamp, "Risk fund: deadline passed");
        address poolRegistry_ = poolRegistry;
        ensureNonzeroAddress(poolRegistry_);
        require(markets.length == amountsOutMin.length, "Risk fund: markets and amountsOutMin are unequal lengths");
        require(markets.length == paths.length, "Risk fund: markets and paths are unequal lengths");

        uint256 totalAmount;
        uint256 marketsCount = markets.length;

        _ensureMaxLoops(marketsCount);

        for (uint256 i; i < marketsCount; ++i) {
            address comptroller = address(VToken(markets[i]).comptroller());

            PoolRegistry.VenusPool memory pool = PoolRegistry(poolRegistry_).getPoolByComptroller(comptroller);
            require(pool.comptroller == comptroller, "comptroller doesn't exist pool registry");
            require(Comptroller(comptroller).isMarketListed(VToken(markets[i])), "market is not listed");

            uint256 swappedTokens = _swapAsset(VToken(markets[i]), comptroller, amountsOutMin[i], paths[i]);
            _poolsAssetsReserves[comptroller][convertibleBaseAsset] += swappedTokens;
            assetsReserves[convertibleBaseAsset] += swappedTokens;
            totalAmount = totalAmount + swappedTokens;
        }

        emit SwappedPoolsAssets(markets, amountsOutMin, totalAmount);

        return totalAmount;
    }

    /**
     * @notice Transfer tokens for auction.
     * @param comptroller Comptroller of the pool.
     * @param amount Amount to be transferred to auction contract.
     * @return Number reserved tokens.
     */
    function transferReserveForAuction(
        address comptroller,
        uint256 amount
    ) external override nonReentrant returns (uint256) {
        address shortfall_ = shortfall;
        require(msg.sender == shortfall_, "Risk fund: Only callable by Shortfall contract");
        require(
            amount <= _poolsAssetsReserves[comptroller][convertibleBaseAsset],
            "Risk Fund: Insufficient pool reserve."
        );
        unchecked {
            _poolsAssetsReserves[comptroller][convertibleBaseAsset] =
                _poolsAssetsReserves[comptroller][convertibleBaseAsset] -
                amount;
        }
        unchecked {
            assetsReserves[convertibleBaseAsset] = assetsReserves[convertibleBaseAsset] - amount;
        }

        emit TransferredReserveForAuction(comptroller, amount);
        IERC20Upgradeable(convertibleBaseAsset).safeTransfer(shortfall_, amount);

        return amount;
    }

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param limit Limit for the max loops can execute at a time
     */
    function setMaxLoopsLimit(uint256 limit) external onlyOwner {
        _setMaxLoopsLimit(limit);
    }

    /**
     * @notice Get the Amount of the Base asset in the risk fund for the specific pool.
     * @param comptroller  Comptroller address(pool).
     * @return Base Asset's reserve in risk fund.
     */
    function getPoolsBaseAssetReserves(address comptroller) external view returns (uint256) {
        require(ComptrollerInterface(comptroller).isComptroller(), "Risk Fund: Comptroller address invalid");
        return _poolsAssetsReserves[comptroller][convertibleBaseAsset];
    }

    /**
     * @notice Update the reserve of the asset for the specific pool after transferring to risk fund.
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     */
    function updateAssetsState(address comptroller, address asset) public override(IRiskFund, ReserveHelpers) {
        super.updateAssetsState(comptroller, asset);
    }

    /**
     * @dev Swap single asset to base asset.
     * @param vToken VToken
     * @param comptroller Comptroller address
     * @param amountOutMin Minimum amount to receive for swap
     * @param path A path for the swap consisting of PCS token pairs
     * @return Number of swapped tokens.
     */
    function _swapAsset(
        VToken vToken,
        address comptroller,
        uint256 amountOutMin,
        address[] calldata path
    ) internal returns (uint256) {
        require(amountOutMin != 0, "RiskFund: amountOutMin must be greater than 0 to swap vToken");
        uint256 totalAmount;

        address underlyingAsset = vToken.underlying();
        address convertibleBaseAsset_ = convertibleBaseAsset;
        uint256 balanceOfUnderlyingAsset = _poolsAssetsReserves[comptroller][underlyingAsset];

        if (balanceOfUnderlyingAsset == 0) {
            return 0;
        }

        ResilientOracleInterface oracle = ComptrollerViewInterface(comptroller).oracle();
        oracle.updateAssetPrice(convertibleBaseAsset_);
        Exp memory baseAssetPrice = Exp({ mantissa: oracle.getPrice(convertibleBaseAsset_) });
        uint256 amountOutMinInUsd = mul_ScalarTruncate(baseAssetPrice, amountOutMin);

        require(amountOutMinInUsd >= minAmountToConvert, "RiskFund: minAmountToConvert violated");

        assetsReserves[underlyingAsset] -= balanceOfUnderlyingAsset;
        _poolsAssetsReserves[comptroller][underlyingAsset] -= balanceOfUnderlyingAsset;

        if (underlyingAsset != convertibleBaseAsset_) {
            require(path[0] == underlyingAsset, "RiskFund: swap path must start with the underlying asset");
            require(
                path[path.length - 1] == convertibleBaseAsset_,
                "RiskFund: finally path must be convertible base asset"
            );
            address pancakeSwapRouter_ = pancakeSwapRouter;
            IERC20Upgradeable(underlyingAsset).approveOrRevert(pancakeSwapRouter_, 0);
            IERC20Upgradeable(underlyingAsset).approveOrRevert(pancakeSwapRouter_, balanceOfUnderlyingAsset);
            uint256[] memory amounts = IPancakeswapV2Router(pancakeSwapRouter_).swapExactTokensForTokens(
                balanceOfUnderlyingAsset,
                amountOutMin,
                path,
                address(this),
                block.timestamp
            );
            totalAmount = amounts[path.length - 1];
        } else {
            totalAmount = balanceOfUnderlyingAsset;
        }

        return totalAmount;
    }
}

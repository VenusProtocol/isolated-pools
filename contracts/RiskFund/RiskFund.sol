// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../VToken.sol";
import "../Pool/PoolRegistry.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../IPancakeswapV2Router.sol";
import "./ReserveHelpers.sol";

/**
 * @dev This contract does not support BNB.
 */
contract RiskFund is Ownable2StepUpgradeable, ExponentialNoError, ReserveHelpers {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private poolRegistry;
    address private pancakeSwapRouter;
    uint256 private minAmountToConvert;
    address private convertibleBaseAsset;
    address private accessControl;
    address private shortfall;

    // Store base asset's reserve for specific pool
    mapping(address => uint256) private poolReserves;

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when convertible base asset address is updated
    event ConvertableBaseAssetUpdated(address indexed oldBaseAsset, address indexed newBaseAsset);

    /// @notice Emitted when shortfall contract address is updated
    event ShortfallContractUpdated(address indexed oldShortfallContract, address indexed newShortfallContract);

    /// @notice Emitted when PancakeSwap router contract address is updated
    event PancakeSwapRouterUpdated(address indexed oldPancakeSwapRouter, address indexed newPancakeSwapRouter);

    /// @notice Emitted when min amount out for PancakeSwap is updated
    event AmountOutMinUpdated(uint256 oldAmountOutMin, uint256 newAmountOutMin);

    /// @notice Emitted when minimum amount to convert is updated
    event MinAmountToConvertUpdated(uint256 oldMinAmountToConvert, uint256 newMinAmountToConvert);

    /// @dev Note that the contract is upgradeable. Use initialize() or reinitializers
    ///      to set the state variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param _pancakeSwapRouter Address of the PancakeSwap router
     * @param _minAmountToConvert Asset should be worth of min amount to convert into base asset
     * @param _convertibleBaseAsset Address of the base asset
     * @param _accessControl Address of the access control contract.
     */
    function initialize(
        address _pancakeSwapRouter,
        uint256 _minAmountToConvert,
        address _convertibleBaseAsset,
        address _accessControl
    ) external initializer {
        require(_pancakeSwapRouter != address(0), "Risk Fund: Pancake swap address invalid");
        require(_convertibleBaseAsset != address(0), "Risk Fund: Base asset address invalid");
        require(_minAmountToConvert > 0, "Risk Fund: Invalid min amout to convert");

        __Ownable2Step_init();

        pancakeSwapRouter = _pancakeSwapRouter;
        minAmountToConvert = _minAmountToConvert;
        convertibleBaseAsset = _convertibleBaseAsset;
        accessControl = _accessControl;
    }

    /**
     * @dev Pool registry setter
     * @param _poolRegistry Address of the pool registry.
     */
    function setPoolRegistry(address _poolRegistry) external onlyOwner {
        require(_poolRegistry != address(0), "Risk Fund: Pool registry address invalid");
        address oldPoolRegistry = poolRegistry;
        poolRegistry = _poolRegistry;
        emit PoolRegistryUpdated(oldPoolRegistry, _poolRegistry);
    }

    /**
     * @dev Convertible base asset setter
     * @param _convertibleBaseAsset Address of the asset.
     */
    function setConvertableBaseAsset(address _convertibleBaseAsset) external onlyOwner {
        require(_convertibleBaseAsset != address(0), "Risk Fund: Asset address invalid");
        address oldBaseAsset = convertibleBaseAsset;
        convertibleBaseAsset = _convertibleBaseAsset;
        emit ConvertableBaseAssetUpdated(oldBaseAsset, _convertibleBaseAsset);
    }

    /**
     * @dev Shortfall contract address setter
     * @param _shortfallContractAddress Address of the auction contract.
     */
    function setShortfallContractAddress(address _shortfallContractAddress) external onlyOwner {
        require(_shortfallContractAddress != address(0), "Risk Fund: Shortfall contract address invalid");
        address oldShortfallContractAddress = shortfall;
        shortfall = _shortfallContractAddress;
        emit ShortfallContractUpdated(oldShortfallContractAddress, _shortfallContractAddress);
    }

    /**
     * @dev PancakeSwap router address setter
     * @param _pancakeSwapRouter Address of the PancakeSwap router.
     */
    function setPancakeSwapRouter(address _pancakeSwapRouter) external onlyOwner {
        require(_pancakeSwapRouter != address(0), "Risk Fund: PancakeSwap address invalid");
        address oldPancakeSwapRouter = pancakeSwapRouter;
        pancakeSwapRouter = _pancakeSwapRouter;
        emit PancakeSwapRouterUpdated(oldPancakeSwapRouter, _pancakeSwapRouter);
    }

    /**
     * @dev Min amount to convert setter
     * @param _minAmountToConvert Min amout to convert.
     */
    function setMinAmountToConvert(uint256 _minAmountToConvert) external onlyOwner {
        require(_minAmountToConvert > 0, "Risk Fund: Invalid min amout to convert");
        uint256 oldMinAmountToConvert = minAmountToConvert;
        minAmountToConvert = _minAmountToConvert;
        emit MinAmountToConvertUpdated(oldMinAmountToConvert, _minAmountToConvert);
    }

    /**
     * @notice Swap array of pool assets into base asset's tokens of at least a mininum amount.
     * @param underlyingAssets Array of assets to swap for base asset
     * @param amountsOutMin Minimum amount to recieve for swap
     * @return Number of swapped tokens.
     */
    function swapPoolsAssets(address[] calldata underlyingAssets, uint256[] calldata amountsOutMin)
        external
        returns (uint256)
    {
        bool canSwapPoolsAsset = AccessControlManager(accessControl).isAllowedToCall(
            msg.sender,
            "swapPoolsAssets(address[],uint256[])"
        );
        require(canSwapPoolsAsset, "Risk fund: Not authorized to swap pool assets.");
        require(poolRegistry != address(0), "Risk fund: Invalid pool registry.");
        require(
            underlyingAssets.length == amountsOutMin.length,
            "Risk fund: underlyingAssets and amountsOutMin are unequal lengths"
        );

        uint256 totalAmount;
        uint256 underlyingAssetsCount = underlyingAssets.length;
        for (uint256 i; i < underlyingAssetsCount; ++i) {
            VToken vToken = VToken(underlyingAssets[i]);
            address comptroller = address(vToken.comptroller());
            uint256 swappedTokens = _swapAsset(vToken, comptroller, amountsOutMin[i]);
            poolReserves[comptroller] = poolReserves[comptroller] + swappedTokens;
            totalAmount = totalAmount + swappedTokens;
        }

        return totalAmount;
    }

    /**
     * @dev Transfer tokens for auction.
     * @param comptroller Comptroller of the pool.
     * @param amount Amount to be transferred to auction contract.
     * @return Number reserved tokens.
     */
    function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256) {
        require(msg.sender == shortfall, "Risk fund: Only callable by Shortfall contract");
        require(amount <= poolReserves[comptroller], "Risk Fund: Insufficient pool reserve.");
        poolReserves[comptroller] = poolReserves[comptroller] - amount;
        IERC20Upgradeable(convertibleBaseAsset).safeTransfer(shortfall, amount);
        return amount;
    }

    /**
     * @dev Get pool reserve by pool id.
     * @param comptroller Comptroller address of the pool.
     * @return Number of reserved tokens.
     */
    function getPoolReserve(address comptroller) external view returns (uint256) {
        return poolReserves[comptroller];
    }

    /**
     * @dev Swap single asset to base asset.
     * @param vToken VToken
     * @param comptroller Comptroller address
     * @param amountOutMin Minimum amount to receive for swap
     * @return Number of swapped tokens.
     */
    function _swapAsset(
        VToken vToken,
        address comptroller,
        uint256 amountOutMin
    ) internal returns (uint256) {
        require(amountOutMin != 0, "RiskFund: amountOutMin must be greater than 0 to swap vToken");
        uint256 totalAmount;

        address underlyingAsset = VTokenInterface(address(vToken)).underlying();
        uint256 balanceOfUnderlyingAsset = poolsAssetsReserves[comptroller][underlyingAsset];

        ComptrollerViewInterface(comptroller).oracle().updatePrice(address(vToken));

        uint256 underlyingAssetPrice = ComptrollerViewInterface(comptroller).oracle().getUnderlyingPrice(
            address(vToken)
        );

        if (balanceOfUnderlyingAsset > 0) {
            Exp memory oraclePrice = Exp({ mantissa: underlyingAssetPrice });
            uint256 amountInUsd = mul_ScalarTruncate(oraclePrice, balanceOfUnderlyingAsset);

            if (amountInUsd >= minAmountToConvert) {
                assetsReserves[underlyingAsset] -= balanceOfUnderlyingAsset;
                poolsAssetsReserves[comptroller][underlyingAsset] -= balanceOfUnderlyingAsset;

                if (underlyingAsset != convertibleBaseAsset) {
                    address[] memory path = new address[](2);
                    path[0] = underlyingAsset;
                    path[1] = convertibleBaseAsset;
                    IERC20Upgradeable(underlyingAsset).safeApprove(pancakeSwapRouter, 0);
                    IERC20Upgradeable(underlyingAsset).safeApprove(pancakeSwapRouter, balanceOfUnderlyingAsset);
                    uint256[] memory amounts = IPancakeswapV2Router(pancakeSwapRouter).swapExactTokensForTokens(
                        balanceOfUnderlyingAsset,
                        amountOutMin,
                        path,
                        address(this),
                        block.timestamp
                    );
                    totalAmount = amounts[1];
                } else {
                    totalAmount = balanceOfUnderlyingAsset;
                }
            }
        }
        return totalAmount;
    }
}

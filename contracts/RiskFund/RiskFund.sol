// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../VToken.sol";
import "../Pool/PoolRegistry.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../IPancakeswapV2Router.sol";
import "../Pool/PoolRegistry.sol";
import "./ReserveHelpers.sol";

/**
 * @dev This contract does not support BNB.
 */
contract RiskFund is Ownable2StepUpgradeable, ExponentialNoError, ReserveHelpers {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private poolRegistry;
    address private pancakeSwapRouter;
    uint256 private minAmountToConvert;
    uint256 private amountOutMin;
    address private convertableBaseAsset;
    address private auctionContractAddress;
    address private accessControl;

    // Store base asset's reserve for specific pool
    mapping(address => uint256) private poolReserves;

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when convertable base asset address is updated
    event ConvertableBaseAssetUpdated(address indexed oldBaseAsset, address indexed newBaseAsset);

    /// @notice Emitted when auction contract address is updated
    event AuctionContractUpdated(address indexed oldAuctionContract, address indexed newAuctionContract);

    /// @notice Emitted when PancakeSwap router contract address is updated
    event PancakeSwapRouterUpdated(address indexed oldPancakeSwapRouter, address indexed newPancakeSwapRouter);

    /// @notice Emitted when min amount out for PancakeSwap is updated
    event AmountOutMinUpdated(uint256 oldAmountOutMin, uint256 newAmountOutMin);

    /// @notice Emitted when minimum amount to convert is updated
    event MinAmountToConvertUpdated(uint256 oldMinAmountToConvert, uint256 newMinAmountToConvert);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param _pancakeSwapRouter Address of the PancakeSwap router
     * @param _amountOutMin Min amount out for the PancakeSwap
     * @param _minAmountToConvert Asset should be worth of min amount to convert into base asset
     * @param _convertableBaseAsset Address of the base asset
     * @param _accessControl Address of the access control contract.
     */
    function initialize(
        address _pancakeSwapRouter,
        uint256 _amountOutMin,
        uint256 _minAmountToConvert,
        address _convertableBaseAsset,
        address _accessControl
    ) external initializer {
        require(_pancakeSwapRouter != address(0), "Risk Fund: Pancake swap address invalid");
        require(_convertableBaseAsset != address(0), "Risk Fund: Base asset address invalid");
        require(_minAmountToConvert > 0, "Risk Fund: Invalid min amout to convert");

        __Ownable2Step_init();

        pancakeSwapRouter = _pancakeSwapRouter;
        amountOutMin = _amountOutMin;
        minAmountToConvert = _minAmountToConvert;
        convertableBaseAsset = _convertableBaseAsset;
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
     * @dev convertable base asset setter
     * @param _convertableBaseAsset Address of the asset.
     */
    function setConvertableBaseAsset(address _convertableBaseAsset) external onlyOwner {
        require(_convertableBaseAsset != address(0), "Risk Fund: Asset address invalid");
        address oldBaseAsset = convertableBaseAsset;
        convertableBaseAsset = _convertableBaseAsset;
        emit ConvertableBaseAssetUpdated(oldBaseAsset, _convertableBaseAsset);
    }

    /**
     * @dev Auction contract address setter
     * @param _auctionContractAddress Address of the auction contract.
     */
    function setAuctionContractAddress(address _auctionContractAddress) external onlyOwner {
        require(_auctionContractAddress != address(0), "Risk Fund: Auction contract address invalid");
        address oldAuctionContractAddress = auctionContractAddress;
        auctionContractAddress = _auctionContractAddress;
        emit AuctionContractUpdated(oldAuctionContractAddress, _auctionContractAddress);
    }

    /**
     * @dev Pancake swap router address setter
     * @param _pancakeSwapRouter Address of the pancake swap router.
     */
    function setPancakeSwapRouter(address _pancakeSwapRouter) external onlyOwner {
        require(_pancakeSwapRouter != address(0), "Risk Fund: PancakeSwap address invalid");
        address oldPancakeSwapRouter = pancakeSwapRouter;
        pancakeSwapRouter = _pancakeSwapRouter;
        emit PancakeSwapRouterUpdated(oldPancakeSwapRouter, _pancakeSwapRouter);
    }

    /**
     * @dev Min amount out setter
     * @param _amountOutMin Min amount out for the pancake swap.
     */
    function setAmountOutMin(uint256 _amountOutMin) external onlyOwner {
        require(_amountOutMin >= 0, "Risk Fund: Min amount out invalid");
        uint256 oldAmountOutMin = amountOutMin;
        amountOutMin = _amountOutMin;
        emit AmountOutMinUpdated(oldAmountOutMin, _amountOutMin);
    }

    /**
     * @dev Min amout to convert setter
     * @param _minAmountToConvert Min amout to convert.
     */
    function setMinAmountToConvert(uint256 _minAmountToConvert) external onlyOwner {
        require(_minAmountToConvert > 0, "Risk Fund: Invalid min amout to convert");
        uint256 oldMinAmountToConvert = minAmountToConvert;
        minAmountToConvert = _minAmountToConvert;
        emit MinAmountToConvertUpdated(oldMinAmountToConvert, _minAmountToConvert);
    }

    /**
     * @dev Swap assets of all pools into base asset's tokens.
     * @return Number of swapped tokens.
     */
    function swapAllPoolsAssets() external returns (uint256) {
        require(poolRegistry != address(0), "Risk fund: Invalid pool registry.");
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistry);
        PoolRegistry.VenusPool[] memory venusPools = poolRegistryInterface.getAllPools();

        uint256 totalAmount = swapPoolsAssets(venusPools);

        return totalAmount;
    }

    /**
     * @dev Transfer tokens for auction.
     * @param comptroller comptroller of the pool.
     * @param amount Amount to be transferred to auction contract.
     * @return Number reserved tokens.
     */
    function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256) {
        bool canTransferFunds = AccessControlManager(accessControl).isAllowedToCall(
            msg.sender,
            "transferReserveForAuction(uint256,uint256)"
        );

        require(canTransferFunds, "Risk fund: Not authorized to transfer funds.");

        require(auctionContractAddress != address(0), "Risk Fund: Auction contract invalid address.");
        require(amount <= poolReserves[comptroller], "Risk Fund: Insufficient pool reserve.");
        poolReserves[comptroller] = poolReserves[comptroller] - amount;
        IERC20Upgradeable(convertableBaseAsset).safeTransfer(auctionContractAddress, amount);
        return amount;
    }

    /**
     * @dev Get pool reserve by pool id.
     * @param comptroller comptroller of the pool.
     * @return Number reserved tokens.
     */
    function getPoolReserve(address comptroller) external view returns (uint256) {
        return poolReserves[comptroller];
    }

    /**
     * @dev Swap assets of selected pools into base tokens.
     * @param venusPools Array of Pools to swap
     * @return Number of swapped tokens.
     */
    function swapPoolsAssets(PoolRegistry.VenusPool[] memory venusPools) public returns (uint256) {
        uint256 totalAmount;
        uint256 poolsCount = venusPools.length;
        for (uint256 i; i < poolsCount; ++i) {
            if (venusPools[i].comptroller != address(0)) {
                VToken[] memory vTokens = ComptrollerInterface(venusPools[i].comptroller).getAllMarkets();

                uint256 vTokensCount = vTokens.length;
                for (uint256 j; j < vTokensCount; ++j) {
                    address comptroller = venusPools[i].comptroller;
                    VToken vToken = vTokens[j];
                    uint256 swappedTokens = _swapAsset(vToken, comptroller);
                    poolReserves[comptroller] = poolReserves[comptroller] + swappedTokens;
                    totalAmount = totalAmount + swappedTokens;
                }
            }
        }
        return totalAmount;
    }

    /**
     * @dev Swap single asset to Base asset.
     * @param vToken VToken
     * @param comptroller comptorller address
     * @return Number of swapped tokens.
     */
    function _swapAsset(VToken vToken, address comptroller) internal returns (uint256) {
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

                if (underlyingAsset != convertableBaseAsset) {
                    address[] memory path = new address[](2);
                    path[0] = underlyingAsset;
                    path[1] = convertableBaseAsset;
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

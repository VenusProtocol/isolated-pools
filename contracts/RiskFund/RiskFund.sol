// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../VToken.sol";
import "../Pool/PoolRegistry.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../IPancakeswapV2Router.sol";
import "./ReserveHelpers.sol";
import "./IRiskFund.sol";
import "../Shortfall/IShortfall.sol";

import "../MaxLoopsLimitHelper.sol";

/**
 * @dev This contract does not support BNB.
 */
contract RiskFund is Ownable2StepUpgradeable, ExponentialNoError, ReserveHelpers, MaxLoopsLimitHelper, IRiskFund {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private pancakeSwapRouter;
    uint256 private minAmountToConvert;
    address private convertibleBaseAsset;
    address private accessControl;
    address private shortfall;

    // Store base asset's reserve for specific pool
    mapping(address => uint256) private poolReserves;

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);

    /// @notice Emitted when shortfall contract address is updated
    event ShortfallContractUpdated(address indexed oldShortfallContract, address indexed newShortfallContract);

    /// @notice Emitted when PancakeSwap router contract address is updated
    event PancakeSwapRouterUpdated(address indexed oldPancakeSwapRouter, address indexed newPancakeSwapRouter);

    /// @notice Emitted when min amount out for PancakeSwap is updated
    event AmountOutMinUpdated(uint256 oldAmountOutMin, uint256 newAmountOutMin);

    /// @notice Emitted when minimum amount to convert is updated
    event MinAmountToConvertUpdated(uint256 oldMinAmountToConvert, uint256 newMinAmountToConvert);

    /// @notice Emitted when pools assets are swapped
    event SwappedPoolsAssets(address[] markets, uint256[] amountsOutMin, uint256 totalAmount);

    /// @notice Emitted when reserves are transferred for auction
    event TransferredReserveForAuction(address comptroller, uint256 amount);

    /// @dev Note that the contract is upgradeable. Use initialize() or reinitializers
    ///      to set the state variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the deployer to owner.
     * @param _pancakeSwapRouter Address of the PancakeSwap router
     * @param _minAmountToConvert Minimum amount assets must be worth to convert into base asset
     * @param _convertibleBaseAsset Address of the base asset
     * @param _accessControl Address of the access control contract.
     */
    function initialize(
        address _pancakeSwapRouter,
        uint256 _minAmountToConvert,
        address _convertibleBaseAsset,
        address _accessControl,
        uint256 _loopsLimit
    ) external initializer {
        require(_pancakeSwapRouter != address(0), "Risk Fund: Pancake swap address invalid");
        require(_convertibleBaseAsset != address(0), "Risk Fund: Base asset address invalid");
        require(_minAmountToConvert > 0, "Risk Fund: Invalid min amount to convert");
        require(_accessControl != address(0), "Risk Fund: Access control address invalid");
        require(_loopsLimit > 0, "Risk Fund: Loops limit can not be zero");

        __Ownable2Step_init();

        pancakeSwapRouter = _pancakeSwapRouter;
        minAmountToConvert = _minAmountToConvert;
        convertibleBaseAsset = _convertibleBaseAsset;
        accessControl = _accessControl;

        _setMaxLoopsLimit(_loopsLimit);
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
     * @dev Shortfall contract address setter
     * @param _shortfallContractAddress Address of the auction contract.
     */
    function setShortfallContractAddress(address _shortfallContractAddress) external onlyOwner {
        require(_shortfallContractAddress != address(0), "Risk Fund: Shortfall contract address invalid");
        require(
            IShortfall(_shortfallContractAddress).convertibleBaseAsset() == convertibleBaseAsset,
            "Risk Fund: Base asset doesn't match"
        );

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
     * @param _minAmountToConvert Min amount to convert.
     */
    function setMinAmountToConvert(uint256 _minAmountToConvert) external onlyOwner {
        require(_minAmountToConvert > 0, "Risk Fund: Invalid min amount to convert");
        uint256 oldMinAmountToConvert = minAmountToConvert;
        minAmountToConvert = _minAmountToConvert;
        emit MinAmountToConvertUpdated(oldMinAmountToConvert, _minAmountToConvert);
    }

    /**
     * @notice Swap array of pool assets into base asset's tokens of at least a mininum amount.
     * @param markets Array of vTokens whose assets to swap for base asset
     * @param amountsOutMin Minimum amount to recieve for swap
     * @return Number of swapped tokens.
     */
    function swapPoolsAssets(address[] calldata markets, uint256[] calldata amountsOutMin)
        external
        override
        returns (uint256)
    {
        bool canSwapPoolsAsset = AccessControlManager(accessControl).isAllowedToCall(
            msg.sender,
            "swapPoolsAssets(address[],uint256[])"
        );
        require(canSwapPoolsAsset, "Risk fund: Not authorized to swap pool assets.");
        require(poolRegistry != address(0), "Risk fund: Invalid pool registry.");
        require(markets.length == amountsOutMin.length, "Risk fund: markets and amountsOutMin are unequal lengths");

        uint256 totalAmount;
        uint256 marketsCount = markets.length;

        _ensureMaxLoops(marketsCount);

        for (uint256 i; i < marketsCount; ++i) {
            VToken vToken = VToken(markets[i]);
            address comptroller = address(vToken.comptroller());

            PoolRegistry.VenusPool memory pool = PoolRegistry(poolRegistry).getPoolByComptroller(comptroller);
            require(pool.comptroller == comptroller, "comptroller doesn't exist pool registry");
            require(Comptroller(comptroller).isMarketListed(vToken), "market is not listed");

            uint256 swappedTokens = _swapAsset(vToken, comptroller, amountsOutMin[i]);
            poolReserves[comptroller] = poolReserves[comptroller] + swappedTokens;
            totalAmount = totalAmount + swappedTokens;
        }

        emit SwappedPoolsAssets(markets, amountsOutMin, totalAmount);

        return totalAmount;
    }

    /**
     * @dev Transfer tokens for auction.
     * @param comptroller Comptroller of the pool.
     * @param amount Amount to be transferred to auction contract.
     * @return Number reserved tokens.
     */
    function transferReserveForAuction(address comptroller, uint256 amount) external override returns (uint256) {
        require(msg.sender == shortfall, "Risk fund: Only callable by Shortfall contract");
        require(amount <= poolReserves[comptroller], "Risk Fund: Insufficient pool reserve.");
        poolReserves[comptroller] = poolReserves[comptroller] - amount;
        IERC20Upgradeable(convertibleBaseAsset).safeTransfer(shortfall, amount);

        emit TransferredReserveForAuction(comptroller, amount);

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
     * @dev Get pool reserve by pool id.
     * @param comptroller Comptroller address of the pool.
     * @return Number of reserved tokens.
     */
    function getPoolReserve(address comptroller) external view override returns (uint256) {
        return poolReserves[comptroller];
    }

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to risk fund.
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
     * @return Number of swapped tokens.
     */
    function _swapAsset(
        VToken vToken,
        address comptroller,
        uint256 amountOutMin
    ) internal returns (uint256) {
        require(amountOutMin != 0, "RiskFund: amountOutMin must be greater than 0 to swap vToken");
        require(amountOutMin >= minAmountToConvert, "RiskFund: amountOutMin should be greater than minAmountToConvert");
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

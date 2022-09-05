// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./CToken.sol";
import "./Pool/PoolRegistry.sol";
import "./Pool/PoolRegistryInterface.sol";
import "./IPancakeswapV2Router.sol";
import "./Pool/PoolRegistry.sol";

contract RiskFund is OwnableUpgradeable, ExponentialNoError {
    address private poolRegistry;
    address private pancakeSwapRouter;
    uint256 private minAmountToConvert;
    uint256 private amountOutMin;
    address private convertableBUSDAddress;

    /**
     * @dev Initializes the deployer to owner.
     * @param _pancakeSwapRouter Address of the pancake swap router.
     * @param _amountOutMin Min amount out for the pancake swap.
     * @param _minAmountToConvert Asset should be worth of min amount to convert to BUSD
     * @param _convertableBUSDAddress Address of the BUSD
     */
    function initialize(
        address _pancakeSwapRouter,
        uint256 _amountOutMin,
        uint256 _minAmountToConvert,
        address _convertableBUSDAddress
    ) public initializer {
        require(
            _pancakeSwapRouter != address(0),
            "Risk Fund: Pancake swap address invalid"
        );
        require(
            convertableBUSDAddress != address(0),
            "Risk Fund: BUSD address invalid"
        );
        require(
            _minAmountToConvert > 0,
            "Risk Fund: Invalid min amout to convert"
        );

        __Ownable_init();

        pancakeSwapRouter = _pancakeSwapRouter;
        amountOutMin = _amountOutMin;
        minAmountToConvert = _minAmountToConvert;
        convertableBUSDAddress = _convertableBUSDAddress;
    }

    /**
     * @dev Pool registry setter
     * @param _poolRegistry Address of the pool registry.
     */
    function setPoolRegistry(address _poolRegistry) external onlyOwner {
        require(
            _poolRegistry != address(0),
            "Risk Fund: Pool registry address invalid"
        );
        poolRegistry = _poolRegistry;
    }

    /**
     * @dev Pancake swap router address setter
     * @param _pancakeSwapRouter Address of the pancake swap router.
     */
    function setPancakeSwapRouter(address _pancakeSwapRouter)
        external
        onlyOwner
    {
        require(
            _pancakeSwapRouter != address(0),
            "Risk Fund: Pancake swap address invalid"
        );
        pancakeSwapRouter = _pancakeSwapRouter;
    }

    /**
     * @dev Min amount out setter
     * @param _amountOutMin Min amount out for the pancake swap.
     */
    function setAmountOutMin(uint256 _amountOutMin) external onlyOwner {
        require(_amountOutMin >= 0, "Risk Fund: Min amount out invalid");
        amountOutMin = _amountOutMin;
    }

    /**
     * @dev Min amout to convert setter
     * @param _minAmountToConvert Min amout to convert.
     */
    function setMinAmountToConvert(uint256 _minAmountToConvert)
        external
        onlyOwner
    {
        require(
            _minAmountToConvert > 0,
            "Risk Fund: Invalid min amout to convert"
        );
        minAmountToConvert = _minAmountToConvert;
    }

    /**
     * @dev Convert asset to BUSD
     */
    function convertoToBUSD() external returns (uint256) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(
            poolRegistry
        );
        PoolRegistry.VenusPool[] memory venusPools = poolRegistryInterface
            .getAllPools();

        uint256 totalAmount = 0;

        for (uint256 i; i <= venusPools.length; ++i) {
            CToken[] memory allMarkets = ComptrollerInterface(
                venusPools[i].comptroller
            ).getAllMarkets();
            for (uint256 j; j <= allMarkets.length; ++j) {
                uint256 underlyingPrice = ComptrollerViewInterface(
                    venusPools[i].comptroller
                ).oracle().getUnderlyingPrice(CToken(allMarkets[j]));
                address asset = CErc20Interface(address(allMarkets[j]))
                    .underlying();
                uint256 underlyingAssets = EIP20Interface(asset).balanceOf(
                    address(this)
                );
                Exp memory oraclePrice = Exp({mantissa: underlyingPrice});
                uint256 amountInUsd = mul_ScalarTruncate(
                    oraclePrice,
                    underlyingAssets
                );
                require(
                    amountInUsd >= minAmountToConvert,
                    "Risk Fund: In sufficient balance."
                );
                address[] memory path = new address[](2);
                path[0] = asset;
                path[1] = convertableBUSDAddress;
                uint256[] memory amounts = IPancakeswapV2Router(
                    pancakeSwapRouter
                ).swapExactTokensForTokens(
                        underlyingAssets,
                        amountOutMin,
                        path,
                        address(this),
                        block.timestamp
                    );
                for (uint256 k; k <= amounts.length; ++k) {
                    totalAmount = totalAmount + amounts[k];
                }
            }
        }

        return totalAmount;
    }
}

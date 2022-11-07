// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../VToken.sol";
import "../Pool/PoolRegistry.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../IPancakeswapV2Router.sol";
import "../Pool/PoolRegistry.sol";

/**
 * @dev This contract does not support BNB.
 */
contract RiskFund is OwnableUpgradeable, ExponentialNoError {
    using SafeERC20 for IERC20;

    address private poolRegistry;
    address private pancakeSwapRouter;
    uint256 private minAmountToConvert;
    uint256 private amountOutMin;
    address private convertableBUSDAddress;
    address private auctionContractAddress;
    address private accessControl;
    mapping(address => uint256) private poolReserves;

    /**
     * @dev Initializes the deployer to owner.
     * @param _pancakeSwapRouter Address of the pancake swap router.
     * @param _amountOutMin Min amount out for the pancake swap.
     * @param _minAmountToConvert Asset should be worth of min amount to convert to BUSD
     * @param _convertableBUSDAddress Address of the BUSD
     * @param _accessControl Address of the access control contract.
     */
    function initialize(
        address _pancakeSwapRouter,
        uint256 _amountOutMin,
        uint256 _minAmountToConvert,
        address _convertableBUSDAddress,
        address _accessControl
    ) public initializer {
        require(
            _pancakeSwapRouter != address(0),
            "Risk Fund: Pancake swap address invalid"
        );
        require(
            _convertableBUSDAddress != address(0),
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
        accessControl = _accessControl;
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
     * @dev Auction contract address setter
     * @param _auctionContractAddress Address of the auction contract.
     */
    function setAuctionContractAddress(address _auctionContractAddress)
        external
        onlyOwner
    {
        require(
            _auctionContractAddress != address(0),
            "Risk Fund: Auction contract address invalid"
        );
        auctionContractAddress = _auctionContractAddress;
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
     * @dev Swap single asset to BUSD.
     * @param vToken VToken
     * @param comptroller comptorller address
     * @return Number of BUSD tokens.
     */
    function swapAsset(VToken vToken, address comptroller)
        internal
        returns (uint256)
    {
        uint256 totalAmount;

        address underlyingAsset = VTokenInterface(address(vToken)).underlying();
        uint256 balanceOfUnderlyingAsset = IERC20(underlyingAsset).balanceOf(
            address(this)
        );

        ComptrollerViewInterface(comptroller).oracle().updatePrice(
            address(vToken)
        );

        uint256 underlyingAssetPrice = ComptrollerViewInterface(comptroller)
            .oracle()
            .getUnderlyingPrice(vToken);

        if (balanceOfUnderlyingAsset > 0) {
            Exp memory oraclePrice = Exp({mantissa: underlyingAssetPrice});
            uint256 amountInUsd = mul_ScalarTruncate(
                oraclePrice,
                balanceOfUnderlyingAsset
            );

            if (amountInUsd >= minAmountToConvert) {
                address[] memory path = new address[](2);
                path[0] = underlyingAsset;
                path[1] = convertableBUSDAddress;
                IERC20(underlyingAsset).safeApprove(
                    pancakeSwapRouter,
                    balanceOfUnderlyingAsset
                );
                uint256[] memory amounts = IPancakeswapV2Router(
                    pancakeSwapRouter
                ).swapExactTokensForTokens(
                        balanceOfUnderlyingAsset,
                        amountOutMin,
                        path,
                        address(this),
                        block.timestamp
                    );
                totalAmount = amounts[1];
            }
        }
        return totalAmount;
    }

    /**
     * @dev Swap assets of selected pools into BUSD tokens.
     * @param venusPools Array of Pools to swap for BUSD
     * @return Number of BUSD tokens.
     */
    function swapPoolsAssets(PoolRegistry.VenusPool[] memory venusPools)
        public
        returns (uint256)
    {
        uint256 totalAmount;
        for (uint256 i; i < venusPools.length; ++i) {
            if (venusPools[i].comptroller != address(0)) {
                VToken[] memory vTokens = ComptrollerInterface(
                    venusPools[i].comptroller
                ).getAllMarkets();

                for (uint256 j; j < vTokens.length; ++j) {
                    address comptroller = venusPools[i].comptroller;
                    VToken vToken = vTokens[j];
                    uint256 swappedTokens = swapAsset(vToken, comptroller);
                    poolReserves[comptroller] =
                        poolReserves[comptroller] +
                        swappedTokens;
                    totalAmount = totalAmount + swappedTokens;
                }
            }
        }
        return totalAmount;
    }

    /**
     * @dev Swap assets of all pools into BUSD tokens.
     * @return Number of BUSD tokens.
     */
    function swapAllPoolsAssets() external returns (uint256) {
        require(
            poolRegistry != address(0),
            "Risk fund: Invalid pool registry."
        );
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(
            poolRegistry
        );
        PoolRegistry.VenusPool[] memory venusPools = poolRegistryInterface
            .getAllPools();

        uint256 totalAmount = swapPoolsAssets(venusPools);

        return totalAmount;
    }

    /**
     * @dev Get pool reserve by pool id.
     * @param comptroller comptroller of the pool.
     * @return Number reserved tokens.
     */
    function getPoolReserve(address comptroller)
        external
        view
        returns (uint256)
    {
        return poolReserves[comptroller];
    }

    /**
     * @dev Transfer tokens for auction.
     * @param comptroller comptroller of the pool.
     * @param amount Amount to be transferred to auction contract.
     * @return Number reserved tokens.
     */
    function transferReserveForAuction(address comptroller, uint256 amount)
        external
        returns (uint256)
    {
        bool canTransferFunds = AccessControlManager(accessControl)
            .isAllowedToCall(
                msg.sender,
                "transferReserveForAuction(uint256,uint256)"
            );

        require(
            canTransferFunds,
            "Risk fund: Not authorized to transfer funds."
        );

        require(
            auctionContractAddress != address(0),
            "Risk Fund: Auction contract invalid address."
        );
        require(
            amount <= poolReserves[comptroller],
            "Risk Fund: Insufficient pool reserve."
        );
        poolReserves[comptroller] = poolReserves[comptroller] - amount;
        IERC20(convertableBUSDAddress).safeTransfer(
            auctionContractAddress,
            amount
        );
        return amount;
    }
}

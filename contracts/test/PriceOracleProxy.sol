// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../../contracts/VToken.sol";
import "../../contracts/PriceOracle.sol";

interface V1PriceOracleInterface {
    function assetPrices(address asset) external view returns (uint256);
}

contract PriceOracleProxy is PriceOracle {
    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice Address of the guardian, which may set the SAI price once
    address public guardian;

    /// @notice Address of the cEther contract, which has a constant price
    address public cEthAddress;

    /// @notice Address of the cUSDC contract, which we hand pick a key for
    address public cUsdcAddress;

    /// @notice Address of the cUSDT contract, which uses the cUSDC price
    address public cUsdtAddress;

    /// @notice Address of the cSAI contract, which may have its price set
    address public cSaiAddress;

    /// @notice Address of the cDAI contract, which we hand pick a key for
    address public cDaiAddress;

    /// @notice Handpicked key for USDC
    address public constant usdcOracleKey = address(1);

    /// @notice Handpicked key for DAI
    address public constant daiOracleKey = address(2);

    /// @notice Frozen SAI price (or 0 if not set yet)
    uint256 public saiPrice;

    /**
     * @param guardian_ The address of the guardian, which may set the SAI price once
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param cEthAddress_ The address of cETH, which will return a constant 1e18, since all prices relative to ether
     * @param cUsdcAddress_ The address of cUSDC, which will be read from a special oracle key
     * @param cSaiAddress_ The address of cSAI, which may be read directly from storage
     * @param cDaiAddress_ The address of cDAI, which will be read from a special oracle key
     * @param cUsdtAddress_ The address of cUSDT, which uses the cUSDC price
     */
    constructor(
        address guardian_,
        address v1PriceOracle_,
        address cEthAddress_,
        address cUsdcAddress_,
        address cSaiAddress_,
        address cDaiAddress_,
        address cUsdtAddress_
    ) {
        guardian = guardian_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);

        cEthAddress = cEthAddress_;
        cUsdcAddress = cUsdcAddress_;
        cSaiAddress = cSaiAddress_;
        cDaiAddress = cDaiAddress_;
        cUsdtAddress = cUsdtAddress_;
    }

    /**
     * @notice Get the underlying price of a listed vToken asset
     * @param vToken The vToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(VToken vToken)
        public
        view
        override
        returns (uint256)
    {
        address vTokenAddress = address(vToken);

        if (vTokenAddress == cEthAddress) {
            // ether always worth 1
            return 1e18;
        }

        if (vTokenAddress == cUsdcAddress || vTokenAddress == cUsdtAddress) {
            return v1PriceOracle.assetPrices(usdcOracleKey);
        }

        if (vTokenAddress == cDaiAddress) {
            return v1PriceOracle.assetPrices(daiOracleKey);
        }

        if (vTokenAddress == cSaiAddress) {
            // use the frozen SAI price if set, otherwise use the DAI price
            return
                saiPrice > 0
                    ? saiPrice
                    : v1PriceOracle.assetPrices(daiOracleKey);
        }

        // otherwise just read from v1 oracle
        address underlying = VToken(vTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }

    /**
     * @notice Set the price of SAI, permanently
     * @param price The price for SAI
     */
    function setSaiPrice(uint256 price) public {
        require(msg.sender == guardian, "only guardian may set the SAI price");
        require(saiPrice == 0, "SAI price may only be set once");
        require(price < 0.1e18, "SAI price must be < 0.1 ETH");
        saiPrice = price;
    }

    function updatePrice(address vToken) external override {}
}

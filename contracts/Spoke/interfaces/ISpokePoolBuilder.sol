// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { ISpokePoolManager } from "./ISpokePoolManager.sol";
import { IGovernorBravo } from "./external/IGovernorBravo.sol";

/**
 * @title ISpokePoolBuilder
 * @author Venus
 * @notice Functions and errors of `SpokePoolBuilder`
 */
interface ISpokePoolBuilder {
    /**
     * @notice Thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @param caller The caller
     */
    error NotSpokePoolManager(address caller);

    /// @notice Thrown when there is no market, or the thresholds do not match the pool's markets
    error InvalidArrayLength();

    /**
     * @notice Thrown when a pool would have more markets or collateral markets than allowed, or `MAX_POOL_MARKETS`
     *   markets would not fit a GovernorBravo proposal
     * @param marketCount The markets
     * @param maxMarketCount The maximum
     */
    error TooManyMarkets(uint256 marketCount, uint256 maxMarketCount);

    /**
     * @notice Thrown when a market's asset is already in the request or the pool
     * @param asset The asset
     */
    error DuplicateAsset(address asset);

    /**
     * @notice Thrown when a market's parameters are missing or do not fit its type or seed
     * @param asset The market's asset
     */
    error InvalidMarketParams(address asset);

    /**
     * @notice Thrown when a collateral asset has no bounded pricing
     * @param asset The asset
     */
    error DeviationBoundedOracleNotSet(address asset);

    /**
     * @notice Thrown when a loan market's interest rate model is not one its tier allows for its asset
     * @param interestRateModel The interest rate model
     */
    error InterestRateModelNotAllowed(address interestRateModel);

    /**
     * @notice Thrown when a loan market's asset is not one the tier offers
     * @param asset The market's asset
     */
    error LoanAssetNotAllowed(address asset);

    /**
     * @notice Thrown when a collateral market's parameter is above the tier's limits
     * @param asset The market's asset
     */
    error ExceedsTierLimit(address asset);

    /**
     * @notice Thrown when a seed is worth less than the $10 minimum
     * @param asset The market's asset
     */
    error InsufficientSeed(address asset);

    /**
     * @notice Thrown when a pool's borrows and bad debt exceed the manager's `maxResidualPoolDebtUsd`
     * @param debtUsd The borrows and bad debt, in USD
     */
    error ResidualDebtExceeded(uint256 debtUsd);

    /**
     * @notice Deploys a request's contracts and builds its VIP, which settles it; a tier request deploys nothing and
     *   its VIP sets the pool's loan market caps to the new tier's
     * @param requestId The request
     * @param buildId The build the VIP settles
     * @param description The VIP's description
     * @return comptroller The pool's comptroller, deployed on a pool request's first build
     * @return vTokens The deployed markets, in the request's market order; empty for a tier request
     * @return proposal The payload
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error The `validateMarkets` errors
     * @custom:error InsufficientSeed is thrown when a seed is worth less than the $10 minimum
     * @custom:error ExceedsTierLimit is thrown when a collateral supply cap is worth more than the tier allows
     * @custom:error DeviationBoundedOracleNotSet is thrown when a collateral asset has no bounded pricing
     * @custom:error LoanAssetNotAllowed is thrown when a tier request's tier does not offer one of the pool's loan
     *   assets
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function buildRequestProposal(
        uint256 requestId,
        uint256 buildId,
        string calldata description
    ) external returns (address comptroller, address[] memory vTokens, bytes memory proposal);

    /**
     * @notice Accrues a pool's interest and checks its borrows and bad debt against `maxResidualPoolDebtUsd`
     * @param comptroller The pool's comptroller
     * @custom:error ResidualDebtExceeded is thrown when they exceed it
     * @custom:access Not restricted
     */
    function accrueAndCheckResidualDebt(address comptroller) external;

    /**
     * @notice Builds a pool's exit VIP, which freezes its markets, sets their thresholds and starts the wind-down
     * @param comptroller The pool's comptroller
     * @param buildId The build the VIP starts the wind-down with
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order; ignored
     *   for loan markets
     * @param description The VIP's description
     * @return proposal The payload
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's listed markets
     */
    function buildExitProposal(
        address comptroller,
        uint256 buildId,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external view returns (bytes memory proposal);

    /**
     * @notice Builds a pool's force-close VIP: zero collateral factors and thresholds, forced liquidation of borrows
     * @param comptroller The pool's comptroller
     * @param description The VIP's description
     * @return proposal The payload
     */
    function buildForceCloseProposal(
        address comptroller,
        string calldata description
    ) external view returns (bytes memory proposal);

    /**
     * @notice Checks new markets against a pool and its tier's current limits, without prices
     * @param comptroller The pool's comptroller; zero, or not yet listed, for a new pool
     * @param tierId The pool's tier, whose limits apply
     * @param markets The new markets
     * @custom:error InvalidArrayLength is thrown when there is no market
     * @custom:error TooManyMarkets is thrown when the pool would have more than `MAX_POOL_MARKETS` markets, or more
     *   collateral markets than the tier allows
     * @custom:error DuplicateAsset is thrown when an asset is already in the request or the pool
     * @custom:error InvalidMarketParams is thrown when a market's parameters are missing or do not fit its type or seed
     * @custom:error LoanAssetNotAllowed is thrown when the tier does not offer a loan market's asset
     * @custom:error InterestRateModelNotAllowed is thrown when the tier does not allow a loan market's model for its
     *   asset
     * @custom:error ExceedsTierLimit is thrown when a collateral factor or liquidation threshold is above the
     *   tier's limits
     */
    function validateMarkets(
        address comptroller,
        uint256 tierId,
        ISpokePoolManager.DeployerMarketParams[] calldata markets
    ) external view;

    /**
     * @notice Returns the manager the builder works for
     * @return The SpokePoolManager
     */
    // solhint-disable-next-line func-name-mixedcase
    function SPOKE_POOL_MANAGER() external view returns (ISpokePoolManager);

    /**
     * @notice Returns the governor the VIPs are proposed to
     * @return The GovernorBravo
     */
    // solhint-disable-next-line func-name-mixedcase
    function GOVERNOR_BRAVO() external view returns (IGovernorBravo);

    /**
     * @notice Returns the registry new pools are listed in
     * @return The PoolRegistry
     */
    // solhint-disable-next-line func-name-mixedcase
    function POOL_REGISTRY() external view returns (address);

    /**
     * @notice Returns the oracle that bounds collateral prices
     * @return The DeviationBoundedOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function DEVIATION_BOUNDED_ORACLE() external view returns (IDeviationBoundedOracle);

    /**
     * @notice Returns the Hub adapter loan markets are registered with
     * @return The adapter
     */
    // solhint-disable-next-line func-name-mixedcase
    function SPOKE_ADAPTER() external view returns (address);

    /**
     * @notice Returns the beacon the comptroller proxies point at
     * @return The beacon
     */
    // solhint-disable-next-line func-name-mixedcase
    function COMPTROLLER_BEACON() external view returns (address);

    /**
     * @notice Returns the beacon the vToken proxies point at
     * @return The beacon
     */
    // solhint-disable-next-line func-name-mixedcase
    function VTOKEN_BEACON() external view returns (address);

    /**
     * @notice Returns the ProtocolShareReserve every market sends its income to
     * @return The ProtocolShareReserve
     */
    // solhint-disable-next-line func-name-mixedcase
    function PROTOCOL_SHARE_RESERVE() external view returns (address payable);

    /**
     * @notice Returns the `shortfall` of every market
     * @return The SpokePoolShortfall
     */
    // solhint-disable-next-line func-name-mixedcase
    function SHORTFALL() external view returns (address);

    /**
     * @notice Returns the most markets a pool may have
     * @return The maximum
     */
    // solhint-disable-next-line func-name-mixedcase
    function MAX_POOL_MARKETS() external view returns (uint256);
}

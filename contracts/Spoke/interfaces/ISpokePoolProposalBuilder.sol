// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { ISpokePoolManager } from "./ISpokePoolManager.sol";
import { IGovernorBravo } from "./external/IGovernorBravo.sol";

/**
 * @title ISpokePoolProposalBuilder
 * @author Venus
 * @notice Functions and errors of `SpokePoolProposalBuilder`
 */
interface ISpokePoolProposalBuilder {
    /**
     * @notice Thrown when `MAX_POOL_MARKETS` markets would not fit a GovernorBravo proposal
     * @param marketCount The requested `MAX_POOL_MARKETS`
     * @param maxMarketCount The most markets a new pool's VIP can hold
     */
    error TooManyMarkets(uint256 marketCount, uint256 maxMarketCount);

    /**
     * @notice Thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @param caller The caller
     */
    error NotSpokePoolManager(address caller);

    /**
     * @notice Thrown when a loan market's asset is not one the tier offers
     * @param asset The market's asset
     */
    error LoanAssetNotAllowed(address asset);

    /// @notice Thrown when the thresholds do not match the pool's markets
    error InvalidArrayLength();

    /**
     * @notice Deploys a request's contracts and builds its VIP, which settles it; a tier request deploys nothing and
     *   its VIP sets the pool's loan market caps to the new tier's
     * @param requestId The request
     * @param description The VIP's description
     * @return comptroller The pool's comptroller, deployed for a pool request
     * @return vTokens The deployed markets, the collateral markets' then the loan markets'; empty for a tier request
     * @return proposal The VIP, an ABI-encoded GovernorBravo `propose` call
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error LoanAssetNotAllowed is thrown when a tier request's tier does not offer one of the pool's loan
     *   assets
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function buildRequestProposal(
        uint256 requestId,
        string calldata description
    ) external returns (address comptroller, address[] memory vTokens, bytes memory proposal);

    /**
     * @notice Builds a pool's exit VIP, which freezes its markets, sets each collateral market's collateral factor to
     *   zero and its liquidation threshold to the given one, and starts the wind-down
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order; ignored
     *   for loan markets
     * @param description The VIP's description
     * @return proposal The VIP, an ABI-encoded GovernorBravo `propose` call
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's listed markets
     * @custom:access Not restricted
     */
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external view returns (bytes memory proposal);

    /**
     * @notice Builds a pool's force-close VIP, which zeroes each collateral market's collateral factor and liquidation
     *   threshold and turns on forced liquidation in each loan market with borrows
     * @param comptroller The pool's comptroller
     * @param description The VIP's description
     * @return proposal The VIP, an ABI-encoded GovernorBravo `propose` call
     * @custom:access Not restricted
     */
    function buildForceCloseProposal(
        address comptroller,
        string calldata description
    ) external view returns (bytes memory proposal);

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

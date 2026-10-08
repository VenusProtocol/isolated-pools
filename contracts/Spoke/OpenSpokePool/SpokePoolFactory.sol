// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { ComptrollerInterface } from "../../ComptrollerInterface.sol";
import { InterestRateModel } from "../../InterestRateModel.sol";
import { VToken } from "../../VToken.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";

/**
 * @title SpokePoolFactory
 * @author Venus
 * @notice Deploys the contracts of an open spoke pool when a proposal `SpokePoolManager` submitted executes. `createPool`
 * puts a new pool's comptroller and markets behind the spoke beacons, points the comptroller at both oracles and
 * nominates the proposal's executor as its owner; `addMarkets` deploys new markets of an existing pool. Both then
 * complete the request in the manager. Every proxy is created with CREATE2 from a salt derived from the request id, so
 * the proposal addresses the contracts before the vote.
 */
contract SpokePoolFactory {
    /// @notice Loop limit every comptroller the factory deploys is initialized with
    uint256 public constant MAX_LOOPS_LIMIT = 100;

    /// @notice The manager that proposes requests and completes them
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @notice Beacon the comptroller proxies point at
    address public immutable COMPTROLLER_BEACON;

    /// @notice Beacon the vToken proxies point at
    address public immutable VTOKEN_BEACON;

    /// @notice ProtocolShareReserve every market sends its income to
    address payable public immutable PROTOCOL_SHARE_RESERVE;

    /// @notice The oracle every comptroller bounds collateral prices with
    IDeviationBoundedOracle public immutable DEVIATION_BOUNDED_ORACLE;

    /// @notice The `shortfall` of every market, through which bad debt is covered
    address public immutable SHORTFALL_RECEIVER;

    /**
     * @notice Emitted when a pool is deployed for a request
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param vTokens The pool's markets
     */
    event PoolCreated(uint256 indexed requestId, address indexed comptroller, address[] vTokens);

    /**
     * @notice Thrown when the AccessControlManager does not allow the caller to call a function
     * @param sender The caller
     * @param calledContract This contract
     * @param methodSignature The signature of the function called
     */
    error Unauthorized(address sender, address calledContract, string methodSignature);

    /**
     * @param spokePoolManager The manager that proposes requests and completes them
     * @param comptrollerBeacon Beacon the comptroller proxies point at
     * @param vTokenBeacon Beacon the vToken proxies point at
     * @param protocolShareReserve ProtocolShareReserve every market sends its income to
     * @param shortfallReceiver The `shortfall` of every market, through which bad debt is covered
     * @param deviationBoundedOracle The oracle every comptroller bounds collateral prices with
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(
        SpokePoolManager spokePoolManager,
        address comptrollerBeacon,
        address vTokenBeacon,
        address payable protocolShareReserve,
        address shortfallReceiver,
        IDeviationBoundedOracle deviationBoundedOracle
    ) {
        ensureNonzeroAddress(address(spokePoolManager));
        ensureNonzeroAddress(comptrollerBeacon);
        ensureNonzeroAddress(vTokenBeacon);
        ensureNonzeroAddress(protocolShareReserve);
        ensureNonzeroAddress(shortfallReceiver);
        ensureNonzeroAddress(address(deviationBoundedOracle));

        SPOKE_POOL_MANAGER = spokePoolManager;
        COMPTROLLER_BEACON = comptrollerBeacon;
        VTOKEN_BEACON = vTokenBeacon;
        PROTOCOL_SHARE_RESERVE = protocolShareReserve;
        SHORTFALL_RECEIVER = shortfallReceiver;
        DEVIATION_BOUNDED_ORACLE = deviationBoundedOracle;
    }

    /*** Governance functions ***/

    /**
     * @notice Deploys the comptroller and markets of a proposed request for a new pool, and completes the request in
     *   the manager
     * @dev The caller is the proposal's executor. The comptroller is owned by this contract while it sets the oracles,
     * then the executor is nominated and the proposal's next action calls `acceptOwnership`. Markets are owned by the
     * executor from the start and name the shortfall receiver as their `shortfall`, so bad debt is only recovered through
     * it. The manager pulls the seeds from the project to the executor, which lists the markets with them in the same
     * proposal.
     * @param requestId The request
     * @param params The pool parameters the proposal executes
     * @return comptroller The deployed comptroller
     * @return vTokens The deployed markets, in the order of `params.markets`
     * @custom:event Emits PoolCreated
     * @custom:error Unauthorized is thrown when the AccessControlManager does not allow the caller
     * @custom:error InvalidRequestStatus, InvalidPoolStatus or a market validation error is thrown by the manager when
     *   the request is not proposed or its markets no longer fit; the manager's seed transfer reverts when the project has
     *   not approved it
     * @custom:access Controlled by the manager's AccessControlManager, granted to the timelock that executes the
     *   manager's proposals
     */
    function createPool(
        uint256 requestId,
        SpokePoolManager.PoolParams calldata params
    ) external returns (address comptroller, address[] memory vTokens) {
        address accessControlManager = _checkAllowed("createPool(uint256,PoolParams)");
        SpokePoolManager manager = SPOKE_POOL_MANAGER;

        comptroller = address(new BeaconProxy{ salt: _salt(requestId, 0) }(COMPTROLLER_BEACON, ""));
        SpokeComptroller(comptroller).initialize(MAX_LOOPS_LIMIT, accessControlManager);
        SpokeComptroller(comptroller).setPriceOracle(manager.RESILIENT_ORACLE());
        SpokeComptroller(comptroller).setDeviationBoundedOracle(DEVIATION_BOUNDED_ORACLE);
        vTokens = _deployMarkets(requestId, comptroller, params.markets, accessControlManager);
        SpokeComptroller(comptroller).transferOwnership(msg.sender);

        manager.completeRequest(requestId, comptroller, params, vTokens, msg.sender);
        emit PoolCreated(requestId, comptroller, vTokens);
    }

    /**
     * @notice Deploys the markets of a proposed request for new markets in an existing pool, and completes the request
     *   in the manager
     * @dev The caller is the proposal's executor; the markets are owned by it, name the shortfall receiver as their
     * `shortfall`, and are listed with their seeds by the proposal's next actions
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param params The parameters the proposal executes; only `params.markets` is used
     * @return vTokens The deployed markets, in the order of `params.markets`
     * @custom:error Unauthorized is thrown when the AccessControlManager does not allow the caller
     * @custom:error InvalidRequestStatus, RequestPoolMismatch, InvalidPoolStatus or a market validation error is thrown
     *   by the manager when the request is not proposed for this pool, the pool is no longer live or the markets no
     *   longer fit; the manager's seed transfer reverts when the project has not approved it
     * @custom:access Controlled by the manager's AccessControlManager, granted to the timelock that executes the
     *   manager's proposals
     */
    function addMarkets(
        uint256 requestId,
        address comptroller,
        SpokePoolManager.PoolParams calldata params
    ) external returns (address[] memory vTokens) {
        address accessControlManager = _checkAllowed("addMarkets(uint256,address,PoolParams)");
        vTokens = _deployMarkets(requestId, comptroller, params.markets, accessControlManager);
        SPOKE_POOL_MANAGER.completeRequest(requestId, comptroller, params, vTokens, msg.sender);
    }

    /*** View functions ***/

    /**
     * @notice Returns the addresses a request's contracts are deployed at
     * @param requestId The request
     * @param marketCount The number of markets the request deploys
     * @return comptroller The address of the comptroller of a request for a new pool
     * @return vTokens The markets' addresses, in the order of the request's markets
     */
    function predictAddresses(
        uint256 requestId,
        uint256 marketCount
    ) external view returns (address comptroller, address[] memory vTokens) {
        comptroller = Create2.computeAddress(_salt(requestId, 0), _proxyCodeHash(COMPTROLLER_BEACON));

        bytes32 vTokenCodeHash = _proxyCodeHash(VTOKEN_BEACON);
        vTokens = new address[](marketCount);
        for (uint256 i; i < marketCount; ++i) {
            vTokens[i] = Create2.computeAddress(_salt(requestId, i + 1), vTokenCodeHash);
        }
    }

    /*** Internal functions ***/

    /**
     * @dev Deploys and initializes a request's markets behind the vToken beacon, owned by the caller
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param markets The markets' parameters
     * @param accessControlManager The AccessControlManager the markets check roles in
     * @return vTokens The deployed markets, in the order of `markets`
     */
    function _deployMarkets(
        uint256 requestId,
        address comptroller,
        SpokePoolManager.MarketParams[] calldata markets,
        address accessControlManager
    ) internal returns (address[] memory vTokens) {
        uint256 marketCount = markets.length;
        vTokens = new address[](marketCount);
        for (uint256 i; i < marketCount; ++i) {
            vTokens[i] = address(new BeaconProxy{ salt: _salt(requestId, i + 1) }(VTOKEN_BEACON, ""));
            _initializeMarket(vTokens[i], comptroller, markets[i], accessControlManager);
        }
    }

    /**
     * @dev Initializes one market, owned by the caller and naming the shortfall receiver as its `shortfall`
     * @param vToken The market's proxy
     * @param comptroller The pool's comptroller
     * @param market The market's parameters
     * @param accessControlManager The AccessControlManager the market checks roles in
     */
    function _initializeMarket(
        address vToken,
        address comptroller,
        SpokePoolManager.MarketParams memory market,
        address accessControlManager
    ) internal {
        VToken(vToken).initialize(
            market.asset,
            ComptrollerInterface(comptroller),
            InterestRateModel(market.interestRateModel),
            market.initialExchangeRate,
            market.name,
            market.symbol,
            market.decimals,
            msg.sender,
            accessControlManager,
            VTokenInterface.RiskManagementInit({
                shortfall: SHORTFALL_RECEIVER,
                protocolShareReserve: PROTOCOL_SHARE_RESERVE
            }),
            market.reserveFactor
        );
    }

    /**
     * @dev Reverts unless the manager's AccessControlManager allows the caller to call a function of this contract
     * @param signature The function's signature, as granted
     * @return accessControlManager The manager's AccessControlManager
     * @custom:error Unauthorized is thrown when the caller is not allowed
     */
    function _checkAllowed(string memory signature) internal view returns (address accessControlManager) {
        accessControlManager = address(SPOKE_POOL_MANAGER.accessControlManager());
        if (!IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, signature)) {
            revert Unauthorized(msg.sender, address(this), signature);
        }
    }

    /**
     * @dev Returns the init code hash of a beacon proxy created with no initialization call
     * @param beacon The beacon the proxy points at
     * @return The keccak256 hash of the proxy's init code
     */
    function _proxyCodeHash(address beacon) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, "")));
    }

    /**
     * @dev Returns the CREATE2 salt of one proxy of a request
     * @param requestId The request
     * @param index 0 for a new pool's comptroller, 1 + the market's index for a market
     * @return The salt
     */
    function _salt(uint256 requestId, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encode(requestId, index));
    }
}

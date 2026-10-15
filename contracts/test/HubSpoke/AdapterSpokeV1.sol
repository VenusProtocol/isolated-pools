// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IResourceAdapter } from "./interfaces/IResourceAdapter.sol";
import { IVTokenIsolated } from "./interfaces/external/IVTokenIsolated.sol";
import { ISpokeComptroller } from "./interfaces/external/ISpokeComptroller.sol";

/**
 * @title AdapterSpokeV1
 * @author Venus
 * @notice Stateless adapter for the liquidity side of a hub-funded spoke pool — an isolated-pools
 *         `VToken` governed by a `SpokeComptroller`. ONE deployment serves every YieldGroup that
 *         registers a spoke market; there is no per-(YieldGroup, market) instance, no proxy, no
 *         clone factory.
 * @dev Dispatch model: mutating functions (`deposit`, `withdraw`) MUST be invoked via DELEGATECALL
 *      from a YieldGroup. They execute in the YieldGroup's storage context, so vTokens are credited
 *      to / burned from the YieldGroup, not this adapter. View functions are invoked via normal
 *      CALL / STATICCALL; those that name a `holder` read the position from that argument, while
 *      {maxDeposit} and {validateRegistration} read `msg.sender` instead (see below).
 *
 *      Storage-safety invariants enforced by this contract:
 *      1. Zero `internal`/`private`/`public` state variables are declared. Only `immutable` values
 *         are used. Immutables live in bytecode, not storage slots, so they're delegatecall-safe.
 *      2. No inline assembly performs `sstore`.
 *      3. All external calls go to the supplied `resource` (vToken), its `underlying()`, or its
 *         `comptroller()`. No arbitrary user-supplied call target.
 *      4. {onlyDelegateCall} reverts when a mutating function is invoked directly on the adapter,
 *         preventing accidents that would orphan vTokens here.
 *
 *      **Written-off debt stays in the mark.** {totalAssets} values the position at the market's own
 *      exchange rate, as `AdapterCoreV1` does. That rate keeps `badDebt` in its numerator, so a
 *      write-off in `healAccount` does not lower it. The written-off amount is not cash, so the
 *      market cannot pay every supplier in full until its `shortfall` calls `badDebtRecovered`,
 *      which lowers `badDebt` and raises cash by the same amount without moving the rate. Until
 *      then, suppliers who exit first are paid at the full rate out of the cash that remains, and
 *      {maxWithdraw} is bounded by that cash.
 *
 *      **Why this is not `AdapterCoreV1`.** The two speak nearly the same selectors and disagree on
 *      the numbers below. Four differences, each verified against `isolated-pools`:
 *
 *      - **Liquidity is cash NET of reserves**, and both it and the position are floored to a whole
 *        number of vTokens, because {withdraw} redeems by vToken COUNT rather than by underlying
 *        amount. Naming the burn instead of letting `redeemUnderlying` derive it is what keeps a
 *        certified amount inside the position's own balance: the derived burn rounds UP and is
 *        subtracted in checked arithmetic, so an amount one unit too large panics rather than
 *        failing gracefully.
 *      - **No exit fee to gross up.** Isolated pools have no `treasuryPercent`; their cut is the
 *        reserve factor, already netted out of the exchange rate. There is nothing unmodeled to
 *        reject at registration, so {validateRegistration} guards the market listing and the supply
 *        allowlist instead.
 *      - **The supply cap has an uncapped sentinel**, `type(uint256).max` (see
 *        {ISpokeComptroller-supplyCaps}).
 *      - **Mutating calls carry no error code to check.** `mint`, `redeem` and `accrueInterest`
 *        return `NO_ERROR` or revert; the Compound-style codes `AdapterCoreV1` inspects are set by
 *        the legacy Core pool alone.
 *
 *      **The supply allowlist and caller identity.** A spoke market can restrict minting to
 *      allowlisted accounts, and the account it checks is the one CREDITED with the vTokens. Under
 *      delegatecall that is the YieldGroup. {maxDeposit} and {validateRegistration} take no `holder`,
 *      and both are invoked by the YieldGroup as a plain call, so `msg.sender` IS the prospective
 *      supplier and reading the allowlist against it is exact rather than a convention. This matters
 *      operationally: a YieldGroup whose grant is revoked reports zero room and is routed around,
 *      instead of advertising capacity that every deposit then reverts on.
 *
 *      Fee-on-transfer underlyings are unsupported, matching the Hub. The market itself tolerates
 *      them (it mints against the measured delta) but {deposit} reports the requested amount, so the
 *      YieldGroup's accounting would drift.
 */
contract AdapterSpokeV1 is IResourceAdapter {
    using SafeERC20 for IERC20;

    // ============================== State (immutable only) ====================

    /// @notice This adapter's own address, captured at deployment. Used by {onlyDelegateCall} to
    ///         detect direct invocation. Immutables live in bytecode, not storage.
    address private immutable _ADAPTER_SELF;

    // ============================== State (constants) =========================

    /// @notice Fixed-point scale matching Compound's mantissa (`1e18`).
    uint256 public constant EXP_SCALE = 1e18;

    /// @notice Deposit room reported for a market whose supply cap is the isolated-pools "uncapped"
    ///         sentinel (`type(uint256).max`).
    /// @dev Finite on purpose. `YieldGroupBase.maxDeposit()` SUMS the room of every queued resource
    ///      in checked arithmetic, so reporting `type(uint256).max` would overflow that sum the
    ///      moment a second uncapped market joined the queue — the YieldGroup's whole capacity view
    ///      would revert and the Hub would read it as zero capacity with an immovable balance. At
    ///      `2^128 - 1` the sum cannot overflow for any realistic queue, while the value is still
    ///      unreachable for any real token (~3.4e20 whole units at 18 decimals). Mirrors the Flux
    ///      family, where Fluid reports `int128.max` for the same reason. The binding controls on an
    ///      uncapped market are the YieldGroup's per-resource cap and the Hub's dual cap, not this.
    uint256 public constant UNCAPPED_DEPOSIT_ROOM = type(uint128).max;

    /// @notice Scaling factor between mantissa-rate (`1e18`) and BPS (`1e4`).
    uint256 internal constant MANTISSA_TO_BPS = 1e14;

    /// @notice `Action.MINT` in the isolated-pools Comptroller enum.
    uint8 internal constant ACTION_MINT = 0;

    /// @notice `Action.REDEEM` in the isolated-pools Comptroller enum.
    uint8 internal constant ACTION_REDEEM = 1;

    /// @notice Fraction of raw supply-cap headroom withheld to absorb interest accrued between a
    ///         `maxDeposit` read and the mint it sizes (`1/1000` = 0.1%).
    uint256 internal constant CAP_TRIM_DIVISOR = 1000;

    // ============================== Errors ===================================

    /// @notice A mutating function was invoked directly (not via delegatecall).
    error NotDelegateCall();

    /**
     * @notice A redeem succeeded but delivered less than the requested amount. Indicates a
     *         fee-on-transfer underlying or a market bug — an isolated-pools redeem otherwise
     *         delivers at least what was asked for.
     * @param resource Resource that under-delivered.
     * @param requested Underlying units expected.
     * @param actual Underlying units actually received.
     */
    error VTokenUnderfilled(address resource, uint256 requested, uint256 actual);

    /**
     * @notice The deposit is too small to mint a single vToken, so the market would keep the
     *         underlying and issue nothing for it.
     * @dev Reverting hands the leg back to the YieldGroup's deposit cascade, which routes around it;
     *      minting zero would strand the amount silently. Reachable when the Hub cascade leaves this
     *      market a remainder under one vToken unit (about 1e10 wei for an 18-decimal underlying).
     * @param resource Market that would have minted zero.
     * @param amount Underlying units offered.
     * @param minimum Underlying units needed to mint one vToken.
     */
    error DepositBelowOneVToken(address resource, uint256 amount, uint256 minimum);

    /**
     * @notice The market's supply allowlist is enabled and the prospective supplier is not on it.
     * @param resource Market whose allowlist rejected the supplier.
     * @param supplier Account that would be credited with the vTokens (the YieldGroup).
     */
    error SupplyNotAllowed(address resource, address supplier);

    /**
     * @notice The market is not listed by the Comptroller it names, so it can never be minted.
     * @param resource Market that its own Comptroller does not list.
     */
    error MarketNotListed(address resource);

    // ============================== Modifiers ================================

    /// @notice Reverts {NotDelegateCall} when the call is not arriving via delegatecall.
    /// @dev During a delegatecall, `address(this)` is the caller's address; during a direct call it
    ///      equals `_ADAPTER_SELF` (the address captured at construction).
    modifier onlyDelegateCall() {
        if (address(this) == _ADAPTER_SELF) revert NotDelegateCall();
        _;
    }

    // ============================== Constructor ==============================

    /// @notice Captures the adapter's own address into an immutable for {onlyDelegateCall}.
    constructor() {
        _ADAPTER_SELF = address(this);
    }

    // ============================== External — mutating =======================

    /// @inheritdoc IResourceAdapter
    /// @dev `address(this)` here is the YieldGroup (delegatecall context), which already holds
    ///      `amount` of underlying. We approve the market and mint; delegatecall preserves the caller
    ///      context, so the market sees the YieldGroup as `msg.sender` and credits the vTokens there.
    ///      That is also the account its supply allowlist checks.
    function deposit(address resource, uint256 amount) external override onlyDelegateCall returns (uint256 deposited) {
        uint256 minimum = _oneVTokenUnit(IVTokenIsolated(resource).exchangeRateStored());
        if (amount < minimum) revert DepositBelowOneVToken(resource, amount, minimum);

        IERC20 assetToken = IERC20(IVTokenIsolated(resource).underlying());
        assetToken.forceApprove(resource, amount);
        IVTokenIsolated(resource).mint(amount);
        return amount;
    }

    /// @inheritdoc IResourceAdapter
    /// @dev `address(this)` here is the YieldGroup, so the redeem burns its vTokens and credits the
    ///      underlying back to it.
    ///
    ///      Denominated in vTokens, not in underlying. `redeemUnderlying` DERIVES the burn from the
    ///      request by rounding up, and that derived count is not bounded by the caller's balance —
    ///      `_redeemFresh` subtracts it in checked arithmetic and panics when it overshoots. Naming
    ///      the burn removes the derivation: {_burnFor} is the fewest vTokens worth at least
    ///      `amount`, and {maxWithdraw} certifies nothing the position cannot cover that many times
    ///      over.
    ///
    ///      The payout is `truncate(exchangeRate x tokens)`, so it is `>= amount` and exceeds it by
    ///      up to one vToken unit. We forward exactly `amount` and leave the surplus as idle on the
    ///      YieldGroup, where `totalAssets` counts it and the next withdrawal consumes it
    ///      idle-first — the same treatment `AdapterCoreV1` gives its gross-up surplus, and what
    ///      keeps the YieldGroup's `received == requested` invariant true.
    function withdraw(address resource, uint256 amount, address to) external override onlyDelegateCall {
        IERC20 assetToken = IERC20(IVTokenIsolated(resource).underlying());

        uint256 exchangeRate = IVTokenIsolated(resource).exchangeRateStored();
        uint256 preBal = assetToken.balanceOf(address(this));
        IVTokenIsolated(resource).redeem(_burnFor(exchangeRate, amount));
        uint256 received = assetToken.balanceOf(address(this)) - preBal;
        if (received < amount) revert VTokenUnderfilled(resource, amount, received);

        assetToken.safeTransfer(to, amount);
    }

    /// @inheritdoc IResourceAdapter
    /// @dev Plain CALL, no `onlyDelegateCall`: `accrueInterest` mutates the market's own global
    ///      index, not this caller's position, so it is safe (and cheaper) to run in the adapter's
    ///      context. After it returns, every view below is fresh to the current block or timestamp.
    function accrue(address resource) external override {
        IVTokenIsolated(resource).accrueInterest();
    }

    // ============================== External — view ==========================

    /// @inheritdoc IResourceAdapter
    function asset(address resource) external view override returns (address) {
        return IVTokenIsolated(resource).underlying();
    }

    /// @inheritdoc IResourceAdapter
    /// @dev `balance x exchangeRateStored`: the market's own valuation of the tokens, and what
    ///      redeeming all of them would pay at the stored rate if the market had the cash. Includes
    ///      the position's share of `badDebt`; see the contract NatSpec.
    function totalAssets(address resource, address holder) external view override returns (uint256) {
        uint256 vBal = IVTokenIsolated(resource).balanceOf(holder);
        if (vBal == 0) return 0;
        return (vBal * IVTokenIsolated(resource).exchangeRateStored()) / EXP_SCALE;
    }

    /// @inheritdoc IResourceAdapter
    /// @dev Honors, in order: the market's supply allowlist (against `msg.sender`, the prospective
    ///      supplier — see the contract NatSpec), its MINT pause, and its supply cap. The headroom
    ///      math mirrors `preMintHook`'s `nextTotalSupply = totalSupply x exchangeRate + mintAmount`
    ///      check. Room below one vToken unit is reported as zero, because a deposit of it would
    ///      mint nothing.
    function maxDeposit(address resource) external view override returns (uint256) {
        ISpokeComptroller comptrollerContract = ISpokeComptroller(IVTokenIsolated(resource).comptroller());
        if (
            comptrollerContract.isSupplyAllowlistEnabled(resource) &&
            !comptrollerContract.isAllowedSupplier(resource, msg.sender)
        ) {
            return 0;
        }
        if (comptrollerContract.actionPaused(resource, ACTION_MINT)) return 0;

        uint256 supplyCap = comptrollerContract.supplyCaps(resource);
        // A cap of zero is a real cap here, not an "unset" sentinel: `preMintHook` rejects every
        // non-zero mint against it. The uncapped sentinel is `type(uint256).max`.
        if (supplyCap == 0) return 0;
        if (supplyCap == type(uint256).max) return UNCAPPED_DEPOSIT_ROOM;

        uint256 exchangeRate = IVTokenIsolated(resource).exchangeRateStored();
        uint256 supplied = (IVTokenIsolated(resource).totalSupply() * exchangeRate) / EXP_SCALE;
        if (supplied >= supplyCap) return 0;

        uint256 room = supplyCap - supplied;
        // `exchangeRateStored` is pre-accrual, but the market re-checks the cap at mint AFTER
        // `accrueInterest` raises the rate, so the raw headroom is slightly optimistic on an
        // interest-accruing near-cap market. Withhold a small conservative margin so a normal accrual
        // between this view and execution cannot push `deposit(maxDeposit())` over the cap. The
        // routing cascade is the backstop for larger staleness (an over-cap leg is skipped, not
        // bubbled), so this only needs to absorb a typical inter-slot accrual.
        room -= room / CAP_TRIM_DIVISOR;
        return room < _oneVTokenUnit(exchangeRate) ? 0 : room;
    }

    /// @inheritdoc IResourceAdapter
    /// @dev Two constraints: the position's value, and the market's payable cash
    ///      (`getCash - totalReserves` — reserves sit inside cash but are not redeemable, and
    ///      `_redeemFresh` gates on the difference). Subtracting reserves also makes this figure
    ///      invariant across the reserve sweep `accrueInterest` performs, which lowers cash and
    ///      reserves by the same amount.
    ///
    ///      Both are expressed as a whole number of vTokens and valued back into underlying, because
    ///      {withdraw} redeems by count: an amount at or below `truncate(exchangeRate x t)` is
    ///      coverable by `t` tokens, so flooring at `t` is what makes the bound executable rather
    ///      than merely arithmetically true. The position side is `truncate(exchangeRate x vBal)`,
    ///      already floored at the tokens held; the cash side is floored to the tokens the market
    ///      can pay for. Flooring is exact rather than conservative — no margin is withheld — so the
    ///      last vToken stays withdrawable, which is what lets a market be drained to zero and
    ///      deregistered.
    ///
    ///      Reads stored state, so the figure is exact only for a caller that has already settled
    ///      this market's interest in the same transaction — the Hub's routing paths all do, via
    ///      {accrue}. Against an unaccrued market it is optimistic by the reserves the next accrual
    ///      will book, since those come out of the payable cash.
    function maxWithdraw(address resource, address holder) external view override returns (uint256) {
        ISpokeComptroller comptrollerContract = ISpokeComptroller(IVTokenIsolated(resource).comptroller());
        if (comptrollerContract.actionPaused(resource, ACTION_REDEEM)) return 0;

        uint256 vBal = IVTokenIsolated(resource).balanceOf(holder);
        if (vBal == 0) return 0;

        uint256 exchangeRate = IVTokenIsolated(resource).exchangeRateStored();
        if (exchangeRate == 0) return 0;

        uint256 ourValue = (vBal * exchangeRate) / EXP_SCALE;
        if (ourValue == 0) return 0;

        uint256 cash = IVTokenIsolated(resource).getCash();
        uint256 reserves = IVTokenIsolated(resource).totalReserves();
        if (cash <= reserves) return 0;

        uint256 payableTokens = ((cash - reserves) * EXP_SCALE) / exchangeRate;
        uint256 cashBound = (payableTokens * exchangeRate) / EXP_SCALE;

        return ourValue < cashBound ? ourValue : cashBound;
    }

    /// @inheritdoc IResourceAdapter
    /// @dev The `blocksPerYear` parameter is IGNORED. An isolated-pools market carries its own
    ///      annualiser as an immutable and can be block-based or time-based, so a YieldGroup-level
    ///      constant would misprice whichever kind it was not configured for; the market's own value
    ///      always matches the unit of its own rate. Deploy the spoke YieldGroup with
    ///      `blocksPerYear = 0`, as the Flux family already does.
    ///
    ///      An emptied market reports 0 rather than reverting: `JumpRateModelV2.getSupplyRate`
    ///      divides by `cash + borrows + badDebt - reserves` with no zero guard. `PoolLens` guards
    ///      the same read.
    function spotAPYBps(address resource, uint256 /* blocksPerYear */) external view override returns (uint64) {
        if (IVTokenIsolated(resource).totalSupply() == 0) return 0;

        uint256 annualised = (IVTokenIsolated(resource).supplyRatePerBlock() *
            IVTokenIsolated(resource).blocksOrSecondsPerYear()) / MANTISSA_TO_BPS;
        // forge-lint: disable-next-line(unsafe-typecast)
        return annualised > type(uint64).max ? type(uint64).max : uint64(annualised);
    }

    /// @inheritdoc IResourceAdapter
    function receiptBalance(address resource, address holder) external view override returns (uint256) {
        return IVTokenIsolated(resource).balanceOf(holder);
    }

    /// @inheritdoc IResourceAdapter
    function resourceName(address resource) external view override returns (string memory) {
        return IERC20Metadata(resource).name();
    }

    /// @inheritdoc IResourceAdapter
    /// @dev Rejects the two configurations `preMintHook` would reject on every deposit, either of
    ///      which would leave the resource holding a queue slot it can never fill: a market its own
    ///      Comptroller does not list, and a market whose supply allowlist is enabled without the
    ///      registering YieldGroup on it. `msg.sender` is the YieldGroup (see the contract NatSpec),
    ///      which is the account the market's allowlist gates.
    ///
    ///      The listing check is also what ties `resource` to the Comptroller it names: any contract
    ///      can return a real `SpokeComptroller` from `comptroller()`, but only a market that
    ///      Comptroller actually lists passes here. The allowlist accessors then pin the Comptroller
    ///      to the spoke fork, since they exist nowhere else and the call reverts against any other
    ///      Comptroller. Nothing else is asserted. In particular an unset `deviationBoundedOracle`
    ///      is NOT grounds for rejection: it blocks borrowing, and so the market's yield, but leaves
    ///      the Hub's own paths intact — `preMintHook` never reads a price, and `preRedeemHook`
    ///      returns before the priced liquidity check for an account that is not a market member,
    ///      which a supply-only YieldGroup never becomes.
    function validateRegistration(address resource) external view override {
        ISpokeComptroller comptrollerContract = ISpokeComptroller(IVTokenIsolated(resource).comptroller());
        if (!comptrollerContract.isMarketListed(resource)) revert MarketNotListed(resource);
        if (
            comptrollerContract.isSupplyAllowlistEnabled(resource) &&
            !comptrollerContract.isAllowedSupplier(resource, msg.sender)
        ) {
            revert SupplyNotAllowed(resource, msg.sender);
        }
    }

    // ============================== Private — pure ===========================

    /**
     * @notice Underlying value of exactly one vToken, rounded up.
     * @param exchangeRate Market's stored exchange rate, scaled by `1e18`.
     * @return unit `ceil(exchangeRate / 1e18)`.
     */
    function _oneVTokenUnit(uint256 exchangeRate) private pure returns (uint256 unit) {
        return (exchangeRate + EXP_SCALE - 1) / EXP_SCALE;
    }

    /**
     * @notice Fewest vTokens worth at least `amount` of underlying.
     * @dev `ceil(amount x 1e18 / exchangeRate)`. A token-denominated redeem pays
     *      `truncate(exchangeRate x tokens)`, and this ceiling is the smallest count whose payout
     *      reaches `amount` — so {withdraw} never under-delivers, and never burns more than
     *      {maxWithdraw} certified the position and the market's cash can cover.
     *
     *      Non-increasing in the exchange rate. The market accrues before redeeming and that rate
     *      only ever rises, so a count sized here stays inside the balance at execution and its
     *      payout stays at or above `amount`.
     * @param exchangeRate Market's stored exchange rate, scaled by `1e18`.
     * @param amount Underlying units the caller intends to redeem.
     * @return tokens vToken units to burn.
     */
    function _burnFor(uint256 exchangeRate, uint256 amount) private pure returns (uint256 tokens) {
        if (exchangeRate == 0) return 0;
        return (amount * EXP_SCALE + exchangeRate - 1) / exchangeRate;
    }
}

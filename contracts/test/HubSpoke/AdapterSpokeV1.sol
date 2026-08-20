// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
 *      CALL / STATICCALL with an explicit `holder` argument.
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
 *      **Why this is not `AdapterCoreV1`.** The two speak nearly the same selectors and disagree on
 *      every number that matters. Four differences, each verified against `isolated-pools`:
 *
 *      - **NAV excludes `badDebt`.** The market's exchange rate keeps `badDebt` in its numerator, so
 *        it does not fall when `healAccount` writes a loss off; the loss surfaces only as redemptions
 *        failing for want of cash. Valuing at that rate would report unrecoverable value, and inside
 *        the Hub the loss would then land by exit order — early LPs out at the pre-loss share price,
 *        the last one absorbing everything. {totalAssets} therefore values the position off the
 *        components with `badDebt` excluded, which marks every LP down at the same instant. The mark
 *        is pro-rata (`balance / totalSupply`), so it stays correct whether or not the Hub is the
 *        market's only supplier. A Shortfall auction that later recovers the debt raises cash and
 *        lowers `badDebt` by the same amount, so the mark recovers on its own.
 *      - **Liquidity is cash NET of reserves**, floored to what a whole number of vTokens is worth
 *        and then checked against the market's own redeem arithmetic, so a certified amount is
 *        always one the market will actually settle.
 *      - **No exit fee to gross up.** Isolated pools have no `treasuryPercent`; their cut is the
 *        reserve factor, already netted out of the exchange rate. There is nothing unmodeled to
 *        reject at registration, so {validateRegistration} guards the supply allowlist instead.
 *      - **The supply-cap sentinels are inverted** (see {ISpokeComptroller-supplyCaps}).
 *
 *      **The supply allowlist and caller identity.** A spoke market can restrict minting to
 *      allowlisted accounts, and the account it checks is the one CREDITED with the vTokens. Under
 *      delegatecall that is the YieldGroup. {maxDeposit} and {validateRegistration} are the two
 *      `IResourceAdapter` members that take no `holder`, and both are invoked by the YieldGroup as a
 *      plain call — so `msg.sender` IS the prospective supplier, and reading the allowlist against it
 *      is exact rather than a convention. This matters operationally: a YieldGroup whose grant is
 *      revoked reports zero room and is routed around, instead of advertising capacity that every
 *      deposit then reverts on.
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

    /// @notice A vToken `mint` call returned a non-zero error code.
    /// @param resource Market that rejected the mint.
    /// @param errorCode Compound-style error code returned by the market.
    error VTokenMintFailed(address resource, uint256 errorCode);

    /// @notice A vToken `redeemUnderlying` call returned a non-zero error code.
    /// @param resource Market that rejected the redeem.
    /// @param errorCode Compound-style error code returned by the market.
    error VTokenRedeemFailed(address resource, uint256 errorCode);

    /// @notice A vToken `accrueInterest` call returned a non-zero error code.
    /// @param resource Market that failed to accrue.
    /// @param errorCode Compound-style error code returned by the market.
    error VTokenAccrueFailed(address resource, uint256 errorCode);

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
     *      minting zero would strand the amount silently. Only reachable for a sub-one-vToken-unit
     *      remainder, which {maxDeposit} already declines to advertise.
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
        uint256 errCode = IVTokenIsolated(resource).mint(amount);
        if (errCode != 0) revert VTokenMintFailed(resource, errCode);
        return amount;
    }

    /// @inheritdoc IResourceAdapter
    /// @dev `address(this)` here is the YieldGroup, so `redeemUnderlying` burns its vTokens and
    ///      credits the underlying back to it. The market over-delivers: it burns
    ///      `ceil(request / exchangeRate)` tokens and pays out `truncate(exchangeRate x tokens)`,
    ///      which exceeds the request by up to one vToken unit. We forward exactly `amount` and leave
    ///      the surplus as idle on the YieldGroup, where `totalAssets` counts it and the next
    ///      withdrawal consumes it idle-first — the same treatment `AdapterCoreV1` gives its
    ///      gross-up surplus, and what keeps the YieldGroup's `received == requested` invariant true.
    function withdraw(address resource, uint256 amount, address to) external override onlyDelegateCall {
        IERC20 assetToken = IERC20(IVTokenIsolated(resource).underlying());

        uint256 exchangeRate = IVTokenIsolated(resource).exchangeRateStored();
        uint256 preBal = assetToken.balanceOf(address(this));
        uint256 errCode = IVTokenIsolated(resource).redeemUnderlying(_bumpToSettleable(exchangeRate, amount));
        if (errCode != 0) revert VTokenRedeemFailed(resource, errCode);
        uint256 received = assetToken.balanceOf(address(this)) - preBal;
        if (received < amount) revert VTokenUnderfilled(resource, amount, received);

        assetToken.safeTransfer(to, amount);
    }

    /// @inheritdoc IResourceAdapter
    /// @dev Plain CALL, no `onlyDelegateCall`: `accrueInterest` mutates the market's own global
    ///      index, not this caller's position, so it is safe (and cheaper) to run in the adapter's
    ///      context. After it returns, every view below is fresh to the current block or timestamp.
    function accrue(address resource) external override {
        uint256 errCode = IVTokenIsolated(resource).accrueInterest();
        if (errCode != 0) revert VTokenAccrueFailed(resource, errCode);
    }

    // ============================== External — view ==========================

    /// @inheritdoc IResourceAdapter
    function asset(address resource) external view override returns (address) {
        return IVTokenIsolated(resource).underlying();
    }

    /// @inheritdoc IResourceAdapter
    /// @dev The position's RECOVERABLE value: its pro-rata share of `cash + totalBorrows -
    ///      totalReserves`, i.e. the market's exchange rate with `badDebt` excluded from the
    ///      numerator. See the contract NatSpec for why the market's own rate is unusable here.
    ///      Deliberately conservative in one direction: because a redeem still burns tokens at the
    ///      market's un-haircut rate, an exit costs fewer tokens than this mark implies, so the mark
    ///      can never overstate what the position delivers.
    function totalAssets(address resource, address holder) external view override returns (uint256) {
        uint256 vBal = IVTokenIsolated(resource).balanceOf(holder);
        if (vBal == 0) return 0;
        return _recoverableValue(resource, vBal);
    }

    /// @inheritdoc IResourceAdapter
    /// @dev Honors, in order: the market's supply allowlist (against `msg.sender`, the prospective
    ///      supplier — see the contract NatSpec), its MINT pause, and its supply cap. The headroom
    ///      math mirrors `preMintHook`'s `nextTotalSupply = totalSupply x exchangeRate + mintAmount`
    ///      check and so uses the market's own (badDebt-inclusive) exchange rate, NOT the valuation
    ///      basis {totalAssets} uses. Room below one vToken unit is reported as zero, because a
    ///      deposit of it would mint nothing.
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
    /// @dev Two constraints: the position's recoverable value, and the market's payable cash
    ///      (`getCash - totalReserves` — reserves sit inside cash but are not redeemable, and
    ///      `_redeemFresh` gates on the difference). Subtracting reserves also makes this figure
    ///      invariant across the reserve sweep `accrueInterest` performs, which lowers cash and
    ///      reserves by the same amount.
    ///
    ///      The cash side is floored to what a WHOLE number of vTokens is worth, because a redeem
    ///      rounds its burn up: asking for an amount that is not a whole-token multiple pays out the
    ///      next token up, and asking for exactly the payable cash would therefore overshoot it and
    ///      revert `RedeemTransferOutNotPossible`. Flooring is exact rather than conservative — the
    ///      round-up can never exceed the token count this floor is taken at — so unlike a flat
    ///      margin it still lets the last vToken out, which is what lets a market be drained to zero
    ///      and deregistered.
    ///
    ///      The floor is necessary but not sufficient, so the bound is finally checked against the
    ///      market's own redeem arithmetic: whatever request {withdraw} would issue for it has to
    ///      produce a non-zero payout AND settle within the payable cash, or this reports zero. That
    ///      check is exact rather than a safety margin, so a market holding real liquidity still
    ///      reports all of it.
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
        uint256 ourValue = _recoverableValue(resource, vBal);
        if (ourValue == 0) return 0;

        uint256 cash = IVTokenIsolated(resource).getCash();
        uint256 reserves = IVTokenIsolated(resource).totalReserves();
        if (cash <= reserves) return 0;

        uint256 exchangeRate = IVTokenIsolated(resource).exchangeRateStored();
        if (exchangeRate == 0) return 0;
        uint256 payableTokens = ((cash - reserves) * EXP_SCALE) / exchangeRate;
        uint256 cashBound = (payableTokens * exchangeRate) / EXP_SCALE;

        uint256 liquid = ourValue < cashBound ? ourValue : cashBound;
        if (liquid == 0) return 0;

        // Certify the bound only if the redeem it implies actually settles. Re-run the market's own
        // arithmetic on the request {withdraw} would issue for `liquid`, because the whole-vToken
        // floor above is not sufficient on its own in two cases. A bound worth less than one vToken
        // is raised by {_bumpToSettleable} to a request whose round-up burns a SECOND token,
        // doubling the payout past the cash this bound was sized for. And at an exchange rate below
        // `1e18` — normal for an underlying with fewer decimals — the payout can truncate to zero,
        // which the market rejects outright. Mirroring beats a blanket safety margin here: a market
        // holding real liquidity still reports all of it, so a position stays fully drainable.
        uint256 payout = _redeemPayout(exchangeRate, _bumpToSettleable(exchangeRate, liquid));
        if (payout == 0 || payout > cash - reserves) return 0;
        return liquid;
    }

    /// @inheritdoc IResourceAdapter
    /// @dev The `blocksPerYear` parameter is IGNORED. An isolated-pools market carries its own
    ///      annualiser as an immutable and can be block-based or time-based, so a YieldGroup-level
    ///      constant would misprice whichever kind it was not configured for; the market's own value
    ///      always matches the unit of its own rate. Deploy the spoke YieldGroup with
    ///      `blocksPerYear = 0`, as the Flux family already does.
    function spotAPYBps(address resource, uint256 /* blocksPerYear */) external view override returns (uint64) {
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
    /// @dev Rejects a market whose supply allowlist is enabled without the registering YieldGroup on
    ///      it: minting would revert on every deposit, so the resource would occupy a queue slot it
    ///      can never fill. `msg.sender` is the YieldGroup (see the contract NatSpec), which is the
    ///      account the market's allowlist gates.
    ///
    ///      This doubles as the check that `resource` really belongs to a spoke pool: the allowlist
    ///      accessors exist only on `SpokeComptroller`, so the call itself reverts against any other
    ///      Comptroller. Nothing else is asserted. In particular an unset `deviationBoundedOracle`
    ///      is NOT grounds for rejection: it blocks borrowing, and so the market's yield, but leaves
    ///      the Hub's own paths intact — `preMintHook` never reads a price, and `preRedeemHook`
    ///      returns before the priced liquidity check for an account that is not a market member,
    ///      which a supply-only YieldGroup never becomes.
    function validateRegistration(address resource) external view override {
        ISpokeComptroller comptrollerContract = ISpokeComptroller(IVTokenIsolated(resource).comptroller());
        if (
            comptrollerContract.isSupplyAllowlistEnabled(resource) &&
            !comptrollerContract.isAllowedSupplier(resource, msg.sender)
        ) {
            revert SupplyNotAllowed(resource, msg.sender);
        }
    }

    // ============================== Private — view ===========================

    /**
     * @notice Value `vBal` vTokens at the market's backing EXCLUDING written-off debt.
     * @dev `vBal x (cash + totalBorrows - totalReserves) / totalSupply`, in one rounding step. This
     *      is `exchangeRateStored` with `badDebt` dropped from the numerator.
     * @param resource Market holding the position.
     * @param vBal vToken units held (caller has already established this is non-zero).
     * @return value Recoverable underlying value of the position.
     */
    function _recoverableValue(address resource, uint256 vBal) private view returns (uint256 value) {
        uint256 supply = IVTokenIsolated(resource).totalSupply();
        // Unreachable while `vBal` is non-zero, which every caller has already established. Kept as
        // a division guard rather than an assumption about a contract this one does not own.
        if (supply == 0) return 0;

        uint256 backing = IVTokenIsolated(resource).getCash() + IVTokenIsolated(resource).totalBorrows();
        uint256 reserves = IVTokenIsolated(resource).totalReserves();
        // The market keeps `cash >= totalReserves` (both the redeem and borrow paths check cash net
        // of reserves), so this only guards a pathological state rather than an expected one.
        if (backing <= reserves) return 0;

        return (vBal * (backing - reserves)) / supply;
    }

    /**
     * @notice Underlying value of exactly one vToken, rounded up.
     * @param exchangeRate Market's stored exchange rate, scaled by `1e18`.
     * @return unit `ceil(exchangeRate / 1e18)`.
     */
    function _oneVTokenUnit(uint256 exchangeRate) private pure returns (uint256 unit) {
        return (exchangeRate + EXP_SCALE - 1) / EXP_SCALE;
    }

    /**
     * @notice Raise a redeem the market would settle for nothing up to the smallest one it settles.
     * @dev The market burns `floor(amount x 1e18 / exchangeRate)` vTokens, rounds that up when those
     *      tokens are not worth exactly `amount`, then truncates the payout back to underlying — and
     *      reverts `"redeemAmount is zero"` if the payout truncates away. A withdraw cascade can
     *      legitimately hand this adapter a dust `amount` (e.g. a 1-wei remainder left after an
     *      upstream ERC-4626 resource rounds its own redeem down), which would otherwise revert an
     *      entirely valid, within-{maxWithdraw} withdrawal. Redeem the smallest settleable amount
     *      instead; {withdraw} still forwards only `amount` and leaves the surplus idle on the
     *      YieldGroup. A no-op for normal-sized redeems.
     *
     *      The trigger is the PAYOUT truncating to zero, not the burn. Those coincide only while the
     *      rate is at or above `1e18`. Below it — the normal state for an underlying with fewer
     *      decimals than the vToken, e.g. a 6-decimal stablecoin listed at a `1e16` initial rate — a
     *      dust request burns plenty of tokens and still pays out nothing, so a burn-based test
     *      would never fire on exactly the markets that need it.
     * @param exchangeRate Market's stored exchange rate, scaled by `1e18`.
     * @param amount Underlying units the caller intends to redeem.
     * @return bumped `amount`, or the value of the fewest vTokens worth a non-zero payout.
     */
    function _bumpToSettleable(uint256 exchangeRate, uint256 amount) private pure returns (uint256 bumped) {
        if (exchangeRate == 0) return amount;
        if (_redeemPayout(exchangeRate, amount) != 0) return amount;

        // Fewest vTokens worth at least one unit of underlying, then the smallest request that
        // redeems that many. Reduces to `ceil(exchangeRate / 1e18)` — one whole vToken — whenever the
        // rate is at or above `1e18`.
        uint256 minTokens = (EXP_SCALE + exchangeRate - 1) / exchangeRate;
        return (minTokens * exchangeRate + EXP_SCALE - 1) / EXP_SCALE;
    }

    /**
     * @notice Underlying the market would pay out for a `redeemUnderlying(request)` call.
     * @dev A line-for-line mirror of `_redeemFresh`: floor the request into vTokens, round the burn
     *      up when that many tokens are not worth exactly the request, then truncate the payout back
     *      to underlying. The payout is therefore `>= request` (the over-delivery {withdraw} retains
     *      as idle) except when it truncates to `0`, which is the market's own reject condition.
     *      Used by {maxWithdraw} to avoid certifying a bound the market will not settle.
     * @param exchangeRate Market's stored exchange rate, scaled by `1e18`. Caller has established
     *        this is non-zero.
     * @param request Underlying units that would be passed to `redeemUnderlying`.
     * @return payout Underlying units the market would transfer out.
     */
    function _redeemPayout(uint256 exchangeRate, uint256 request) private pure returns (uint256 payout) {
        uint256 tokens = (request * EXP_SCALE) / exchangeRate;
        uint256 probe = (tokens * exchangeRate) / EXP_SCALE;
        if (probe != 0 && probe != request) ++tokens;
        return (tokens * exchangeRate) / EXP_SCALE;
    }
}

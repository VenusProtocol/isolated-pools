// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

/**
 * @title IResourceAdapter
 * @author Venus
 * @notice Boundary between a `YieldGroup` and a specific yield-protocol ABI (e.g. Compound-
 *         style vTokens for Core V1, a different shape for Core V2, Fluid for Flux, etc.).
 *         A single deployment of each implementation is shared across every YieldGroup that
 *         registers a resource of the matching protocol family.
 * @dev Dispatch model — load-bearing for security review:
 *      - **Mutating functions (`deposit`, `withdraw`) MUST be invoked via DELEGATECALL** from
 *        the YieldGroup. They execute in the YieldGroup's storage context so that
 *        receipt-token credits and debits land on the YieldGroup, not the adapter. Adapter
 *        implementations enforce this with an `address(this) != _ADAPTER_SELF` guard.
 *      - **View functions are invoked via normal CALL / STATICCALL.** They take an explicit
 *        `holder` parameter (the YieldGroup) where their answer depends on whose position is
 *        being queried.
 *      - **`accrue` is invoked via normal CALL** (not delegatecall). It settles the resource's
 *        own global interest state and credits nothing to the holder, so it needs neither the
 *        YieldGroup's storage context nor an `onlyDelegateCall` guard.
 *
 *      Adapter implementation invariants (required of every adapter; enforced in-code):
 *      1. The contract declares zero storage variables; only `immutable` values are
 *         permitted (immutables live in bytecode, not storage slots, so they're safe across
 *         delegatecall).
 *      2. No inline assembly performs `sstore`.
 *      3. External calls go only to (a) the supplied `resource`, (b) addresses the resource
 *         itself reports — its asset (`underlying()` on a vToken, `asset()` on an ERC-4626
 *         resource) and, where applicable, its `comptroller()` — and (c) trusted, chain-fixed
 *         addresses captured as immutables at construction (e.g. AdapterFlux's `LENDING_RESOLVER`,
 *         read-only). Never an arbitrary user-supplied address. The exact target set is
 *         per-adapter; see each implementation's NatSpec for its list.
 *      4. Mutating functions revert when called outside a delegatecall context, preventing
 *         accidental direct invocation that would orphan receipt tokens on the adapter.
 */
interface IResourceAdapter {
    // -------------------------------- Mutating -------------------------------

    /**
     * @notice Deposit `amount` of the resource's underlying into `resource`.
     * @dev MUST be delegatecalled from the YieldGroup. Pre-conditions:
     *      - The YieldGroup already holds `amount` of `underlying` (transferred in by the
     *        caller of `YieldGroup.deposit`).
     *      Post-conditions:
     *      - Receipt tokens (e.g. vTokens) are credited to the YieldGroup.
     *      - The full `amount` of `underlying` leaves the YieldGroup into `resource` (under
     *        delegatecall the code runs in the YieldGroup's context, so the adapter contract
     *        itself never custodies funds).
     * @param resource Underlying yield protocol address (e.g. a Venus vToken).
     * @param amount Underlying units to deposit.
     * @return deposited Actual amount placed; equals `amount` on success.
     */
    function deposit(address resource, uint256 amount) external returns (uint256 deposited);

    /**
     * @notice Redeem exactly `amount` of underlying from `resource` and deliver it to `to`.
     * @dev MUST be delegatecalled from the YieldGroup. Pre-conditions:
     *      - The YieldGroup holds enough receipt tokens to back the redeem.
     *      Post-conditions:
     *      - `to` receives exactly `amount` of underlying.
     *      - Some adapters redeem slightly more than `amount` and leave the excess as idle on
     *        the YieldGroup (AdapterCoreV1's treasury-fee gross-up and its sub-one-vToken dust
     *        bump; AdapterSpokeV1 on every redeem, because an isolated-pools market rounds its
     *        burn up and then recomputes the payout from the rounded-up token count). Such
     *        surplus is counted in `totalAssets` and consumed idle-first on the next call.
     *        Fee-free adapters (Flux, FRV) leave no surplus.
     * @param resource Underlying yield protocol address.
     * @param amount Net underlying units to deliver to `to`.
     * @param to Recipient of the underlying.
     */
    function withdraw(address resource, uint256 amount, address to) external;

    /**
     * @notice Settle `resource`'s accrued interest up to the current block, so a subsequent
     *         {totalAssets} read values the position at a fresh exchange rate rather than a
     *         one-cycle-stale one.
     * @dev Invoked via normal CALL (not delegatecall): it mutates the resource's own global
     *      interest state, not the holder's position, so receipt tokens never move. Only
     *      block-lazy adapters do real work here — Core and Spoke poke their vToken's
     *      `accrueInterest`; Flux and FRV implement it as a no-op (their NAV is not a block-lazy
     *      exchange rate).
     * @param resource Underlying yield protocol address to settle interest on.
     */
    function accrue(address resource) external;

    // ---------------------------------- Views --------------------------------

    /**
     * @notice The ERC-20 underlying accepted by `resource`. YieldGroup uses this to validate
     *         that a resource's asset matches its own at registration time.
     * @param resource Underlying yield protocol address.
     * @return underlying Address of the asset token.
     */
    function asset(address resource) external view returns (address underlying);

    /**
     * @notice Underlying value held by `holder` via `resource`, using stale (non-accruing)
     *         exchange-rate state. Cheap; safe to call from Hub-level totalAssets aggregation.
     * @param resource Underlying yield protocol address.
     * @param holder Address whose position to value (the YieldGroup).
     * @return value Underlying units `holder` holds via this resource.
     */
    function totalAssets(address resource, address holder) external view returns (uint256 value);

    /**
     * @notice Spare deposit headroom on `resource` right now (capacity remaining before the
     *         resource rejects mint via its own caps or pause).
     * @param resource Underlying yield protocol address.
     * @return capacity Underlying units a holder can still place into this resource.
     */
    function maxDeposit(address resource) external view returns (uint256 capacity);

    /**
     * @notice Underlying that `holder` can withdraw from `resource` right now, NET of any
     *         protocol fees that will be taken on redeem. Bounded by the lesser of `holder`'s
     *         position value and the resource's available cash.
     * @param resource Underlying yield protocol address.
     * @param holder Address whose position to query (the YieldGroup).
     * @return liquid Underlying units deliverable to a recipient on a redeem call.
     */
    function maxWithdraw(address resource, address holder) external view returns (uint256 liquid);

    /**
     * @notice Spot supply-side APY for `resource` in BPS.
     * @dev `blocksPerYear` is consumed only by block-rate adapters (e.g. Core annualises a
     *      per-block supply rate with it). Adapters whose yieldGroup is already annualised — Flux
     *      (Fluid APR) and FRV (time-based fixed APY) — ignore the parameter, as does Spoke, whose
     *      markets each carry their own annualiser and may be block- or time-based.
     * @param resource Underlying yield protocol address.
     * @param blocksPerYear Per-chain block cadence (chain-dependent; ~10_512_000 on BNB Chain);
     *        used only by block-rate adapters, ignored by the rest.
     * @return apyBps Spot APY in basis points (capped at `uint64.max`).
     */
    function spotAPYBps(address resource, uint256 blocksPerYear) external view returns (uint64 apyBps);

    /**
     * @notice Raw receipt-token balance `holder` owns via `resource` (vToken / fToken / FRV
     *         shares), in receipt-token units — NOT underlying value.
     * @dev Used by `YieldGroup.removeResource` as a share-based emptiness gate. A value-based
     *      check (`totalAssets`) rounds a small-but-non-zero receipt balance down to 0, which
     *      would let removal orphan those receipt tokens; reading the raw balance closes that gap.
     * @param resource Underlying yield protocol address.
     * @param holder Address whose receipt balance to read (the YieldGroup).
     * @return shares Receipt-token units `holder` holds in this resource.
     */
    function receiptBalance(address resource, address holder) external view returns (uint256 shares);

    /**
     * @notice Revert if `resource` fails a protocol-specific precondition for registration.
     * @dev Called by `YieldGroup.addResource`. AdapterCoreV1 rejects a vToken whose Comptroller
     *      charges a non-zero `treasuryPercent` — that exit fee leaves the pool on every redeem
     *      without burning shares, so it is unmodeled in the Hub's gross NAV and must not be
     *      registered. AdapterSpokeV1 rejects a market whose supply allowlist is enabled without
     *      the registering YieldGroup on it, since every deposit would revert; that call also
     *      proves the market belongs to a spoke pool, because no other Comptroller exposes the
     *      allowlist. FRV and Flux have no per-redeem pool fee and implement this as a no-op.
     * @param resource Underlying yield protocol address being registered.
     */
    function validateRegistration(address resource) external view;
}

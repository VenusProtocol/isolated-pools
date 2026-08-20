// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

/**
 * @title IVTokenIsolated
 * @author Venus
 * @notice Minimal subset of the Venus isolated-pools `VToken` interface needed by the Spoke Yield
 *         Group adapter. Kept narrow on purpose, and kept SEPARATE from the Core `IVToken`: the two
 *         share most selectors but differ in semantics on every line that matters to an adapter, so
 *         one interface serving both would attach the wrong contract to the wrong reader.
 * @dev The four semantic differences from Core's `VBep20`, each verified against
 *      `isolated-pools/contracts/VToken.sol`:
 *
 *      1. **`badDebt` is inside the exchange rate.** `_exchangeRateStored` computes
 *         `(totalCash + totalBorrows + badDebt - totalReserves) / totalSupply`. `healAccount` moves
 *         an unrecoverable shortfall out of `totalBorrows` and into `badDebt`, leaving that
 *         numerator unchanged — so the rate does NOT fall when a loss is recorded and no supplier is
 *         marked down. Valuing a position at `balance x exchangeRateStored` therefore reports value
 *         that can never be redeemed. `AdapterSpokeV1` values the position off the components
 *         instead, excluding `badDebt`; that is why `totalBorrows`, `totalReserves` and `badDebt`
 *         are declared here at all.
 *      2. **Redeem is bounded by cash NET of reserves.** `_redeemFresh` reverts
 *         `RedeemTransferOutNotPossible` when `getCash() - totalReserves < redeemAmount`, not when
 *         `getCash() < redeemAmount`. Reserves are not payable liquidity.
 *      3. **`redeemUnderlying` OVER-delivers.** It burns `ceil(redeemAmount / exchangeRate)` tokens
 *         and then transfers `truncate(exchangeRate x tokens)`, which is `>= redeemAmount` by up to
 *         one vToken unit of underlying. Callers must transfer the exact requested amount onward and
 *         retain the surplus; they must NOT assume an exact delivery.
 *      4. **No per-redeem pool fee.** Isolated pools take their cut through `reserveFactorMantissa`
 *         (already netted out of the exchange rate) and route it to the ProtocolShareReserve. There
 *         is no `treasuryPercent` equivalent, so there is nothing to gross up on redeem.
 *
 *      Shared with Core: `mint` pulls `mintAmount` from `msg.sender` and credits vTokens to
 *      `msg.sender`; both mutating calls return a Compound-style error code that isolated pools
 *      always sets to `NO_ERROR` (failures revert instead); `mintBehalf` /
 *      `redeemUnderlyingBehalf` exist but are on no path here, because the adapter is delegatecalled
 *      and so is already `msg.sender` from the vToken's perspective.
 */
interface IVTokenIsolated {
    // -------------------------------- Mutating -------------------------------

    /**
     * @notice Supply `mintAmount` of underlying and receive vTokens.
     * @dev Accrues interest first, so the supply-cap check in `preMintHook` runs against a
     *      POST-accrual exchange rate — one notch tighter than the rate a `maxDeposit` view reads.
     * @param mintAmount Underlying units to deposit.
     * @return errorCode Compound-style error code; always `0` (failures revert).
     */
    function mint(uint256 mintAmount) external returns (uint256 errorCode);

    /**
     * @notice Burn vTokens and receive AT LEAST `redeemAmount` of underlying.
     * @dev Over-delivers by up to one vToken unit of underlying (see note 3 in the contract NatSpec).
     *      Reverts `"redeemAmount is zero"` when `redeemAmount x 1e18 < exchangeRateStored()`, i.e.
     *      when the burn would round to zero tokens.
     * @param redeemAmount Underlying units to withdraw.
     * @return errorCode Compound-style error code; always `0` (failures revert).
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256 errorCode);

    /**
     * @notice Settle accrued interest into the stored exchange rate up to the current block or
     *         timestamp.
     * @dev Also sweeps accrued reserves to the ProtocolShareReserve once
     *      `reduceReservesBlockDelta` has elapsed. That lowers `getCash()` and `totalReserves()` by
     *      the same amount, so any quantity derived from `getCash() - totalReserves()` is invariant
     *      across the sweep.
     * @return errorCode Compound-style error code; always `0` (failures revert).
     */
    function accrueInterest() external returns (uint256 errorCode);

    // ---------------------------------- Views --------------------------------

    /**
     * @notice vToken balance of `account`, in vToken units (NOT underlying).
     * @param account Holder to query.
     * @return balance vToken units held by `account`.
     */
    function balanceOf(address account) external view returns (uint256 balance);

    /// @notice Total vToken supply, in vToken units.
    /// @return supply Total outstanding vTokens.
    function totalSupply() external view returns (uint256 supply);

    /**
     * @notice Last-settled underlying-per-vToken exchange rate, scaled by `1e18`.
     * @dev INCLUDES `badDebt` in its numerator, so it is the rate the market redeems and prices caps
     *      at, but NOT a sound basis for valuing a position. Use it for supply-cap math and for
     *      sizing a redeem; use the components for NAV.
     * @return rate Exchange rate scaled by `1e18`.
     */
    function exchangeRateStored() external view returns (uint256 rate);

    /**
     * @notice Underlying cash the market tracks internally (`internalCash`, not the token balance).
     * @dev Reserves sit inside this figure but are not redeemable; subtract `totalReserves()` before
     *      treating it as payable liquidity.
     * @return cash Underlying units tracked by the market.
     */
    function getCash() external view returns (uint256 cash);

    /// @notice Outstanding borrows, in underlying units. Excludes anything already written off to
    ///         `badDebt`.
    /// @return borrows Underlying units currently borrowed.
    function totalBorrows() external view returns (uint256 borrows);

    /// @notice Accrued protocol reserves, in underlying units. Not payable to suppliers.
    /// @return reserves Underlying units reserved for the protocol.
    function totalReserves() external view returns (uint256 reserves);

    /**
     * @notice Debt written off as unrecoverable by `healAccount`, in underlying units.
     * @dev Recovered by the Shortfall auction, which transfers the winning bid into this market and
     *      then calls `badDebtRecovered` — raising `getCash()` and lowering this figure by the same
     *      amount, so a recovery lifts a `badDebt`-excluding valuation back up on its own.
     * @return debt Underlying units of unrecoverable debt.
     */
    function badDebt() external view returns (uint256 debt);

    /// @notice The ERC-20 underlying this market is backed by.
    /// @return token Address of the underlying ERC-20.
    function underlying() external view returns (address token);

    /// @notice Comptroller of the pool this market belongs to.
    /// @return comptrollerAddress Address of the pool's Comptroller.
    function comptroller() external view returns (address comptrollerAddress);

    /**
     * @notice Current supply interest rate per slot, scaled by `1e18`.
     * @dev A "slot" is a block on a block-based market and a second on a time-based one; annualise
     *      with {blocksOrSecondsPerYear}, never with a chain-level constant.
     * @return rate Per-slot supply rate, scaled by `1e18`.
     */
    function supplyRatePerBlock() external view returns (uint256 rate);

    /**
     * @notice Slots per year for this market: blocks per year on a block-based market, seconds per
     *         year on a time-based one.
     * @dev An immutable set at construction (`TimeManagerV8`), so it is the only annualiser that
     *      matches this market's rate unit. A YieldGroup-level `blocksPerYear` cannot, because one
     *      YieldGroup can hold markets of both kinds.
     * @return periods Slots per year.
     */
    function blocksOrSecondsPerYear() external view returns (uint256 periods);
}

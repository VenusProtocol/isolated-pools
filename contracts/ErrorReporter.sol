// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

contract TokenErrorReporter {
    uint256 public constant NO_ERROR = 0; // support legacy return codes

    error TransferNotAllowed();

    error MintFreshnessCheck();

    error RedeemFreshnessCheck();
    error RedeemTransferOutNotPossible();

    error BorrowFreshnessCheck();
    error BorrowCashNotAvailable();

    error RepayBorrowFreshnessCheck();

    error HealBorrowUnauthorized();
    error ForceLiquidateBorrowUnauthorized();

    error LiquidateFreshnessCheck();
    error LiquidateCollateralFreshnessCheck();
    error LiquidateAccrueCollateralInterestFailed(uint256 errorCode);
    error LiquidateLiquidatorIsBorrower();
    error LiquidateCloseAmountIsZero();
    error LiquidateCloseAmountIsUintMax();

    error LiquidateSeizeLiquidatorIsBorrower();

    error ProtocolSeizeShareTooBig();

    error SetReserveFactorFreshCheck();
    error SetReserveFactorBoundsCheck();

    error AddReservesFactorFreshCheck(uint256 actualAddAmount);

    error ReduceReservesFreshCheck();
    error ReduceReservesCashNotAvailable();
    error ReduceReservesCashValidation();

    error SetInterestRateModelFreshCheck();
}

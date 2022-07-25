// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../ExponentialNoError.sol";
import "../CToken.sol";
import "../Governance/Comp.sol";

contract RewardsDistributor is ExponentialNoError {
  struct CompMarketState {
        // The market's last updated compBorrowIndex or compSupplyIndex
        uint224 index;

        // The block number the index was last updated at
        uint32 block;
    }

  /**
    * @notice Calculate COMP accrued by a supplier and possibly transfer it to them
    * @param cToken The market in which the supplier is interacting
    * @param supplier The address of the supplier to distribute COMP to
    */
  /// @notice The COMP market supply state for each market
  mapping(address => CompMarketState) public compSupplyState;

  /// @notice The COMP borrow index for each market for each supplier as of the last time they accrued COMP
  mapping(address => mapping(address => uint)) public compSupplierIndex;

  /// @notice The initial COMP index for a market
  uint224 public constant compInitialIndex = 1e36;

  /// @notice The COMP accrued but not yet transferred to each user
  mapping(address => uint) public compAccrued;

  /// @notice The rate at which comp is distributed to the corresponding borrow market (per block)
  mapping(address => uint) public compBorrowSpeeds;

  /// @notice The rate at which comp is distributed to the corresponding supply market (per block)
  mapping(address => uint) public compSupplySpeeds;

  /// @notice The COMP market borrow state for each market
  mapping(address => CompMarketState) public compBorrowState;

  /// @notice Emitted when COMP is distributed to a supplier
  event DistributedSupplierComp(CToken indexed cToken, address indexed supplier, uint compDelta, uint compSupplyIndex);

  /// @notice Emitted when COMP is distributed to a borrower
  event DistributedBorrowerComp(CToken indexed cToken, address indexed borrower, uint compDelta, uint compBorrowIndex);

  /// @notice Emitted when a new supply-side COMP speed is calculated for a market
  event CompSupplySpeedUpdated(CToken indexed cToken, uint newSpeed);

  /// @notice Emitted when a new borrow-side COMP speed is calculated for a market
  event CompBorrowSpeedUpdated(CToken indexed cToken, uint newSpeed);

  /// @notice The COMP borrow index for each market for each borrower as of the last time they accrued COMP
  mapping(address => mapping(address => uint)) public compBorrowerIndex;

  /*** Comp Distribution ***/

  /**
    * @notice Set COMP speed for a single market
    * @param cToken The market whose COMP speed to update
    * @param supplySpeed New supply-side COMP speed for market
    * @param borrowSpeed New borrow-side COMP speed for market
    */
  function setCompSpeedInternal(CToken cToken, uint supplySpeed, uint borrowSpeed) internal {
      // Market storage market = markets[address(cToken)];
      // require(market.isListed, "comp market is not listed");

      if (compSupplySpeeds[address(cToken)] != supplySpeed) {
          // Supply speed updated so let's update supply state to ensure that
          //  1. COMP accrued properly for the old speed, and
          //  2. COMP accrued at the new speed starts after this block.
          updateCompSupplyIndex(address(cToken));

          // Update speed and emit event
          compSupplySpeeds[address(cToken)] = supplySpeed;
          emit CompSupplySpeedUpdated(cToken, supplySpeed);
      }

      if (compBorrowSpeeds[address(cToken)] != borrowSpeed) {
          // Borrow speed updated so let's update borrow state to ensure that
          //  1. COMP accrued properly for the old speed, and
          //  2. COMP accrued at the new speed starts after this block.
          Exp memory borrowIndex = Exp({mantissa: cToken.borrowIndex()});
          updateCompBorrowIndex(address(cToken), borrowIndex);

          // Update speed and emit event
          compBorrowSpeeds[address(cToken)] = borrowSpeed;
          emit CompBorrowSpeedUpdated(cToken, borrowSpeed);
      }
  }

  function distributeSupplierComp(address cToken, address supplier) internal {
      // TODO: Don't distribute supplier COMP if the user is not in the supplier market.
      // This check should be as gas efficient as possible as distributeSupplierComp is called in many places.
      // - We really don't want to call an external contract as that's quite expensive.

      CompMarketState storage supplyState = compSupplyState[cToken];
      uint supplyIndex = supplyState.index;
      uint supplierIndex = compSupplierIndex[cToken][supplier];

      // Update supplier's index to the current index since we are distributing accrued COMP
      compSupplierIndex[cToken][supplier] = supplyIndex;

      if (supplierIndex == 0 && supplyIndex >= compInitialIndex) {
          // Covers the case where users supplied tokens before the market's supply state index was set.
          // Rewards the user with COMP accrued from the start of when supplier rewards were first
          // set for the market.
          supplierIndex = compInitialIndex;
      }

      // Calculate change in the cumulative sum of the COMP per cToken accrued
      Double memory deltaIndex = Double({mantissa: sub_(supplyIndex, supplierIndex)});

      uint supplierTokens = CToken(cToken).balanceOf(supplier);

      // Calculate COMP accrued: cTokenAmount * accruedPerCToken
      uint supplierDelta = mul_(supplierTokens, deltaIndex);

      uint supplierAccrued = add_(compAccrued[supplier], supplierDelta);
      compAccrued[supplier] = supplierAccrued;

      emit DistributedSupplierComp(CToken(cToken), supplier, supplierDelta, supplyIndex);
  }

  /**
     * @notice Calculate COMP accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute COMP to
     */
    function distributeBorrowerComp(address cToken, address borrower, Exp memory marketBorrowIndex) internal {
        // TODO: Don't distribute supplier COMP if the user is not in the borrower market.
        // This check should be as gas efficient as possible as distributeBorrowerComp is called in many places.
        // - We really don't want to call an external contract as that's quite expensive.

        CompMarketState storage borrowState = compBorrowState[cToken];
        uint borrowIndex = borrowState.index;
        uint borrowerIndex = compBorrowerIndex[cToken][borrower];

        // Update borrowers's index to the current index since we are distributing accrued COMP
        compBorrowerIndex[cToken][borrower] = borrowIndex;

        if (borrowerIndex == 0 && borrowIndex >= compInitialIndex) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set.
            // Rewards the user with COMP accrued from the start of when borrower rewards were first
            // set for the market.
            borrowerIndex = compInitialIndex;
        }

        // Calculate change in the cumulative sum of the COMP per borrowed unit accrued
        Double memory deltaIndex = Double({mantissa: sub_(borrowIndex, borrowerIndex)});

        uint borrowerAmount = div_(CToken(cToken).borrowBalanceStored(borrower), marketBorrowIndex);

        // Calculate COMP accrued: cTokenAmount * accruedPerBorrowedUnit
        uint borrowerDelta = mul_(borrowerAmount, deltaIndex);

        uint borrowerAccrued = add_(compAccrued[borrower], borrowerDelta);
        compAccrued[borrower] = borrowerAccrued;

        emit DistributedBorrowerComp(CToken(cToken), borrower, borrowerDelta, borrowIndex);
    }

  /**
    * @notice Transfer COMP to the user
    * @dev Note: If there is not enough COMP, we do not perform the transfer all.
    * @param user The address of the user to transfer COMP to
    * @param amount The amount of COMP to (possibly) transfer
    * @return The amount of COMP which was NOT transferred to the user
    */
  function grantCompInternal(address user, uint amount) internal returns (uint) {
      Comp comp = Comp(getCompAddress());
      uint compRemaining = comp.balanceOf(address(this));
      if (amount > 0 && amount <= compRemaining) {
          comp.transfer(user, amount);
          return 0;
      }
      return amount;
  }

  /**
     * @notice Accrue COMP to the market by updating the supply index
     * @param cToken The market whose supply index to update
     * @dev Index is a cumulative sum of the COMP per cToken accrued.
     */
    function updateCompSupplyIndex(address cToken) internal {
        CompMarketState storage supplyState = compSupplyState[cToken];
        uint supplySpeed = compSupplySpeeds[cToken];
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");
        uint deltaBlocks = sub_(uint(blockNumber), uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = CToken(cToken).totalSupply();
            uint compAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(compAccrued, supplyTokens) : Double({mantissa: 0});
            supplyState.index = safe224(add_(Double({mantissa: supplyState.index}), ratio).mantissa, "new index exceeds 224 bits");
            supplyState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            supplyState.block = blockNumber;
        }
    }

    /**
     * @notice Accrue COMP to the market by updating the borrow index
     * @param cToken The market whose borrow index to update
     * @dev Index is a cumulative sum of the COMP per cToken accrued.
     */
    function updateCompBorrowIndex(address cToken, Exp memory marketBorrowIndex) internal {
        CompMarketState storage borrowState = compBorrowState[cToken];
        uint borrowSpeed = compBorrowSpeeds[cToken];
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");
        uint deltaBlocks = sub_(uint(blockNumber), uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(CToken(cToken).totalBorrows(), marketBorrowIndex);
            uint compAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(compAccrued, borrowAmount) : Double({mantissa: 0});
            borrowState.index = safe224(add_(Double({mantissa: borrowState.index}), ratio).mantissa, "new index exceeds 224 bits");
            borrowState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            borrowState.block = blockNumber;
        }
    }

  /*** Comp Distribution Admin ***/

  /**
    * @notice Transfer COMP to the recipient
    * @dev Note: If there is not enough COMP, we do not perform the transfer all.
    * @param recipient The address of the recipient to transfer COMP to
    * @param amount The amount of COMP to (possibly) transfer
    */
  function _grantComp(address recipient, uint amount) public {
      require(adminOrInitializing(), "only admin can grant comp");
      uint amountLeft = grantCompInternal(recipient, amount);
      require(amountLeft == 0, "insufficient comp for grant");
      emit CompGranted(recipient, amount);
  }

   /**
     * @notice Return the address of the COMP token
     * @return The address of COMP
     */
    function getCompAddress() virtual public view returns (address) {
        return 0xc00e94Cb662C3520282E6f5717214004A7f26888;
    }

    function getBlockNumber() virtual public view returns (uint) {
        return block.number;
    }
}
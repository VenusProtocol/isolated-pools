// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../../contracts/Comptroller.sol";
import "../../contracts/PriceOracle.sol";


contract ComptrollerHarness is Comptroller {
    uint public blockNumber;

    constructor(address _poolRegistry, address _accessControl)
        Comptroller(_poolRegistry, _accessControl)
        {}

    function setPauseGuardian(address harnessedPauseGuardian) public {
        pauseGuardian = harnessedPauseGuardian;
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() override public view returns (uint) {
        return blockNumber;
    }
}

contract ComptrollerBorked {
    function _become(Unitroller unitroller, PriceOracle _oracle, uint _closeFactorMantissa, uint _maxAssets, bool _reinitializing) public {
        _oracle;
        _closeFactorMantissa;
        _maxAssets;
        _reinitializing;

        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        unitroller._acceptImplementation();
    }
}

/*contract BoolComptroller is ComptrollerInterface {
    bool allowMint = true;
    bool allowRedeem = true;
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;

    bool failCalculateSeizeTokens;
    uint calculatedSeizeTokens;

    uint noError = 0;
    uint opaqueError = noError + 11; // an arbitrary, opaque error code

    function enterMarkets(address[] calldata _cTokens) override external returns (uint[] memory) {
        _cTokens;
        uint[] memory ret;
        return ret;
    }

    function exitMarket(address _cToken) override external returns (uint) {
        _cToken;
        return noError;
    }

    function mintAllowed(address _cToken, address _minter, uint _mintAmount) override public returns (uint) {
        _cToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(address _cToken, address _minter, uint _mintAmount, uint _mintTokens) override external {
        _cToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(address _cToken, address _redeemer, uint _redeemTokens) override public returns (uint) {
        _cToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(address _cToken, address _redeemer, uint _redeemAmount, uint _redeemTokens) override external {
        _cToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function borrowAllowed(address _cToken, address _borrower, uint _borrowAmount) override public returns (uint) {
        _cToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(address _cToken, address _borrower, uint _borrowAmount) override external {
        _cToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _cToken,
        address _payer,
        address _borrower,
        uint _repayAmount) override public returns (uint) {
        _cToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _cToken,
        address _payer,
        address _borrower,
        uint _repayAmount,
        uint _borrowerIndex) override external {
        _cToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function liquidateBorrowAllowed(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount) override public returns (uint) {
        _cTokenBorrowed;
        _cTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount,
        uint _seizeTokens) override external {
        _cTokenBorrowed;
        _cTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _cTokenCollateral,
        address _cTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint _seizeTokens) override public returns (uint) {
        _cTokenCollateral;
        _cTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _cTokenCollateral,
        address _cTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint _seizeTokens) override external {
        _cTokenCollateral;
        _cTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _cToken,
        address _src,
        address _dst,
        uint _transferTokens) override public returns (uint) {
        _cToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _cToken,
        address _src,
        address _dst,
        uint _transferTokens) override external {
        _cToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    function liquidateCalculateSeizeTokens(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        uint _repayAmount) override public view returns (uint, uint) {
        _cTokenBorrowed;
        _cTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    function setMintAllowed(bool allowMint_) public {
        allowMint = allowMint_;
    }

    function setMintVerify(bool verifyMint_) public {
        verifyMint = verifyMint_;
    }

    function setRedeemAllowed(bool allowRedeem_) public {
        allowRedeem = allowRedeem_;
    }

    function setRedeemVerify(bool verifyRedeem_) public {
        verifyRedeem = verifyRedeem_;
    }

    function setBorrowAllowed(bool allowBorrow_) public {
        allowBorrow = allowBorrow_;
    }

    function setBorrowVerify(bool verifyBorrow_) public {
        verifyBorrow = verifyBorrow_;
    }

    function setRepayBorrowAllowed(bool allowRepayBorrow_) public {
        allowRepayBorrow = allowRepayBorrow_;
    }

    function setRepayBorrowVerify(bool verifyRepayBorrow_) public {
        verifyRepayBorrow = verifyRepayBorrow_;
    }

    function setLiquidateBorrowAllowed(bool allowLiquidateBorrow_) public {
        allowLiquidateBorrow = allowLiquidateBorrow_;
    }

    function setLiquidateBorrowVerify(bool verifyLiquidateBorrow_) public {
        verifyLiquidateBorrow = verifyLiquidateBorrow_;
    }

    function setSeizeAllowed(bool allowSeize_) public {
        allowSeize = allowSeize_;
    }

    function setSeizeVerify(bool verifySeize_) public {
        verifySeize = verifySeize_;
    }

    function setTransferAllowed(bool allowTransfer_) public {
        allowTransfer = allowTransfer_;
    }

    function setTransferVerify(bool verifyTransfer_) public {
        verifyTransfer = verifyTransfer_;
    }

    function setCalculatedSeizeTokens(uint seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }
}*/

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns(string memory) {
        return s;
    }

    function addresses(address a) public pure returns(address) {
        return a;
    }

    function booly(bool b) public pure returns(bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns(uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}

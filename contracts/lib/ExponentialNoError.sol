// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { EXP_SCALE as EXP_SCALE_, MANTISSA_ONE as MANTISSA_ONE_ } from "./constants.sol";

library ExponentialNoError {
    struct Exp {
        uint256 mantissa;
    }

    struct Double {
        uint256 mantissa;
    }

    uint256 internal constant EXP_SCALE = EXP_SCALE_;
    uint256 internal constant DOUBLE_SCALE = 1e36;
    uint256 internal constant HALF_EXP_SCALE = EXP_SCALE / 2;
    uint256 internal constant MANTISSA_ONE = MANTISSA_ONE_;

    function truncate(Exp memory exp) internal pure returns (uint256) {
        return exp.mantissa / EXP_SCALE;
    }

    function mul_ScalarTruncate(Exp memory a, uint256 scalar) internal pure returns (uint256) {
        Exp memory product = mul_(a, scalar);
        return truncate(product);
    }

    function mul_ScalarTruncateAddUInt(Exp memory a, uint256 scalar, uint256 addend) internal pure returns (uint256) {
        Exp memory product = mul_(a, scalar);
        return add_(truncate(product), addend);
    }

    function lessThanExp(Exp memory left, Exp memory right) internal pure returns (bool) {
        return left.mantissa < right.mantissa;
    }

    function safe224(uint256 n, string memory errorMessage) internal pure returns (uint224) {
        require(n <= type(uint224).max, errorMessage);
        return uint224(n);
    }

    function safe32(uint256 n, string memory errorMessage) internal pure returns (uint32) {
        require(n <= type(uint32).max, errorMessage);
        return uint32(n);
    }

    function add_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp(add_(a.mantissa, b.mantissa));
    }

    function add_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double(add_(a.mantissa, b.mantissa));
    }

    function add_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }

    function sub_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp(sub_(a.mantissa, b.mantissa));
    }

    function sub_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double(sub_(a.mantissa, b.mantissa));
    }

    function sub_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a - b;
    }

    function mul_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp(mul_(a.mantissa, b.mantissa) / EXP_SCALE);
    }

    function mul_(Exp memory a, uint256 b) internal pure returns (Exp memory) {
        return Exp(mul_(a.mantissa, b));
    }

    function mul_(uint256 a, Exp memory b) internal pure returns (uint256) {
        return mul_(a, b.mantissa) / EXP_SCALE;
    }

    function mul_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double(mul_(a.mantissa, b.mantissa) / DOUBLE_SCALE);
    }

    function mul_(Double memory a, uint256 b) internal pure returns (Double memory) {
        return Double(mul_(a.mantissa, b));
    }

    function mul_(uint256 a, Double memory b) internal pure returns (uint256) {
        return mul_(a, b.mantissa) / DOUBLE_SCALE;
    }

    function mul_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a * b;
    }

    function div_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp(div_(mul_(a.mantissa, EXP_SCALE), b.mantissa));
    }

    function div_(Exp memory a, uint256 b) internal pure returns (Exp memory) {
        return Exp(div_(a.mantissa, b));
    }

    function div_(uint256 a, Exp memory b) internal pure returns (uint256) {
        return div_(mul_(a, EXP_SCALE), b.mantissa);
    }

    function div_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double(div_(mul_(a.mantissa, DOUBLE_SCALE), b.mantissa));
    }

    function div_(Double memory a, uint256 b) internal pure returns (Double memory) {
        return Double(div_(a.mantissa, b));
    }

    function div_(uint256 a, Double memory b) internal pure returns (uint256) {
        return div_(mul_(a, DOUBLE_SCALE), b.mantissa);
    }

    function div_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a / b;
    }

    function fraction(uint256 a, uint256 b) internal pure returns (Double memory) {
        return Double(div_(mul_(a, DOUBLE_SCALE), b));
    }
}

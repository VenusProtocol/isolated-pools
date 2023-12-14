// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { EXP_SCALE as EXP_SCALE_, MANTISSA_ONE as MANTISSA_ONE_ } from "./lib/constants.sol";

/**
 * @title Exponential module for storing fixed-precision decimals
 * @author Compound
 * @notice Exp is a struct which stores decimals with a fixed precision of 18 decimal places.
 *         Thus, if we wanted to store the 5.1, mantissa would store 5.1e18. That is:
 *         `Exp({mantissa: 5100000000000000000})`.
 */
contract ExponentialNoError {
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

    /**
     * @dev Truncates the given exp to a whole number value.
     *      For example, truncate(Exp{mantissa: 15 * EXP_SCALE}) = 15
     */
    function truncate(Exp memory exp) internal pure returns (uint256) {
        // Note: We are not using careful math here as we're performing a division that cannot fail
        return exp.mantissa / EXP_SCALE;
    }

    /**
     * @dev Multiply an Exp by a scalar, then truncate to return an unsigned integer.
     */
    // solhint-disable-next-line func-name-mixedcase
    function mul_ScalarTruncate(Exp memory a, uint256 scalar) internal pure returns (uint256) {
        Exp memory product = mul_(a, scalar);
        return truncate(product);
    }

    /**
     * @dev Multiply an Exp by a scalar, truncate, then add an to an unsigned integer, returning an unsigned integer.
     */
    // solhint-disable-next-line func-name-mixedcase
    function mul_ScalarTruncateAddUInt(Exp memory a, uint256 scalar, uint256 addend) internal pure returns (uint256) {
        Exp memory product = mul_(a, scalar);
        return add_(truncate(product), addend);
    }

    /**
     * @dev Checks if first Exp is less than second Exp.
     */
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
        return Exp({ mantissa: add_(a.mantissa, b.mantissa) });
    }

    function add_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double({ mantissa: add_(a.mantissa, b.mantissa) });
    }

    function add_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }

    function sub_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp({ mantissa: sub_(a.mantissa, b.mantissa) });
    }

    function sub_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double({ mantissa: sub_(a.mantissa, b.mantissa) });
    }

    function sub_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a - b;
    }

    function mul_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp({ mantissa: mul_(a.mantissa, b.mantissa) / EXP_SCALE });
    }

    function mul_(Exp memory a, uint256 b) internal pure returns (Exp memory) {
        return Exp({ mantissa: mul_(a.mantissa, b) });
    }

    function mul_(uint256 a, Exp memory b) internal pure returns (uint256) {
        return mul_(a, b.mantissa) / EXP_SCALE;
    }

    function mul_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double({ mantissa: mul_(a.mantissa, b.mantissa) / DOUBLE_SCALE });
    }

    function mul_(Double memory a, uint256 b) internal pure returns (Double memory) {
        return Double({ mantissa: mul_(a.mantissa, b) });
    }

    function mul_(uint256 a, Double memory b) internal pure returns (uint256) {
        return mul_(a, b.mantissa) / DOUBLE_SCALE;
    }

    function mul_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a * b;
    }

    function div_(Exp memory a, Exp memory b) internal pure returns (Exp memory) {
        return Exp({ mantissa: div_(mul_(a.mantissa, EXP_SCALE), b.mantissa) });
    }

    function div_(Exp memory a, uint256 b) internal pure returns (Exp memory) {
        return Exp({ mantissa: div_(a.mantissa, b) });
    }

    function div_(uint256 a, Exp memory b) internal pure returns (uint256) {
        return div_(mul_(a, EXP_SCALE), b.mantissa);
    }

    function div_(Double memory a, Double memory b) internal pure returns (Double memory) {
        return Double({ mantissa: div_(mul_(a.mantissa, DOUBLE_SCALE), b.mantissa) });
    }

    function div_(Double memory a, uint256 b) internal pure returns (Double memory) {
        return Double({ mantissa: div_(a.mantissa, b) });
    }

    function div_(uint256 a, Double memory b) internal pure returns (uint256) {
        return div_(mul_(a, DOUBLE_SCALE), b.mantissa);
    }

    function div_(uint256 a, uint256 b) internal pure returns (uint256) {
        return a / b;
    }

    function fraction(uint256 a, uint256 b) internal pure returns (Double memory) {
        return Double({ mantissa: div_(mul_(a, DOUBLE_SCALE), b) });
    }
}

# Solidity API

## ExponentialNoError

Exp is a struct which stores decimals with a fixed precision of 18 decimal places.
        Thus, if we wanted to store the 5.1, mantissa would store 5.1e18. That is:
        `Exp({mantissa: 5100000000000000000})`.

### expScale

```solidity
uint256 expScale
```

### doubleScale

```solidity
uint256 doubleScale
```

### halfExpScale

```solidity
uint256 halfExpScale
```

### mantissaOne

```solidity
uint256 mantissaOne
```

### Exp

```solidity
struct Exp {
  uint256 mantissa;
}
```

### Double

```solidity
struct Double {
  uint256 mantissa;
}
```

### truncate

```solidity
function truncate(struct ExponentialNoError.Exp exp) internal pure returns (uint256)
```

_Truncates the given exp to a whole number value.
     For example, truncate(Exp{mantissa: 15 * expScale}) = 15_

### mul_ScalarTruncate

```solidity
function mul_ScalarTruncate(struct ExponentialNoError.Exp a, uint256 scalar) internal pure returns (uint256)
```

_Multiply an Exp by a scalar, then truncate to return an unsigned integer._

### mul_ScalarTruncateAddUInt

```solidity
function mul_ScalarTruncateAddUInt(struct ExponentialNoError.Exp a, uint256 scalar, uint256 addend) internal pure returns (uint256)
```

_Multiply an Exp by a scalar, truncate, then add an to an unsigned integer, returning an unsigned integer._

### lessThanExp

```solidity
function lessThanExp(struct ExponentialNoError.Exp left, struct ExponentialNoError.Exp right) internal pure returns (bool)
```

_Checks if first Exp is less than second Exp._

### lessThanOrEqualExp

```solidity
function lessThanOrEqualExp(struct ExponentialNoError.Exp left, struct ExponentialNoError.Exp right) internal pure returns (bool)
```

_Checks if left Exp <= right Exp._

### greaterThanExp

```solidity
function greaterThanExp(struct ExponentialNoError.Exp left, struct ExponentialNoError.Exp right) internal pure returns (bool)
```

_Checks if left Exp > right Exp._

### isZeroExp

```solidity
function isZeroExp(struct ExponentialNoError.Exp value) internal pure returns (bool)
```

_returns true if Exp is exactly zero_

### safe224

```solidity
function safe224(uint256 n, string errorMessage) internal pure returns (uint224)
```

### safe32

```solidity
function safe32(uint256 n, string errorMessage) internal pure returns (uint32)
```

### add_

```solidity
function add_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### add_

```solidity
function add_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### add_

```solidity
function add_(uint256 a, uint256 b) internal pure returns (uint256)
```

### sub_

```solidity
function sub_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### sub_

```solidity
function sub_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### sub_

```solidity
function sub_(uint256 a, uint256 b) internal pure returns (uint256)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Exp a, uint256 b) internal pure returns (struct ExponentialNoError.Exp)
```

### mul_

```solidity
function mul_(uint256 a, struct ExponentialNoError.Exp b) internal pure returns (uint256)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Double a, uint256 b) internal pure returns (struct ExponentialNoError.Double)
```

### mul_

```solidity
function mul_(uint256 a, struct ExponentialNoError.Double b) internal pure returns (uint256)
```

### mul_

```solidity
function mul_(uint256 a, uint256 b) internal pure returns (uint256)
```

### div_

```solidity
function div_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### div_

```solidity
function div_(struct ExponentialNoError.Exp a, uint256 b) internal pure returns (struct ExponentialNoError.Exp)
```

### div_

```solidity
function div_(uint256 a, struct ExponentialNoError.Exp b) internal pure returns (uint256)
```

### div_

```solidity
function div_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### div_

```solidity
function div_(struct ExponentialNoError.Double a, uint256 b) internal pure returns (struct ExponentialNoError.Double)
```

### div_

```solidity
function div_(uint256 a, struct ExponentialNoError.Double b) internal pure returns (uint256)
```

### div_

```solidity
function div_(uint256 a, uint256 b) internal pure returns (uint256)
```

### fraction

```solidity
function fraction(uint256 a, uint256 b) internal pure returns (struct ExponentialNoError.Double)
```


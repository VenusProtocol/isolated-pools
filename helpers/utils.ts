import BigNumber from "bignumber.js";

BigNumber.config({
  FORMAT: {
    decimalSeparator: ".",
    groupSize: 0,
    groupSeparator: "",
    secondaryGroupSize: 0,
    fractionGroupSeparator: "",
    fractionGroupSize: 0,
  },
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: 1e9,
});

export const convertToUnit = (amount: string | number, decimals: number) => {
  return new BigNumber(amount).times(new BigNumber(10).pow(decimals)).toString();
};

export const scaleDownBy = (amount: string | number, decimals: number) => {
  return new BigNumber(amount).dividedBy(new BigNumber(10).pow(decimals)).toString();
};

export const AddressOne = "0x0000000000000000000000000000000000000001";

// Function to get argument types from method signature
export const getArgTypesFromSignature = (methodSignature: string): string[] => {
  const [, argumentString] = methodSignature.split("(")[1].split(")");
  return argumentString.split(",").map(arg => arg.trim());
};

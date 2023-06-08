export interface EntityWithAddress {
  address: string;
}

export type AddressOrContract = string | EntityWithAddress;

export const getAddress = (addressOrContract: AddressOrContract): string => {
  if (typeof addressOrContract === "string") {
    return addressOrContract;
  }
  return addressOrContract.address;
};

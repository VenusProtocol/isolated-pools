import { ContractFactory } from "ethers";

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type DeployedContract<F extends ContractFactory> = ThenArg<ReturnType<F["deploy"]>>;

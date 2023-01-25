import { DocItemContext } from 'solidity-docgen/dist/site';

export const visible = ({ item }: DocItemContext): boolean => {
  // @ts-ignore
  return item.visibility === 'public' || item.visibility === 'external';
}

## Description

<!-- What changes and why. Link the issue or ticket. -->

Resolves #<!-- issue id -->

## Testing

<!--
  Required. Paste the output, not "tests pass": the commands you ran and their result lines,
  e.g. `yarn verify`, a targeted `yarn test tests/hardhat/...`, `forge test --match-contract ...`,
  or a fork test with `FORK=true FORKED_NETWORK=<network>`.
-->

```
<paste output here>
```

## Risk tier

<!--
  Required. Pick one and say why in a sentence.
  - Low: tests, tooling, docs, deploy scripts for testnets only.
  - Medium: contract change behind a new deployment or a governance step, no change to live accounting.
  - High: changes live accounting, liquidation, access control or storage layout of a deployed contract.
-->

## How to revert

<!--
  Required. For a contract change, say exactly how to undo it once deployed, e.g.
  "upgrade the beacon back to implementation 0x…", or "needs a VIP, not revertable".
-->

## Checklist

- [ ] I have updated the documentation to account for the changes in the code.
- [ ] If I added new functionality, I added tests covering it.
- [ ] If I fixed a bug, I added a test preventing this bug from silently reappearing again.
- [ ] I have checked the change against [REVIEW.md](https://github.com/VenusProtocol/isolated-pools/blob/develop/REVIEW.md).

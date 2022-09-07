#!/usr/bin/env node
import main from "../deploy-pool-lens";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

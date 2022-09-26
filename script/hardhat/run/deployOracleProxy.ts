#!/usr/bin/env node
import main from "../test";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

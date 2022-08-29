#!/usr/bin/env node
import main from "../deploy";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

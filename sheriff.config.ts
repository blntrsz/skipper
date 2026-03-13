import type { SheriffConfig } from "@softarc/sheriff-core";

export const config: SheriffConfig = {
  autoTagging: false,
  barrelFileName: "__sheriff__.ts",
  enableBarrelLess: true,
  entryPoints: {
    cli: "./packages/cli/src/Cli.ts",
    core: "./packages/core/src/index.ts",
    coreRuntime: "./packages/core/src/Runtime.ts",
    testRuntime: "./packages/core/src/TestRuntime.ts",
  },
  modules: {
    "packages/<pkg>/src": "pkg:<pkg>",
  },
  depRules: {
    root: ["root", "pkg:cli", "pkg:core"],
    "pkg:cli": ["pkg:cli", "pkg:core", "root"],
    "pkg:core": ["pkg:core", "root"],
  },
};

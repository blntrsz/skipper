import packageJson from "../package.json";
import { Effect } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import { localWorkTreeLayer } from "@skippercorp/core/runtime/local-work-tree.runtime";
import { Command } from "effect/unstable/cli";
import { rootCommand } from "./command.ts";

Command.run(rootCommand, {
  version: packageJson.version,
}).pipe(
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(localWorkTreeLayer),
  Effect.scoped,
  Effect.catchTag("ShowHelp", () => Effect.void),
  BunRuntime.runMain,
);

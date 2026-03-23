import packageJson from "../package.json";
import { Command } from "effect/unstable/cli";
import { Effect } from "effect";
import { workspaceCommand } from "./command/workspace/index.ts";
import { BunRuntime } from "@effect/platform-bun";
import { sessionCommand } from "./command/session/index.ts";
import { taskCommand } from "./command/task/index.ts";
import { localWorkTreeLayer } from "@skippercorp/core/runtime/local-work-tree.runtime";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([workspaceCommand, sessionCommand, taskCommand]),
);

Command.run(command, {
  version: packageJson.version,
}).pipe(
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(localWorkTreeLayer),
  Effect.scoped,
  Effect.catchTag("ShowHelp", () => Effect.void),
  BunRuntime.runMain,
);

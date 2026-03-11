import { Effect } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { CliError, Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { cloneCommand, sandboxCommand, switchCommand } from "./Sandbox/Cli";
import { TaskCli } from "./Task/Cli";
import { runCommand } from "./Agent/Cli";
import { workflowCommand } from "./Workflow/Cli";
import { BunShell } from "./internal/Shell";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([
    cloneCommand,
    switchCommand,
    sandboxCommand,
    runCommand,
    workflowCommand,
    TaskCli,
  ])
);

const cli = Effect.gen(function* () {
  yield* Command.run(command, {
    version: packageJson.version,
  });
}).pipe(
  Effect.withLogSpan("effect.cli"),
  Effect.tapError((error) =>
    CliError.isCliError(error) && error._tag === "ShowHelp"
      ? Effect.void
      : Effect.logError("Effect CLI failed", error)
  )
);

BunRuntime.runMain(Effect.provide(Effect.provide(cli, BunServices.layer), BunShell));

import { Effect } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { CliError, Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { cloneCommand, sandboxCommand } from "./Sandbox/Cli";
import { SessionCli } from "./Session/Cli";
import { TaskCli } from "./Task/Cli";
import { BunShellService } from "./internal/Shell";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([
    cloneCommand,
    sandboxCommand,
    SessionCli,
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

BunRuntime.runMain(
  Effect.provide(Effect.provide(cli, BunServices.layer), BunShellService)
);

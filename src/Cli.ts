import { Effect } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import { CliError, Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { cloneCommand, sandboxCommand } from "./Sandbox/Cli";
import { runtime } from "./Runtime";
import { SessionCli } from "./Session/Cli";
import { TaskCli } from "./Task/Cli";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([cloneCommand, sandboxCommand, SessionCli, TaskCli])
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

const main = runtime.servicesEffect.pipe(
  Effect.flatMap((services) => cli.pipe(Effect.provideServices(services)))
);

BunRuntime.runMain(main);

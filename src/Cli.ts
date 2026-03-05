import { Effect, Logger } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { CliError, Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { createCommand, removeCommand } from "./Sandbox/Cli";
import { TaskCli } from "./Task/Cli";

const argv = process.argv.slice(2).join(" ") || "<none>";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([createCommand, removeCommand, TaskCli])
);

const cli = Effect.gen(function* () {
  yield* Effect.logDebug("Starting effect CLI").pipe(
    Effect.annotateLogs({
      argv,
      package: "src/effect",
    })
  );

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

cli.pipe(
  Effect.provide(BunServices.layer),
  Effect.provide(Logger.layer([Logger.consolePretty()])),
  BunRuntime.runMain
);

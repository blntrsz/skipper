import { Effect, Logger } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Command } from "effect/unstable/cli";
import packageJson from "../../package.json";
import { SandboxCli } from "./Sandbox/Cli";

const argv = process.argv.slice(2).join(" ") || "<none>";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([SandboxCli])
);

// Set up the CLI application
const cli = Effect.gen(function* () {
  yield* Effect.logInfo("Starting effect CLI").pipe(
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
  Effect.tapError((error) => Effect.logError("Effect CLI failed", error))
);

cli.pipe(
  Effect.provide(BunServices.layer),
  Effect.provide(Logger.layer([Logger.consolePretty()])),
  BunRuntime.runMain
);

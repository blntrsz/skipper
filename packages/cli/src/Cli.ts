import { BunRuntime } from "@effect/platform-bun";
import { runtime } from "@skippercorp/core/Runtime";
import { Effect } from "effect";
import { CliError, Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { command } from "./CommandTree";

const cli = Effect.gen(function* () {
  yield* Command.run(command, {
    version: packageJson.version,
  });
}).pipe(
  Effect.withLogSpan("effect.cli"),
  Effect.tapError((error) =>
    CliError.isCliError(error) && error._tag === "ShowHelp"
      ? Effect.void
      : Effect.logError("Effect CLI failed", error),
  ),
);

const main = runtime.servicesEffect.pipe(
  Effect.flatMap((services) => cli.pipe(Effect.provideServices(services))),
);

BunRuntime.runMain(main);

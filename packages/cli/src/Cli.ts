import { BunRuntime } from "@effect/platform-bun";
import { runtime } from "@skippercorp/core/Runtime";
import { Effect } from "effect";
import { CliError, Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { command } from "./CommandTree";
import { toTopLevelErrorMessage } from "./TopLevelError";

const cli = Effect.gen(function* () {
  return yield* Command.run(command, {
    version: packageJson.version,
  });
}).pipe(Effect.withLogSpan("effect.cli"));

const main = runtime.servicesEffect.pipe(
  Effect.flatMap((services) => cli.pipe(Effect.provideServices(services))),
  Effect.matchEffect({
    onFailure: (error) =>
      CliError.isCliError(error) && error._tag === "ShowHelp"
        ? Effect.void
        : Effect.sync(() => {
            process.exitCode = 1;
            console.error(toTopLevelErrorMessage(error));
          }),
    onSuccess: (exitCode) =>
      Effect.sync(() => {
        if (typeof exitCode === "number") {
          process.exitCode = exitCode;
        }
      }),
  }),
);

BunRuntime.runMain(main);

import { Effect, FileSystem, Layer, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import { createInterface } from "node:readline/promises";
import { GLOBAL_CONFIG_PATH, GlobalConfigService } from "@/internal/GlobalConfigService";

const commandPrompt = "Command missing. Enter command: ";

const isInteractive = () =>
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.env.CI === undefined;

const promptForCommand = Effect.tryPromise({
  try: async () => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const answer = await rl.question(commandPrompt);
      return answer.trim();
    } finally {
      rl.close();
    }
  },
  catch: (error) => new UnknownError(error, "Failed to read command"),
});

export const AgentCommandService = ServiceMap.Service<{
  resolveCommand: () => Effect.Effect<
    string,
    PlatformError | UnknownError,
    FileSystem.FileSystem
  >;
}>("AgentCommandService");

export const AgentCommandServiceImpl = Layer.effect(
  AgentCommandService,
  Effect.gen(function* () {
    const globalConfig = yield* GlobalConfigService;

    return {
      resolveCommand: () =>
        Effect.gen(function* () {
          const command = yield* globalConfig.getCommand();

          if (typeof command === "string" && command.trim().length > 0) {
            return command.trim();
          }

          if (!isInteractive()) {
            return yield* Effect.fail(
              new UnknownError(
                undefined,
                `Missing command in ${GLOBAL_CONFIG_PATH}. Add { "command": "opencode run" }`
              )
            );
          }

          const prompted = yield* promptForCommand;

          if (prompted.length === 0) {
            return yield* Effect.fail(
              new UnknownError(undefined, "Command must not be empty")
            );
          }

          yield* globalConfig.setCommand(prompted);
          return prompted;
        }),
    } satisfies typeof AgentCommandService.Service;
  })
);

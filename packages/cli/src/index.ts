import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import {
  BunChildProcessSpawner,
  BunFileSystem,
  BunPath,
  BunRuntime,
  BunTerminal,
} from "@effect/platform-bun";
import { createNew } from "./command/new";
import { createRm } from "./command/rm";

const command = Command.make("skipper").pipe(
  Command.withSubcommands([createNew, createRm]),
);

// Set up the CLI application
const cli = Command.run(command, {
  version: "1.0.0",
});

const BunCliLive = Layer.provideMerge(
  BunChildProcessSpawner.layer,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, BunTerminal.layer),
);

// Prepare and run the CLI application
cli.pipe(Effect.provide(BunCliLive), BunRuntime.runMain);

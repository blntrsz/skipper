import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, ManagedRuntime } from "effect";
import { makeDatabaseLive, runMigrations } from "./internal/DatabaseService";
import { ShellGitService } from "./internal/Git";
import { TerminalPickerService } from "./internal/Picker";
import { BunShellService } from "./internal/Shell";
import { ShellTmuxService } from "./internal/Tmux";
import { TmuxSwitchService, TmuxWorkTreeSandboxService } from "./Sandbox";
import { SqlSessionService } from "./Session";
import { SqlTaskService } from "./Task";

const appLayer = Layer.mergeAll(
  BunServices.layer,
  Layer.mergeAll(
    Layer.effectServices(Effect.succeed(ShellTmuxService)),
    Layer.effectServices(Effect.succeed(ShellGitService)),
    Layer.effectServices(Effect.succeed(TmuxWorkTreeSandboxService)),
    Layer.effectServices(Effect.succeed(TmuxSwitchService)),
    Layer.effectServices(Effect.succeed(SqlSessionService)),
    Layer.effectServices(Effect.succeed(SqlTaskService)),
    Layer.effectServices(Effect.succeed(TerminalPickerService)),
    Layer.effectServices(Effect.succeed(BunShellService)),
  ),
);

const databaseLayer = makeDatabaseLive();

export const runtime = ManagedRuntime.make(appLayer);

export const withDatabase = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* runMigrations;

    return yield* effect;
  }).pipe(Effect.provide(databaseLayer));

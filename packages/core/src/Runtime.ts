import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, ManagedRuntime } from "effect";
import { makeDatabaseLive } from "./internal/DatabaseService";
import { ShellGitService } from "./internal/Git";
import { TerminalPickerService } from "./internal/Picker";
import { BunShellService } from "./internal/Shell";
import { ShellTmuxService } from "./internal/Tmux";
import { TmuxSwitchService, TmuxWorkTreeSandboxService } from "./Sandbox";
import { SqlSessionService } from "./Session";
import { SqlTaskService } from "./Task";

export const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    BunServices.layer,
    makeDatabaseLive(),
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

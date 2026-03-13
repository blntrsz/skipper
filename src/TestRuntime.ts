import { Effect, Layer, ManagedRuntime } from "effect";
import { TmuxWorkTreeSandboxService } from "./Sandbox/TmuxWorkTreeSandboxService";
import { TmuxSwitchService } from "./Sandbox/TmuxSwitchService";
import { SqlSessionService } from "./Session/SqlSessionService";
import { SqlTaskService } from "./Task/SqlTaskService";
import { TerminalPickerService } from "./internal/Picker/TerminalPickerService";
import { BunShellService } from "./internal/Shell";
import { ShellTmuxService } from "./internal/Tmux";
import { ShellGitService } from "./internal/Git";

export const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Layer.effectServices(Effect.succeed(ShellTmuxService)),
    Layer.effectServices(Effect.succeed(ShellGitService)),
    Layer.effectServices(Effect.succeed(TmuxWorkTreeSandboxService)),
    Layer.effectServices(Effect.succeed(TmuxSwitchService)),
    Layer.effectServices(Effect.succeed(SqlSessionService)),
    Layer.effectServices(Effect.succeed(SqlTaskService)),
    Layer.effectServices(Effect.succeed(TerminalPickerService)),
    Layer.effectServices(Effect.succeed(BunShellService))
  )
);

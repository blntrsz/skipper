import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect";
import { ShellGitService } from "./internal/Git";
import { TerminalPickerService } from "./internal/Picker";
import { BunShellService } from "./internal/Shell";
import { ShellTmuxService } from "./internal/Tmux";
import { TerminalRunService, TmuxSwitchService, TmuxWorkTreeSandboxService } from "./Sandbox";
import { SqlSessionService } from "./Session";
import { SqlTaskService } from "./Task";
import { CliOutput } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";

export const testLayer = Layer.mergeAll(
  Layer.effectServices(Effect.succeed(ShellTmuxService)),
  Layer.effectServices(Effect.succeed(ShellGitService)),
  Layer.effectServices(Effect.succeed(TmuxWorkTreeSandboxService)),
  Layer.effectServices(Effect.succeed(TmuxSwitchService)),
  Layer.effectServices(Effect.succeed(TerminalRunService)),
  Layer.effectServices(Effect.succeed(SqlSessionService)),
  Layer.effectServices(Effect.succeed(SqlTaskService)),
  Layer.effectServices(Effect.succeed(TerminalPickerService)),
  Layer.effectServices(Effect.succeed(BunShellService)),
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.succeed(80),
      readInput: Effect.die("Not implemented"),
      readLine: Effect.die("Not implemented"),
      display: () => Effect.void,
    }),
  ),
  CliOutput.layer(CliOutput.defaultFormatter({ colors: false })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("Not implemented")),
  ),
);

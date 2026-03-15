import {
  type Effect,
  type FileSystem,
  type Option,
  type Path,
  ServiceMap,
  type Terminal,
} from "effect";
import type { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type * as Git from "../internal/Git";
import type {
  PickerCancelled,
  PickerError,
  PickerNoMatch,
  PickerService,
} from "../internal/Picker/PickerService";
import type * as Shell from "../internal/Shell";
import type * as Tmux from "../internal/Tmux";

export interface SwitchService {
  run: (input: {
    readonly repository: Option.Option<string>;
    readonly branch: Option.Option<string>;
    readonly create: boolean;
  }) => Effect.Effect<
    void,
    | PlatformError
    | UnknownError
    | PickerCancelled
    | PickerError
    | PickerNoMatch
    | Shell.ShellError,
    | FileSystem.FileSystem
    | Path.Path
    | typeof Git.GitService.Service
    | typeof PickerService.Service
    | typeof Shell.ShellService.Service
    | Terminal.Terminal
    | typeof Tmux.TmuxService.Service
    | ChildProcessSpawner
  >;
}

export const SwitchService = ServiceMap.Service<SwitchService>("SwitchService");

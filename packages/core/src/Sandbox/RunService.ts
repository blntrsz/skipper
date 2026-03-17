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
import type {
  PickerCancelled,
  PickerError,
  PickerNoMatch,
  PickerService,
} from "../internal/Picker/PickerService";
import type * as Shell from "../internal/Shell";

export interface RunService {
  run: (input: {
    readonly repository: Option.Option<string>;
    readonly branch: Option.Option<string>;
    readonly command: Option.Option<string>;
  }) => Effect.Effect<
    number,
    PlatformError | UnknownError | PickerCancelled | PickerError | PickerNoMatch | Shell.ShellError,
    | FileSystem.FileSystem
    | Path.Path
    | typeof PickerService.Service
    | typeof Shell.ShellService.Service
    | Terminal.Terminal
    | ChildProcessSpawner
  >;
}

export const RunService = ServiceMap.Service<RunService>("RunService");

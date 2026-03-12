import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import {
  PickerCancelled,
  PickerError,
  PickerNoMatch,
} from "@/internal/Picker/PickerService";
import * as Shell from "@/internal/Shell";

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
      FileSystem.FileSystem | typeof Shell.ShellService.Service | ChildProcessSpawner
   >;
}

export const SwitchService = ServiceMap.Service<SwitchService>("SwitchService");

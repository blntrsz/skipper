import { Effect, FileSystem, PlatformError, Schema, ServiceMap } from "effect";
import type { ProjectModel } from "../domain/project.model";

export class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>("FileSystemError")(
  "FileSystemError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class FileSystemService extends ServiceMap.Service<
  FileSystemService,
  {
    fs: () => Effect.Effect<FileSystem.FileSystem, never, never>;
    init: () => Effect.Effect<void, FileSystemError, never>;
    destroy: (
      project: ProjectModel,
    ) => Effect.Effect<void, FileSystemError | PlatformError.PlatformError, never>;
    rootCwd: () => Effect.Effect<string, FileSystemError, never>;
    mainCwd: () => Effect.Effect<string, FileSystemError, never>;
    mainProjectCwd: (project: ProjectModel) => Effect.Effect<string, FileSystemError, never>;
    branchCwd: (repository: string) => Effect.Effect<string, FileSystemError, never>;
    branchProjectCwd: (project: ProjectModel) => Effect.Effect<string, FileSystemError, never>;
  }
>()("@skippercorp/core/workspace/port/file-system.service/FileSystemService") {}

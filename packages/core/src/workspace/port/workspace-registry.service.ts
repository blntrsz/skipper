import { Effect, PlatformError, Schema, ServiceMap } from "effect";
import type { FileSystemError } from "./file-system.service";
import type { ProjectModel } from "../domain/project.model";

export type WorkspaceHandle = {
  project: ProjectModel;
  cwd: string;
  sandbox: "worktree" | "docker";
  containerName?: string;
};

export class WorkspaceRegistryError extends Schema.TaggedErrorClass<WorkspaceRegistryError>()(
  "WorkspaceRegistryError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class WorkspaceRegistryService extends ServiceMap.Service<
  WorkspaceRegistryService,
  {
    resolve: (
      project: ProjectModel,
    ) => Effect.Effect<
      WorkspaceHandle,
      FileSystemError | WorkspaceRegistryError | PlatformError.PlatformError
    >;
    listMainProjects: () => Effect.Effect<
      ReadonlyArray<string>,
      FileSystemError | WorkspaceRegistryError | PlatformError.PlatformError
    >;
    listBranchProjects: (
      repository: string,
    ) => Effect.Effect<
      ReadonlyArray<string>,
      FileSystemError | WorkspaceRegistryError | PlatformError.PlatformError
    >;
  }
>()("@skippercorp/core/workspace/port/workspace-registry.service/WorkspaceRegistryService") {}

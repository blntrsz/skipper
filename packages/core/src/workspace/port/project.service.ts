import { Effect, Schema, ServiceMap } from "effect";
import type { ProjectModel } from "../domain/project.model";
import type { ChildProcess } from "effect/unstable/process";

export class ProjectError extends Schema.TaggedErrorClass<ProjectError>("ProjectError")(
  "ProjectError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class ProjectService extends ServiceMap.Service<
  ProjectService,
  {
    clone: (
      project: ProjectModel,
      path: string,
    ) => Effect.Effect<ChildProcess.Command, never, never>;
    branch: (branchName: string, path: string) => Effect.Effect<ChildProcess.Command, never, never>;
    removeBranch: (path: string) => Effect.Effect<ChildProcess.Command, never, never>;
  }
>()("@skippercorp/core/workspace/port/project.service/ProjectService") {}

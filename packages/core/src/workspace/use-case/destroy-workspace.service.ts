import { Effect } from "effect";
import { SandboxService } from "../port/sandbox.service";
import { FileSystemService } from "../port/file-system.service";
import type { ProjectModel } from "../domain/project.model";

/**
 * Destroys the current workspace
 *
 * @since 0.1.0
 * @category use-case
 */
export const destroyWorkspace = Effect.fn("workspace.destroy")(function* (
  projectModel: ProjectModel,
  force = false,
) {
  const sandbox = yield* SandboxService;
  const fileSystem = yield* FileSystemService;

  yield* sandbox.detach(projectModel);

  if (projectModel.hasBranch()) {
    const mainProjectPath = yield* fileSystem.mainProjectCwd(projectModel);
    const branchPath = yield* fileSystem.branchProjectCwd(projectModel);
    yield* sandbox.destroy({
      project: projectModel,
      mainProjectPath,
      branchPath,
      ...(force ? { force: true } : {}),
    });

    yield* fileSystem.destroy(projectModel);
    return;
  }

  yield* sandbox.destroy({ project: projectModel });
});

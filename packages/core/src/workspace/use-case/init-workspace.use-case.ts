import { Effect } from "effect";
import { SandboxService } from "../port/sandbox.service";
import { FileSystemService } from "../port/file-system.service";
import type { ProjectModel } from "../domain/project.model";

/**
 * Initializes the workspace
 *
 * @since 0.1.0
 * @category use-case
 */
export const initWorkspace = Effect.fn("workspace.init")(function* (projectModel: ProjectModel) {
  const sandbox = yield* SandboxService;
  const fileSystem = yield* FileSystemService;
  const fs = yield* fileSystem.fs;
  yield* fileSystem.init();

  const mainProjectPath = yield* fileSystem.mainProjectCwd(projectModel);
  const mainExists = yield* fs.exists(mainProjectPath);
  const branchPath = projectModel.hasBranch()
    ? yield* fileSystem.branchProjectCwd(projectModel)
    : undefined;

  yield* sandbox.init({
    project: projectModel,
    mainProjectPath,
    mainExists,
    branchPath,
  });
});

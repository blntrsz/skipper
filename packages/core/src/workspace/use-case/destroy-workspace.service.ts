import { Effect } from "effect";
import { SandboxService } from "../port/sandbox.service";
import { FileSystemService } from "../port/file-system.service";
import { ProjectService } from "../port/project.service";
import type { ProjectModel } from "../domain/project.model";
import { ChildProcess } from "effect/unstable/process";

/**
 * Destroys the current workspace
 *
 * @since 0.1.0
 * @category use-case
 */
export const destroyWorkspace = Effect.fn("workspace.destroy")(function* (
  projectModel: ProjectModel,
) {
  const sandbox = yield* SandboxService;
  const fileSystem = yield* FileSystemService;
  const project = yield* ProjectService;

  yield* sandbox.detach(projectModel);

  if (projectModel.hasBranch()) {
    const mainProjectPath = yield* fileSystem.mainProjectCwd(projectModel);
    const branchPath = yield* fileSystem.branchProjectCwd(projectModel);
    const command = yield* project.removeBranch(branchPath);
    yield* sandbox.execute(command.pipe(ChildProcess.setCwd(mainProjectPath)));

    yield* fileSystem.destroy(projectModel);
  }

  yield* sandbox.destroy();
});

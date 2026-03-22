import { Effect, FileSystem } from "effect";
import { SandboxService } from "../port/sandbox.service";
import { FileSystemService } from "../port/file-system.service";
import { ProjectService } from "../port/project.service";
import type { ProjectModel } from "../domain/project.model";
import { ChildProcess } from "effect/unstable/process";

/**
 * Initializes the workspace
 *
 * @since 0.1.0
 * @category use-case
 */
export const initWorkspace = Effect.fn("workspace.init")(function* (projectModel: ProjectModel) {
  const sandbox = yield* SandboxService;
  const fileSystem = yield* FileSystemService;
  const project = yield* ProjectService;
  const fs = yield* FileSystem.FileSystem;

  yield* sandbox.init();
  yield* fileSystem.init();
  const mainProjectPath = yield* fileSystem.mainProjectCwd(projectModel);

  const isMainPathExists = yield* fs.exists(mainProjectPath);

  if (!isMainPathExists) {
    const command = yield* project.clone(projectModel, mainProjectPath);
    yield* sandbox.execute(command);
  }

  if (projectModel.hasBranch()) {
    const branchPath = yield* fileSystem.branchProjectCwd(projectModel);
    const command = yield* project.branch(projectModel.branch, branchPath);
    yield* sandbox.execute(command.pipe(ChildProcess.setCwd(mainProjectPath)));
  }
});

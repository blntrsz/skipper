import { Effect } from "effect";
import { SandboxService } from "../port/sandbox.service";
import type { ProjectModel } from "../domain";
import { FileSystemService } from "../port";

export const attachWorkspace = Effect.fn("workspace.attach")(function* (
  projectModel: ProjectModel,
) {
  const sandbox = yield* SandboxService;
  const fileSystem = yield* FileSystemService;

  const path = yield* projectModel.isMain()
    ? fileSystem.mainProjectCwd(projectModel)
    : fileSystem.branchProjectCwd(projectModel);

  yield* sandbox.attach(projectModel, path);
});

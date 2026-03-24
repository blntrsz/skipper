import { Effect } from "effect";
import { FileSystemService } from "../port/file-system.service";
import type { ProjectModel } from "../domain/project.model";
import { SandboxService } from "../port/sandbox.service";

export const runCommandInWorkspace = Effect.fn("workspace.runCommand")(function* (
  projectModel: ProjectModel,
  command: string,
) {
  const { execute } = yield* SandboxService;
  const fileSystem = yield* FileSystemService;

  const cwd = projectModel.isMain()
    ? yield* fileSystem.mainProjectCwd(projectModel)
    : yield* fileSystem.branchProjectCwd(projectModel);

  yield* execute({
    cwd,
    shell: false,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })`sh -c ${command}`;
});

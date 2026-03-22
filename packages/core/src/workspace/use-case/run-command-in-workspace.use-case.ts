import { Effect } from "effect";
import { SandboxService } from "../port/sandbox.service";
import { FileSystemService } from "../port/file-system.service";
import type { ProjectModel } from "../domain/project.model";
import { ChildProcess } from "effect/unstable/process";

export const runCommandInWorkspace = Effect.fn("workspace.runCommand")(function* (
  projectModel: ProjectModel,
  command: string,
) {
  const sandbox = yield* SandboxService;
  const fileSystem = yield* FileSystemService;

  const cwd = projectModel.isMain()
    ? yield* fileSystem.mainProjectCwd(projectModel)
    : yield* fileSystem.branchProjectCwd(projectModel);

  const cmd = ChildProcess.make({
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    shell: true,
  })`bash -c ${command}`;

  yield* sandbox.execute(cmd);
});

import { Effect, Console } from "effect";
import { FileSystemService } from "../port/file-system.service";
import type { ProjectModel } from "../domain/project.model";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { SandboxError } from "../port/sandbox.service";

export const runCommandInWorkspace = Effect.fn("workspace.runCommand")(function* (
  projectModel: ProjectModel,
  command: string,
) {
  const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fileSystem = yield* FileSystemService;

  const cwd = projectModel.isMain()
    ? yield* fileSystem.mainProjectCwd(projectModel)
    : yield* fileSystem.branchProjectCwd(projectModel);

  const handle = yield* spawn(
    ChildProcess.make({
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      shell: true,
    })`bash -c ${command}`,
  );

  const exitCode = yield* handle.exitCode;

  if (exitCode !== 0) {
    return yield* new SandboxError({
      reason: "ExecutionFailed",
      message: `Command failed with exit code ${exitCode}`,
    });
  }
});

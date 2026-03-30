import { Effect } from "effect";
import type { ProjectModel } from "../domain/project.model";
import { SandboxService } from "../port/sandbox.service";
import { WorkspaceRegistryService } from "../port/workspace-registry.service";

export const runCommandInWorkspace = Effect.fn("workspace.runCommand")(function* (
  projectModel: ProjectModel,
  command: string,
) {
  const sandbox = yield* SandboxService;
  const registry = yield* WorkspaceRegistryService;
  const workspace = yield* registry.resolve(projectModel);

  yield* sandbox.execute(workspace, command, {
    shell: false,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
});

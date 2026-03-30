import { Effect } from "effect";
import { SandboxService } from "../port/sandbox.service";
import type { ProjectModel } from "../domain";
import { WorkspaceRegistryService } from "../port";

export const attachWorkspace = Effect.fn("workspace.attach")(function* (
  projectModel: ProjectModel,
) {
  const sandbox = yield* SandboxService;
  const registry = yield* WorkspaceRegistryService;
  const workspace = yield* registry.resolve(projectModel);
  yield* sandbox.attach(workspace);
});

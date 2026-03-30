import { Effect } from "effect";
import { WorkspaceRegistryService } from "../port/workspace-registry.service";

export const listMainProject = Effect.fn("workspace.project.list-main")(function* () {
  const registry = yield* WorkspaceRegistryService;
  return yield* registry.listMainProjects();
});

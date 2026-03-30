import { Effect } from "effect";
import { WorkspaceRegistryService } from "../port/workspace-registry.service";

export const listBranchProject = Effect.fn("workspace.project.list-brach")(function* (
  repository: string,
) {
  const registry = yield* WorkspaceRegistryService;
  return yield* registry.listBranchProjects(repository);
});

import { Effect, Layer } from "effect";
import { FileSystemService } from "../port/file-system.service";
import { WorkspaceRegistryService } from "../port/workspace-registry.service";

export const WorkTreeWorkspaceRegistryServiceLayer = Layer.effect(
  WorkspaceRegistryService,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;
    const fs = yield* fileSystem.fs;

    const resolve = Effect.fn("WorkTreeWorkspaceRegistry.resolve")(function* (project) {
      const cwd = yield* project.isMain()
        ? fileSystem.mainProjectCwd(project)
        : fileSystem.branchProjectCwd(project);

      return {
        project,
        cwd,
        sandbox: "worktree" as const,
      };
    });

    const listMainProjects = Effect.fn("WorkTreeWorkspaceRegistry.listMainProjects")(function* () {
      return yield* fs.readDirectory(yield* fileSystem.mainCwd());
    });

    const listBranchProjects = Effect.fn("WorkTreeWorkspaceRegistry.listBranchProjects")(function* (
      repository: string,
    ) {
      return yield* fs.readDirectory(yield* fileSystem.branchCwd(repository));
    });

    return {
      resolve,
      listMainProjects,
      listBranchProjects,
    };
  }),
);

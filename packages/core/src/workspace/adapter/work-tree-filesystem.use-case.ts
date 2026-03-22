import { Effect, FileSystem, Layer, Path } from "effect";
import { FileSystemError, FileSystemService } from "../port/file-system.service";
import { homedir } from "node:os";
import {
  DEFAULT_REPOSITORY_ROOT,
  DEFAULT_WORK_TREE_ROOT,
  DEFAULT_DATA_ROOT,
} from "../../common/constant/path";
import type { ProjectModel } from "../domain";

export const WorkTreeFileSystemServiceLayer = Layer.effect(
  FileSystemService,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;

    const rootCwd = Effect.fn("WorkTreeFileSystemServiceLayer.rootCwd")(function* () {
      return yield* Effect.sync(() => homedir());
    });

    const mainCwd = Effect.fn("WorkTreeFileSystemServiceLayer.mainCwd")(function* () {
      return path.join(yield* rootCwd(), DEFAULT_REPOSITORY_ROOT);
    });

    const mainProjectCwd = Effect.fn("WorkTreeFileSystemServiceLayer.mainProjectCwd")(
      function* (project) {
        return path.join(yield* mainCwd(), project.name);
      },
    );

    const branchCwd = Effect.fn("WorkTreeFileSystemServiceLayer.branchCwd")(function* (
      repository: string,
    ) {
      const root = yield* rootCwd();
      return path.join(root, DEFAULT_WORK_TREE_ROOT, repository);
    });

    const init = Effect.fn("WorkTreeFileSystemServiceLayer.init")(function* () {
      const root = homedir();

      yield* Effect.forEach(
        [DEFAULT_DATA_ROOT, DEFAULT_WORK_TREE_ROOT, DEFAULT_REPOSITORY_ROOT],
        (directory) =>
          Effect.gen(function* () {
            const absoluteDirectory = path.join(root, directory);

            if (!(yield* fs.exists(absoluteDirectory))) {
              yield* fs.makeDirectory(absoluteDirectory, { recursive: true });
            }
          }).pipe(
            Effect.catchTag("PlatformError", (e) =>
              Effect.fail(
                new FileSystemError({
                  message: e.message,
                }),
              ),
            ),
          ),
        { discard: true },
      );
    });

    const destroy = Effect.fn("WorkTreeFileSystemServiceLayer.destroy")(function* (
      project: ProjectModel,
    ) {
      const path = yield* branchProjectCwd(project);
      yield* fs.remove(path);
    });

    const branchProjectCwd = Effect.fn("WorkTreeFileSystemServiceLayer.branchProjectCwd")(
      function* (project) {
        return path.join(yield* branchCwd(project.name), `${project.name}.${project.branch}`);
      },
    );

    return {
      fs: () => Effect.sync(() => fs),
      init,
      destroy,
      rootCwd,
      mainCwd,
      mainProjectCwd,
      branchCwd,
      branchProjectCwd,
    };
  }),
);

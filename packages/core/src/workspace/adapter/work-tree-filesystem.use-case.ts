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

    const ensureDirectory = Effect.fn("WorkTreeFileSystemServiceLayer.ensureDirectory")(function* (
      directory: string,
    ) {
      yield* Effect.gen(function* () {
        if (!(yield* fs.exists(directory))) {
          yield* fs.makeDirectory(directory, { recursive: true });
        }
      }).pipe(
        Effect.catchTag("PlatformError", (e) =>
          Effect.fail(
            new FileSystemError({
              message: e.message,
            }),
          ),
        ),
      );
    });

    const rootCwd = Effect.fn("WorkTreeFileSystemServiceLayer.rootCwd")(function* () {
      return yield* Effect.sync(() => homedir());
    });

    const mainCwd = Effect.fn("WorkTreeFileSystemServiceLayer.mainCwd")(function* () {
      const directory = path.join(yield* rootCwd(), DEFAULT_REPOSITORY_ROOT);

      yield* ensureDirectory(directory);

      return directory;
    });

    const mainProjectCwd = Effect.fn("WorkTreeFileSystemServiceLayer.mainProjectCwd")(
      function* (project) {
        return path.join(yield* mainCwd(), project.name);
      },
    );

    const branchCwd = Effect.fn("WorkTreeFileSystemServiceLayer.branchCwd")(function* (
      repository: string,
    ) {
      const directory = path.join(yield* rootCwd(), DEFAULT_WORK_TREE_ROOT, repository);

      yield* ensureDirectory(directory);

      return directory;
    });

    const init = Effect.fn("WorkTreeFileSystemServiceLayer.init")(function* () {
      const root = yield* rootCwd();

      yield* Effect.forEach(
        [DEFAULT_DATA_ROOT, DEFAULT_WORK_TREE_ROOT, DEFAULT_REPOSITORY_ROOT],
        (directory) => ensureDirectory(path.join(root, directory)),
        { discard: true },
      );
    });

    const destroy = Effect.fn("WorkTreeFileSystemServiceLayer.destroy")(function* (
      project: ProjectModel,
    ) {
      const path = yield* branchProjectCwd(project);

      if (yield* fs.exists(path)) {
        yield* fs.remove(path);
      }
    });

    const branchProjectCwd = Effect.fn("WorkTreeFileSystemServiceLayer.branchProjectCwd")(
      function* (project) {
        return path.join(yield* branchCwd(project.name), `${project.name}.${project.branch}`);
      },
    );

    return {
      fs: Effect.sync(() => fs),
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

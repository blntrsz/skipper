import { Effect, FileSystem, Layer, Path } from "effect";
import { homedir } from "node:os";
import {
  DEFAULT_DATA_ROOT,
  DEFAULT_REPOSITORY_ROOT,
  DEFAULT_WORK_TREE_ROOT,
} from "../../common/constant/path";
import type { ProjectModel } from "../domain";
import { FileSystemError, FileSystemService } from "../port/file-system.service";

export const DockerFileSystemServiceLayer = Layer.effect(
  FileSystemService,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;

    const ensureDirectory = Effect.fn("DockerFileSystemService.ensureDirectory")(function* (
      directory: string,
    ) {
      yield* Effect.gen(function* () {
        if (!(yield* fs.exists(directory))) {
          yield* fs.makeDirectory(directory, { recursive: true });
        }
      }).pipe(
        Effect.catchTag(
          "PlatformError",
          (error) =>
            Effect.fail(
              new FileSystemError({
                message: error.message,
              }),
            ),
        ),
      );
    });

    const rootCwd = Effect.fn("DockerFileSystemService.rootCwd")(function* () {
      return yield* Effect.sync(() => homedir());
    });

    const mainCwd = Effect.fn("DockerFileSystemService.mainCwd")(function* () {
      const directory = path.join(yield* rootCwd(), DEFAULT_REPOSITORY_ROOT);

      yield* ensureDirectory(directory);

      return directory;
    });

    const mainProjectCwd = Effect.fn("DockerFileSystemService.mainProjectCwd")(function* (project) {
      return path.join(yield* mainCwd(), project.name);
    });

    const branchCwd = Effect.fn("DockerFileSystemService.branchCwd")(function* (repository: string) {
      return path.join(yield* rootCwd(), DEFAULT_WORK_TREE_ROOT, repository);
    });

    const branchProjectCwd = Effect.fn("DockerFileSystemService.branchProjectCwd")(
      function* (project) {
        return path.join(yield* branchCwd(project.name), `${project.name}.${project.branch}`);
      },
    );

    const init = Effect.fn("DockerFileSystemService.init")(function* () {
      const root = yield* rootCwd();

      yield* Effect.forEach(
        [DEFAULT_DATA_ROOT, DEFAULT_REPOSITORY_ROOT],
        (directory) => ensureDirectory(path.join(root, directory)),
        { discard: true },
      );
    });

    const destroy = Effect.fn("DockerFileSystemService.destroy")(function* (_project: ProjectModel) {
      yield* Effect.void;
    });

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

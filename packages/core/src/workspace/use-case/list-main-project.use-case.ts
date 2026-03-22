import { Effect } from "effect";
import { FileSystemService } from "../port/file-system.service";

export const listMainProject = Effect.fn("workspace.project.list-main")(function* () {
  const fileSystem = yield* FileSystemService;
  const fs = yield* fileSystem.fs();

  return yield* fs.readDirectory(yield* fileSystem.mainCwd());
});

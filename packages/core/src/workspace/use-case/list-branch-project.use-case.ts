import { Effect } from "effect";
import { FileSystemService } from "../port/file-system.service";

export const listBranchProject = Effect.fn("workspace.project.list-brach")(function* (
  repository: string,
) {
  const fileSystem = yield* FileSystemService;
  const fs = yield* fileSystem.fs();

  return yield* fs.readDirectory(yield* fileSystem.branchCwd(repository));
});

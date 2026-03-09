import { Effect, FileSystem } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { UnknownError } from "effect/Cause";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { DockerSandboxDefinition } from "@/domain/DockerSandboxDefinition";
import type { GitRepository } from "@/domain/GitRepository";
import { resolveWorkspacePath } from "@/domain/WorkspacePath";
import { sanitizeNameSegment } from "@/internal/SkipperPaths";

type DockerSandboxIdentity = {
  readonly imageName: string;
  readonly containerName: string;
};

export const getIdentity = (
  gitRepository: GitRepository,
  definition: DockerSandboxDefinition
): DockerSandboxIdentity => ({
  imageName: `skipper-${sanitizeNameSegment(gitRepository.repository)}:${sanitizeNameSegment(definition.name)}`,
  containerName: `skipper-${sanitizeNameSegment(gitRepository.repository)}-${sanitizeNameSegment(gitRepository.branch)}-${sanitizeNameSegment(definition.name)}`,
});

export const getCreateCommands = (
  gitRepository: GitRepository,
  definition: DockerSandboxDefinition,
  sourcePath: string
): readonly (readonly string[])[] => {
  const identity = getIdentity(gitRepository, definition);

  return [
    ["build", "-t", identity.imageName, definition.directory],
    [
      "run",
      "-d",
      "--name",
      identity.containerName,
      identity.imageName,
      ...definition.command,
    ],
    ["exec", identity.containerName, "mkdir", "-p", definition.containerPath],
    [
      "cp",
      `${sourcePath}/.`,
      `${identity.containerName}:${definition.containerPath}`,
    ],
  ];
};

const resolveSourcePath = (gitRepository: GitRepository) =>
  resolveWorkspacePath(gitRepository);

const ensureSourcePath = (gitRepository: GitRepository) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sourcePath = resolveSourcePath(gitRepository);

    if (yield* fs.exists(sourcePath)) {
      return sourcePath;
    }

    return yield* Effect.fail(
      new UnknownError(
        undefined,
        `Source path '${sourcePath}' not found for '${gitRepository.repository}:${gitRepository.branch}'`
      )
    );
  });

const runDockerCommand = (
  args: readonly string[]
): Effect.Effect<void, PlatformError, ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make("docker", args, {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });

      yield* handle.exitCode;
    })
  );

const removeContainerIfExists = (containerName: string) =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["docker", "rm", "-f", containerName], {
        stdout: "ignore",
        stderr: "ignore",
      });
      await proc.exited;
    },
    catch: (error) =>
      new UnknownError(error, `Failed to remove container '${containerName}'`),
  });

export const create = (
  gitRepository: GitRepository,
  definition: DockerSandboxDefinition
) =>
  Effect.gen(function* () {
    const sourcePath = yield* ensureSourcePath(gitRepository);
    const identity = getIdentity(gitRepository, definition);
    const commands = getCreateCommands(gitRepository, definition, sourcePath);

    yield* runDockerCommand(commands[0]!);
    yield* removeContainerIfExists(identity.containerName);
    yield* runDockerCommand(commands[1]!);
    yield* runDockerCommand(commands[2]!);
    yield* runDockerCommand(commands[3]!);

    yield* Effect.logInfo("Docker sandbox ready").pipe(
      Effect.annotateLogs({
        sandbox: definition.name,
        source: definition.source,
        image: identity.imageName,
        container: identity.containerName,
      })
    );
  });

export const remove = (
  gitRepository: GitRepository,
  definition: DockerSandboxDefinition
) =>
  Effect.gen(function* () {
    const identity = getIdentity(gitRepository, definition);

    yield* removeContainerIfExists(identity.containerName);
    yield* Effect.logInfo("Docker sandbox removed").pipe(
      Effect.annotateLogs({
        sandbox: definition.name,
        container: identity.containerName,
      })
    );
  });

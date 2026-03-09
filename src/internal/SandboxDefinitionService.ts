import { Effect, FileSystem, Option, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { UnknownError } from "effect/Cause";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_DOCKER_SANDBOX_COMMAND,
  DEFAULT_DOCKER_SANDBOX_CONTAINER_PATH,
  type DockerSandboxDefinition as DockerSandboxDefinitionType,
  type DockerSandboxDefinitionSource,
} from "@/domain/DockerSandboxDefinition";
import { pickSingleOption } from "./picker/OpenTuiPicker";

const REPOSITORY_SANDBOX_DIR = ".skipper/sandbox";
const DOCKERFILE_NAME = "Dockerfile";
const SANDBOX_CONFIG_CANDIDATES = ["sandbox.json", "config.json"] as const;

const userSandboxRoot = () =>
  process.env.SKIPPER_SANDBOX_ROOT ?? join(homedir(), ".config/skipper/sandbox");

const repositoryRoot = () =>
  process.env.SKIPPER_REPOSITORY_ROOT ?? join(homedir(), ".local/share/github");

type ListedSandbox = {
  readonly source: DockerSandboxDefinitionSource;
  readonly directory: string;
};

const readDirectoryNames = (directory: string) =>
  Effect.tryPromise({
    try: async () => {
      const entries = await readdir(directory);
      const values = await Promise.all(
        entries.map(async (entry) => {
          const stats = await stat(join(directory, entry));
          return stats.isDirectory() ? entry : null;
        })
      );

      return values.filter((value): value is string => value !== null).sort();
    },
    catch: (error) => new UnknownError(error, `Failed to list '${directory}'`),
  });

const readSandboxFile = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    for (const name of SANDBOX_CONFIG_CANDIDATES) {
      const path = join(directory, name);

      if (!(yield* fs.exists(path))) {
        continue;
      }

      const content = yield* fs.readFileString(path);

      try {
        const parsed = JSON.parse(content);

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return yield* Effect.fail(
            new UnknownError(undefined, `Invalid sandbox config '${path}'`)
          );
        }

        const containerPath =
          typeof parsed.containerPath === "string" && parsed.containerPath.length > 0
            ? parsed.containerPath
            : DEFAULT_DOCKER_SANDBOX_CONTAINER_PATH;
        const command = Array.isArray(parsed.command)
          ? parsed.command.filter(
              (value: unknown): value is string => typeof value === "string"
            )
          : [...DEFAULT_DOCKER_SANDBOX_COMMAND];

        return {
          containerPath,
          command: command.length > 0 ? command : [...DEFAULT_DOCKER_SANDBOX_COMMAND],
        };
      } catch (error) {
        return yield* Effect.fail(
          new UnknownError(error, `Invalid sandbox config '${path}'`)
        );
      }
    }

    return {
      containerPath: DEFAULT_DOCKER_SANDBOX_CONTAINER_PATH,
      command: [...DEFAULT_DOCKER_SANDBOX_COMMAND],
    };
  });

const listSandboxesInDirectory = (
  root: string,
  source: DockerSandboxDefinitionSource
) =>
  Effect.gen(function* () {
    const names = yield* readDirectoryNames(root).pipe(
      Effect.catch(() => Effect.succeed([] as readonly string[]))
    );

    return new Map(
      names.map(
        (name): readonly [string, ListedSandbox] => [
          name,
          {
            source,
            directory: join(root, name),
          },
        ]
      )
    );
  });

const loadDockerSandboxDefinition = (
  repository: string,
  name: string,
  sandbox: ListedSandbox
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dockerfilePath = join(sandbox.directory, DOCKERFILE_NAME);

    if (!(yield* fs.exists(dockerfilePath))) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Sandbox '${name}' missing '${DOCKERFILE_NAME}' in '${sandbox.directory}'`
        )
      );
    }

    const file = yield* readSandboxFile(sandbox.directory);

    return {
      name,
      repository,
      source: sandbox.source,
      directory: sandbox.directory,
      dockerfilePath,
      containerPath: file.containerPath,
      command: file.command,
    } satisfies DockerSandboxDefinitionType;
  });

export const listDockerSandboxDefinitions = (repository: string) =>
  Effect.gen(function* () {
    const userSandboxes = yield* listSandboxesInDirectory(userSandboxRoot(), "user");
    const repoSandboxes = yield* listSandboxesInDirectory(
      join(repositoryRoot(), repository, REPOSITORY_SANDBOX_DIR),
      "repo"
    );
    const merged = new Map([...userSandboxes, ...repoSandboxes]);

    return yield* Effect.all(
      [...merged.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, sandbox]) =>
          loadDockerSandboxDefinition(repository, name, sandbox)
        )
    );
  });

export const SandboxDefinitionService = ServiceMap.Service<{
  listDockerSandboxDefinitions: (
    repository: string
  ) => Effect.Effect<
    readonly DockerSandboxDefinitionType[],
    PlatformError | UnknownError,
    FileSystem.FileSystem
  >;
  resolveDockerSandboxDefinition: (
    repository: string,
    sandbox: Option.Option<string>
  ) => Effect.Effect<
    DockerSandboxDefinitionType,
    PlatformError | UnknownError,
    FileSystem.FileSystem
  >;
}>("SandboxDefinitionService");

export const SandboxDefinitionServiceImpl = ServiceMap.make(
  SandboxDefinitionService,
  {
    listDockerSandboxDefinitions,
    resolveDockerSandboxDefinition: (
      repository: string,
      sandbox: Option.Option<string>
    ) =>
      Effect.gen(function* () {
        const definitions = yield* listDockerSandboxDefinitions(repository);

        if (definitions.length === 0) {
          return yield* Effect.fail(
            new UnknownError(
              undefined,
              `No docker sandboxes found for '${repository}'`
            )
          );
        }

        const selectedName = Option.isSome(sandbox)
          ? sandbox.value
          : yield* Effect.tryPromise({
              try: () =>
                pickSingleOption({
                  title: `Docker sandboxes for ${repository}`,
                  options: definitions.map(
                    (definition: DockerSandboxDefinitionType) =>
                      definition.source === "repo"
                        ? `${definition.name} (repo)`
                        : `${definition.name} (user)`
                  ),
                }),
              catch: (error) =>
                new UnknownError(error, "Docker sandbox picker failed"),
            }).pipe(
              Effect.map((value) => value.replace(/ \((repo|user)\)$/, ""))
            );

        const definition = definitions.find(
          (item: DockerSandboxDefinitionType) => item.name === selectedName
        );

        if (definition) {
          return definition;
        }

        return yield* Effect.fail(
          new UnknownError(
            undefined,
            `Docker sandbox '${selectedName}' not found for '${repository}'`
          )
        );
      }),
  }
);

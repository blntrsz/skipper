import { Effect, FileSystem, Option, Schema, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { UnknownError } from "effect/Cause";
import { join } from "node:path";
import {
  DockerSandboxFile,
  type DockerSandboxDefinition as DockerSandboxDefinitionType,
  type DockerSandboxDefinitionSource,
  normalizeDockerSandboxFile,
} from "@/domain/DockerSandboxDefinition";
import { repositorySandboxRoot, sandboxRoot } from "@/internal/SkipperPaths";

const DOCKERFILE_NAME = "Dockerfile";
const SANDBOX_CONFIG_CANDIDATES = ["sandbox.json", "config.json"] as const;

type ListedSandbox = {
  readonly source: DockerSandboxDefinitionSource;
  readonly directory: string;
};

const readDirectoryNames = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(directory).pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound"
          ? Effect.succeed([])
          : Effect.fail(error)
      ),
      Effect.mapError((error) => new UnknownError(error, `Failed to list '${directory}'`))
    );

    const values = yield* Effect.forEach(entries, (entry) =>
      fs.stat(join(directory, entry)).pipe(
        Effect.map((stats) => (stats.type === "Directory" ? entry : null)),
        Effect.mapError((error) => new UnknownError(error, `Failed to list '${directory}'`))
      )
    );

    return values.filter((value): value is string => value !== null).sort();
  });

const readSandboxFile = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const decodeSandboxFile = Schema.decodeUnknownEffect(DockerSandboxFile);

    for (const name of SANDBOX_CONFIG_CANDIDATES) {
      const path = join(directory, name);

      if (!(yield* fs.exists(path))) {
        continue;
      }

      const content = yield* fs.readFileString(path);
      const parsed = yield* Effect.try({
        try: () => JSON.parse(content),
        catch: (error) => new UnknownError(error, `Invalid sandbox config '${path}'`),
      });
      const file = yield* decodeSandboxFile(parsed).pipe(
        Effect.mapError((error) => new UnknownError(error, `Invalid sandbox config '${path}'`))
      );

      return normalizeDockerSandboxFile(file);
    }

    return normalizeDockerSandboxFile({});
  });

const listSandboxesInDirectory = (
  root: string,
  source: DockerSandboxDefinitionSource
) =>
  Effect.gen(function* () {
    const names = yield* readDirectoryNames(root);

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
    const userSandboxes = yield* listSandboxesInDirectory(sandboxRoot(), "user");
    const repoSandboxes = yield* listSandboxesInDirectory(
      repositorySandboxRoot(repository),
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

        if (Option.isNone(sandbox)) {
          return yield* Effect.fail(
            new UnknownError(
              undefined,
              `Missing --sandbox for '${repository}'. Available: ${definitions
                .map((definition) => definition.name)
                .join(", ")}`
            )
          );
        }

        const selectedName = sandbox.value;

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

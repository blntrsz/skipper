import { Console, Effect, Layer, PlatformError, Schema, Scope, ServiceMap, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { homedir } from "node:os";
import {
  DEFAULT_DATA_ROOT,
  DOCKER_BRANCH_LABEL,
  DOCKER_CONTAINER_LABEL,
  DOCKER_IMAGE_NAME,
  DOCKER_REPO_LABEL,
  DOCKER_WORKSPACE_DIR,
} from "./constant/path";

export class DockerError extends Schema.TaggedErrorClass<DockerError>("DockerError")(
  "DockerError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

type DockerEffect<A = void> = Effect.Effect<
  A,
  DockerError | PlatformError.PlatformError,
  Scope.Scope
>;

export class DockerService extends ServiceMap.Service<
  DockerService,
  {
    ensureImage: () => DockerEffect;
    containerName: (repo: string, branch: string | undefined) => string;
    containerExists: (name: string) => DockerEffect<boolean>;
    createContainer: (name: string, repo: string, branch: string | undefined) => DockerEffect;
    copyRepo: (containerName: string, hostPath: string) => DockerEffect;
    execInContainer: (
      containerName: string,
      command: string,
      options?: { interactive?: boolean; cwd?: string },
    ) => DockerEffect<string>;
    removeContainer: (name: string) => DockerEffect;
    listContainers: (
      repo?: string,
    ) => DockerEffect<Array<{ name: string; repo: string; branch: string }>>;
  }
>()("@skippercorp/core/common/docker/DockerService") {}

const DOCKERFILE_CONTENT = `FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \\
    curl \\
    git \\
    unzip \\
    ca-certificates \\
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \\
    && apt-get install -y nodejs \\
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:\${PATH}"

# Install OpenCode
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:\${PATH}"

WORKDIR ${DOCKER_WORKSPACE_DIR}

CMD ["sleep", "infinity"]
`;

const buildDockerfile = (dataRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* Effect.sync(async () => {
      const { promises } = await import("node:fs");
      return promises;
    });

    const dockerfilePath = `${dataRoot}/Dockerfile`;
    yield* Effect.tryPromise({
      try: async () => {
        await (await fs).mkdir(dataRoot, { recursive: true });
        await (await fs).writeFile(dockerfilePath, DOCKERFILE_CONTENT);
      },
      catch: (error) =>
        new DockerError({
          message: `Failed to write Dockerfile: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    return dockerfilePath;
  });

export const DockerServiceLayer = Layer.effect(
  DockerService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;

    const runDocker = Effect.fn("DockerService.runDocker")(function* (
      args: string[],
      options?: { silent?: boolean },
    ) {
      const command = ["docker", ...args].join(" ");
      const handle = yield* spawn(
        ChildProcess.make({
          shell: true,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        })`${command}`,
      );

      let stdout = "";
      let stderr = "";

      yield* Stream.runForEach(handle.stdout, (chunk) => {
        stdout += chunk.toString();
        return options?.silent ? Effect.void : Console.log(chunk.toString());
      });

      yield* Stream.runForEach(handle.stderr, (chunk) => {
        stderr += chunk.toString();
        return Effect.void;
      });

      const exitCode = yield* handle.exitCode;

      if (exitCode !== 0) {
        return yield* new DockerError({
          message: `Docker command failed (exit ${exitCode}): ${command}\n${stderr}`,
        });
      }

      return stdout.trim();
    });

    const dataRoot = `${homedir()}/${DEFAULT_DATA_ROOT}`;

    const ensureImage = Effect.fn("DockerService.ensureImage")(function* () {
      const imageExists = yield* runDocker(["inspect", "--type=image", DOCKER_IMAGE_NAME], {
        silent: true,
      }).pipe(
        Effect.as(true),
        Effect.catchTag("DockerError", () => Effect.succeed(false)),
      );

      if (imageExists) {
        return;
      }

      yield* Console.log(`Building Docker image '${DOCKER_IMAGE_NAME}'...`);
      const dockerfilePath = yield* buildDockerfile(dataRoot);
      yield* runDocker(["build", "-t", DOCKER_IMAGE_NAME, "-f", dockerfilePath, dataRoot]);
    });

    const containerName = (repo: string, branch: string | undefined) => {
      const safeBranch = (branch ?? "main").replaceAll("/", "-");
      return `skipper-${repo}-${safeBranch}`;
    };

    const containerExists = Effect.fn("DockerService.containerExists")(function* (name: string) {
      return yield* runDocker(["inspect", "--type=container", name], { silent: true }).pipe(
        Effect.as(true),
        Effect.catchTag("DockerError", () => Effect.succeed(false)),
      );
    });

    const createContainer = Effect.fn("DockerService.createContainer")(function* (
      name: string,
      repo: string,
      branch: string | undefined,
    ) {
      const branchValue = branch ?? "main";
      const home = homedir();

      const mounts = [`-v ${home}/.ssh:/root/.ssh:ro`, `-v ${home}/.gitconfig:/root/.gitconfig:ro`];

      // Mount gh config if it exists
      const ghConfigPath = `${home}/.config/gh`;
      const openCodeConfigPath = `${home}/.config/opencode`;

      const optionalMounts = [ghConfigPath, openCodeConfigPath];
      for (const mountPath of optionalMounts) {
        const exists = yield* Effect.try({
          try: () => {
            require("node:fs").accessSync(mountPath);
            return true;
          },
          catch: () => new DockerError({ message: `Path ${mountPath} not accessible` }),
        }).pipe(Effect.catchTag("DockerError", () => Effect.succeed(false)));
        if (exists) {
          mounts.push(`-v ${mountPath}:${mountPath.replace(home, "/root")}:ro`);
        }
      }

      yield* runDocker([
        "create",
        "--name",
        name,
        `--label ${DOCKER_CONTAINER_LABEL}=true`,
        `--label ${DOCKER_REPO_LABEL}=${repo}`,
        `--label ${DOCKER_BRANCH_LABEL}=${branchValue}`,
        `-w ${DOCKER_WORKSPACE_DIR}`,
        ...mounts,
        DOCKER_IMAGE_NAME,
      ]);

      yield* runDocker(["start", name], { silent: true });
    });

    const copyRepo = Effect.fn("DockerService.copyRepo")(function* (
      name: string,
      hostPath: string,
    ) {
      yield* runDocker(["cp", `${hostPath}/.`, `${name}:${DOCKER_WORKSPACE_DIR}`]);
    });

    const execInContainer = Effect.fn("DockerService.execInContainer")(function* (
      name: string,
      command: string,
      options?: { interactive?: boolean; cwd?: string },
    ) {
      const cwd = options?.cwd ?? DOCKER_WORKSPACE_DIR;
      const args = ["exec", "-w", cwd];
      if (options?.interactive) {
        args.push("-it");
      }
      args.push(name, "sh", "-c", command);
      return yield* runDocker(args, { silent: true });
    });

    const removeContainer = Effect.fn("DockerService.removeContainer")(function* (name: string) {
      yield* runDocker(["rm", "-f", name]);
    });

    const listContainers = Effect.fn("DockerService.listContainers")(function* (repo?: string) {
      const filterArgs = [`--filter label=${DOCKER_CONTAINER_LABEL}=true`];
      if (repo !== undefined) {
        filterArgs.push(`--filter label=${DOCKER_REPO_LABEL}=${repo}`);
      }

      const output = yield* runDocker(
        [
          "ps",
          "-a",
          ...filterArgs,
          `--format '{{.Names}}|{{.Label "${DOCKER_REPO_LABEL}"}}|{{.Label "${DOCKER_BRANCH_LABEL}"}}'`,
        ],
        { silent: true },
      );

      if (output.length === 0) {
        return [];
      }

      return output.split("\n").flatMap((line) => {
        const trimmed = line.trim().replace(/^'|'$/g, "");
        if (trimmed.length === 0) return [];
        const parts = trimmed.split("|");
        if (parts.length < 3) return [];
        return [
          {
            name: parts[0] ?? "",
            repo: parts[1] ?? "",
            branch: parts[2] ?? "",
          },
        ];
      });
    });

    return {
      ensureImage,
      containerName,
      containerExists,
      createContainer,
      copyRepo,
      execInContainer,
      removeContainer,
      listContainers,
    };
  }),
);

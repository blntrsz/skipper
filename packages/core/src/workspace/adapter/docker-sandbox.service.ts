import { Console, Effect, Layer, PlatformError, Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { InteractiveCommandService } from "../../common/adapter/interactive-command.service";
import type { ProjectModel } from "../domain";
import {
  DOCKER_SANDBOX_IMAGE,
  DOCKER_SANDBOX_WORKDIR,
  dockerContainerName,
  dockerWorkspaceLabels,
} from "./docker-workspace.shared";
import { SandboxError, SandboxService } from "../port/sandbox.service";
import type { SandboxDestroyInput, SandboxInitInput } from "../port/sandbox.service";
import type { WorkspaceHandle } from "../port/workspace-registry.service";
import { homedir } from "node:os";
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dockerDataDir = join(homedir(), ".local/share/skipper/docker");
const dockerfilePath = join(dockerDataDir, "Dockerfile");

const dockerfile = `FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y ca-certificates curl git openssh-client software-properties-common && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /etc/apt/keyrings && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get update && apt-get install -y gh nodejs && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:\${PATH}"
RUN /root/.bun/bin/bun add -g opencode-ai@latest
WORKDIR /workspace
CMD ["bash", "-lc", "while sleep 3600; do :; done"]
`;

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

const parseDefaultBranch = (output: string) => {
  const symbolicRef = output.trim();

  if (symbolicRef.length > 0) {
    const parts = symbolicRef.split("/");
    return parts.length > 1 ? parts[parts.length - 1] : undefined;
  }

  return undefined;
};

export const DockerSandboxServiceLayer = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;
    const interactive = yield* InteractiveCommandService;

    const runCommand = Effect.fn("DockerSandbox.runCommand")(function* (
      command: string,
      options: ChildProcess.CommandOptions = {},
    ) {
      const handle = yield* spawn(
        ChildProcess.make({
          ...options,
          stdin: options.stdin ?? "pipe",
          stdout: options.stdout ?? "pipe",
          stderr: options.stderr ?? "pipe",
          shell: false,
        })`sh -lc ${command}`,
      );

      let result = "";
      yield* Stream.runForEach(handle.all, (chunk) => {
        const stringChunk = chunk.toString();
        result += stringChunk;

        if (options.stdout !== "inherit" && options.stderr !== "inherit") {
          return Console.log(stringChunk);
        }

        return Effect.void;
      });

      const exitCode = yield* handle.exitCode;

      if (exitCode !== 0) {
        return yield* Effect.fail(
          new SandboxError({
            reason: "ExecutionFailed",
            message: `Command failed with exit code ${exitCode}: ${result}`,
          }),
        );
      }

      return result;
    });

    const dockerExec = Effect.fn("DockerSandbox.dockerExec")(function* (
      containerName: string,
      command: string,
      options: ChildProcess.CommandOptions = {},
      cwd?: string,
    ) {
      const workdirArg = cwd ? `-w ${shellQuote(cwd)}` : "";
      const stdinArg = options.stdin === "inherit" ? "-i" : "";

      yield* runCommand(
        `docker exec ${stdinArg} ${workdirArg} ${shellQuote(containerName)} sh -lc ${shellQuote(command)}`,
        options,
      );
    });

    const existingPath = Effect.fn("DockerSandbox.existingPath")(function* (path: string) {
      return yield* Effect.tryPromise({
        try: () => stat(path),
        catch: () => undefined,
      }).pipe(Effect.map((value) => value !== undefined));
    });

    const ensureImage = Effect.fn("DockerSandbox.ensureImage")(function* () {
      yield* Effect.tryPromise(() => mkdir(dockerDataDir, { recursive: true })).pipe(Effect.orDie);
      yield* Effect.tryPromise(() => writeFile(dockerfilePath, dockerfile)).pipe(Effect.orDie);

      const inspectExit = yield* Effect.exit(
        runCommand(`docker image inspect ${shellQuote(DOCKER_SANDBOX_IMAGE)} >/dev/null 2>&1`),
      );

      if (inspectExit._tag === "Success") {
        return;
      }

      yield* runCommand(
        `docker build -t ${shellQuote(DOCKER_SANDBOX_IMAGE)} -f ${shellQuote(dockerfilePath)} ${shellQuote(dockerDataDir)}`,
      );
    });

    const containerExists = Effect.fn("DockerSandbox.containerExists")(function* (
      project: ProjectModel,
    ) {
      const output = yield* runCommand(
        `docker ps -a --filter name=^/${dockerContainerName(project)}$ --format '{{.Names}}'`,
      );

      return output.trim() === dockerContainerName(project);
    });

    const createContainer = Effect.fn("DockerSandbox.createContainer")(function* (
      project: ProjectModel,
    ) {
      const containerName = dockerContainerName(project);
      const labels = dockerWorkspaceLabels(project);
      const mountArgs = [
        [join(homedir(), ".config/opencode"), "/root/.config/opencode"],
        [join(homedir(), ".config/gh"), "/root/.config/gh"],
        [join(homedir(), ".gitconfig"), "/root/.gitconfig"],
        [join(homedir(), ".ssh"), "/root/.ssh"],
      ] as const;

      const mounts = [];

      for (const [source, target] of mountArgs) {
        if (yield* existingPath(source)) {
          mounts.push(`-v ${shellQuote(source)}:${shellQuote(target)}:ro`);
        }
      }

      const labelArgs = Object.entries(labels)
        .map(([key, value]) => `--label ${shellQuote(`${key}=${value}`)}`)
        .join(" ");

      yield* runCommand(
        `docker run -d --name ${shellQuote(containerName)} ${labelArgs} ${mounts.join(" ")} ${shellQuote(DOCKER_SANDBOX_IMAGE)}`,
      );
    });

    const resolveDefaultBranch = Effect.fn("DockerSandbox.resolveDefaultBranch")(function* (
      repositoryPath: string,
    ) {
      const symbolicRef = yield* runCommand(
        `git -C ${shellQuote(repositoryPath)} symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null || true`,
      );
      const symbolicBranch = parseDefaultBranch(symbolicRef);

      if (symbolicBranch) {
        return symbolicBranch;
      }

      const remote = yield* runCommand(`git -C ${shellQuote(repositoryPath)} remote show origin`);
      const match = remote.match(/HEAD branch:\s+([^\s]+)/);

      if (match?.[1]) {
        return match[1];
      }

      return "main";
    });

    const prepareSnapshot = Effect.fn("DockerSandbox.prepareSnapshot")(function* (
      mainProjectPath: string,
    ) {
      const tempRoot = yield* Effect.tryPromise(() =>
        mkdtemp(join(tmpdir(), "skipper-docker-")),
      ).pipe(Effect.orDie);
      const snapshotPath = join(tempRoot, "repository");

      yield* Effect.tryPromise(() =>
        cp(mainProjectPath, snapshotPath, {
          recursive: true,
          force: true,
        }),
      ).pipe(Effect.orDie);

      yield* runCommand(`git -C ${shellQuote(snapshotPath)} fetch origin --prune`);
      const defaultBranch = yield* resolveDefaultBranch(snapshotPath);
      yield* runCommand(
        `git -C ${shellQuote(snapshotPath)} checkout --force -B ${defaultBranch} origin/${defaultBranch}`,
      );
      yield* runCommand(`git -C ${shellQuote(snapshotPath)} clean -fdx`);

      return {
        defaultBranch,
        snapshotPath,
        cleanup: Effect.tryPromise(() => rm(tempRoot, { recursive: true, force: true })).pipe(
          Effect.orDie,
        ),
      };
    });

    const copySnapshot = Effect.fn("DockerSandbox.copySnapshot")(function* (
      project: ProjectModel,
      snapshotPath: string,
    ) {
      const containerName = dockerContainerName(project);
      const workspaceDir = `${DOCKER_SANDBOX_WORKDIR}/${project.name}`;

      yield* dockerExec(containerName, `mkdir -p ${shellQuote(workspaceDir)}`);
      yield* runCommand(
        `docker cp ${shellQuote(`${snapshotPath}/.`)} ${shellQuote(`${containerName}:${workspaceDir}`)}`,
      );

      if (project.hasBranch()) {
        yield* dockerExec(containerName, `git checkout -B ${project.branch}`, {}, workspaceDir);
      }
    });

    const init = Effect.fn("DockerSandbox.init")(
      (
        input: SandboxInitInput,
      ): Effect.Effect<void, SandboxError | PlatformError.PlatformError, Scope.Scope> =>
        Effect.gen(function* () {
          const { project, mainProjectPath, mainExists } = input;

          yield* ensureImage();

          if (!mainExists) {
            if (!project.namespace) {
              yield* Effect.fail(
                new SandboxError({
                  reason: "ExecutionFailed",
                  message: "Repository namespace is required to clone a Docker workspace",
                }),
              );
            }

            const gitLink = `git@github.com:${project.namespace}/${project.name}.git`;
            yield* runCommand(`git clone ${shellQuote(gitLink)} ${shellQuote(mainProjectPath)}`);
          }

          if (yield* containerExists(project)) {
            return;
          }

          yield* createContainer(project);

          const snapshot = yield* Effect.acquireRelease(
            prepareSnapshot(mainProjectPath),
            ({ cleanup }) => cleanup,
          );

          yield* copySnapshot(project, snapshot.snapshotPath);
        }).pipe(
          Effect.asVoid,
          Effect.mapError((error) => error as SandboxError | PlatformError.PlatformError),
        ),
    );

    const destroy = Effect.fn("DockerSandbox.destroy")(function* (input: SandboxDestroyInput) {
      const containerName = dockerContainerName(input.project);

      yield* runCommand(`docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`);
    });

    const execute = Effect.fn("DockerSandbox.execute")(function* (
      workspace: WorkspaceHandle,
      command: string,
      options: ChildProcess.CommandOptions = {},
    ) {
      const containerName = workspace.containerName;

      if (!containerName) {
        return yield* Effect.fail(
          new SandboxError({
            reason: "ExecutionFailed",
            message: "Missing Docker container name for workspace execution",
          }),
        );
      }

      yield* dockerExec(containerName, command, options, workspace.cwd);
    });

    const attach = Effect.fn("DockerSandbox.attach")(function* (workspace: WorkspaceHandle) {
      const containerName = workspace.containerName;

      if (!containerName) {
        return yield* Effect.fail(
          new SandboxError({
            reason: "AttachFailed",
            message: "Missing Docker container name for workspace attach",
          }),
        );
      }

      yield* interactive.run(["docker", "exec", "-it", containerName, "bash"]).pipe(
        Effect.mapError(
          (error) =>
            new SandboxError({
              reason: "AttachFailed",
              message: error.message,
              cause: error,
            }),
        ),
      );
    });

    const detach = Effect.fn("DockerSandbox.detach")(function* (_project: ProjectModel) {
      yield* Effect.void;
    });

    return {
      init,
      destroy,
      execute,
      attach,
      detach,
    };
  }),
);

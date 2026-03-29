import { Console, Effect, Layer, Path, Stream } from "effect";
import { InteractiveCommandService } from "../../common/adapter/interactive-command.service";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { SandboxError, SandboxService } from "../port/sandbox.service";
import type { SandboxDestroyInput, SandboxInitInput } from "../port/sandbox.service";
import type { ProjectModel } from "../domain";

const DOCKER_IMAGE = "oven/bun:1";
const CONTAINER_CWD = "/workspace";
const CONTAINER_SHELL = "sh";
const CONTAINER_IDLE_COMMAND = "while sleep 1000; do :; done";

const sanitizeContainerSegment = (value: string) => {
  const sanitized = value.replaceAll(/[^a-zA-Z0-9_.-]+/g, "-").replaceAll(/-+/g, "-");
  return sanitized.length > 0 ? sanitized : "workspace";
};

const renderCommand = (
  templates: TemplateStringsArray,
  expressions: readonly ChildProcess.TemplateExpression[],
) => {
  let result = "";

  for (let index = 0; index < templates.length; index++) {
    result += templates[index] ?? "";

    if (index < expressions.length) {
      result += String(expressions[index]);
    }
  }

  return result.trim();
};

const userSpec = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;

export const DockerSandboxServiceLayer = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;
    const interactiveCommand = yield* InteractiveCommandService;
    const path = yield* Path.Path;

    const workspaceContainerName = Effect.fn("DockerSandboxService.workspaceContainerName")(
      function* (workspacePath: string) {
        const parent = path.basename(path.dirname(workspacePath));
        const name = path.basename(workspacePath);
        return sanitizeContainerSegment(`skipper-docker-${parent}-${name}`);
      },
    );

    const executeHost = (options: ChildProcess.CommandOptions) =>
      Effect.fn("DockerSandboxService.executeHost")(function* (
        templates: TemplateStringsArray,
        ...expressions: readonly ChildProcess.TemplateExpression[]
      ) {
        const handle = yield* spawn(
          ChildProcess.make({
            ...options,
            stdin: options.stdin ?? "pipe",
            stdout: options.stdout ?? "pipe",
            stderr: options.stderr ?? "pipe",
            shell: options.shell ?? true,
          })(templates, ...expressions),
        );

        let result = "";
        yield* Stream.runForEach(handle.all, (chunk) => {
          const stringChunk = chunk.toString();
          result += stringChunk;
          return Console.log(stringChunk);
        });

        const exitCode = yield* handle.exitCode;

        if (exitCode !== 0) {
          return yield* new SandboxError({
            reason: "ExecutionFailed",
            message: `Command failed with exit code ${exitCode}: ${result}`,
          });
        }
      });

    const inspectContainer = Effect.fn("DockerSandboxService.inspectContainer")(function* (
      workspacePath: string,
    ) {
      const containerName = yield* workspaceContainerName(workspacePath);
      const handle = yield* spawn(
        ChildProcess.make({
          shell: true,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        })`docker inspect -f '{{.State.Running}}' ${containerName}`,
      );

      const stdout = yield* handle.stdout.pipe(Stream.decodeText, Stream.mkString);
      const exitCode = yield* handle.exitCode;

      if (exitCode !== 0) {
        return {
          exists: false,
          running: false,
          containerName,
        } as const;
      }

      return {
        exists: true,
        running: stdout.trim() === "true",
        containerName,
      } as const;
    });

    const ensureContainer = Effect.fn("DockerSandboxService.ensureContainer")(function* (
      workspacePath: string,
    ) {
      const inspection = yield* inspectContainer(workspacePath);

      if (!inspection.exists) {
        yield* executeHost({ cwd: workspacePath })`
          docker run -d --name ${inspection.containerName} --user ${userSpec} -v ${workspacePath}:${CONTAINER_CWD} -w ${CONTAINER_CWD} ${DOCKER_IMAGE} ${CONTAINER_SHELL} -lc ${CONTAINER_IDLE_COMMAND}
        `;
        return inspection.containerName;
      }

      if (!inspection.running) {
        yield* executeHost({ cwd: workspacePath })`docker start ${inspection.containerName}`;
      }

      return inspection.containerName;
    });

    const removeContainer = Effect.fn("DockerSandboxService.removeContainer")(function* (
      workspacePath: string,
    ) {
      const inspection = yield* inspectContainer(workspacePath);

      if (!inspection.exists) {
        return;
      }

      yield* executeHost({ cwd: workspacePath })`docker rm -f ${inspection.containerName}`;
    });

    const execute = (options: ChildProcess.CommandOptions) =>
      Effect.fn("DockerSandboxService.execute")(function* (
        templates: TemplateStringsArray,
        ...expressions: readonly ChildProcess.TemplateExpression[]
      ) {
        const cwd = options.cwd;

        if (cwd === undefined) {
          return yield* new SandboxError({
            reason: "ExecutionFailed",
            message: "Docker sandbox requires a workspace cwd",
          });
        }

        const containerName = yield* ensureContainer(cwd);
        const command = renderCommand(templates, expressions);
        const handle = yield* spawn(
          ChildProcess.make({
            cwd,
            stdin: options.stdin ?? "inherit",
            stdout: options.stdout ?? "inherit",
            stderr: options.stderr ?? "inherit",
            shell: false,
          })`docker exec -i -w ${CONTAINER_CWD} ${containerName} ${CONTAINER_SHELL} -lc ${command}`,
        );

        const exitCode = yield* handle.exitCode;

        if (exitCode !== 0) {
          return yield* new SandboxError({
            reason: "ExecutionFailed",
            message: `Command failed with exit code ${exitCode}: ${command}`,
          });
        }
      });

    const init = Effect.fn("DockerSandboxService.init")(function* (input: SandboxInitInput) {
      const { project, mainProjectPath, mainExists, branchPath } = input;

      if (!mainExists) {
        const gitLink = `git@github.com:${project.namespace}/${project.name}.git`;
        yield* executeHost({
          cwd: path.dirname(mainProjectPath),
        })`git clone ${gitLink} ${mainProjectPath}`;
      }

      if (project.hasBranch() && branchPath !== undefined) {
        yield* executeHost({
          cwd: mainProjectPath,
        })`git worktree add ${branchPath} -b ${project.branch}`;
        yield* ensureContainer(branchPath);
        return;
      }

      yield* ensureContainer(mainProjectPath);
    });

    const destroy = Effect.fn("DockerSandboxService.destroy")(function* (
      input: SandboxDestroyInput,
    ) {
      const { branchPath, force = false, mainProjectPath } = input;
      const workspacePath = branchPath ?? mainProjectPath;

      if (workspacePath !== undefined) {
        yield* removeContainer(workspacePath);
      }

      if (branchPath === undefined || mainProjectPath === undefined) {
        return;
      }

      yield* (
        force
          ? executeHost({ cwd: mainProjectPath })`git worktree remove --force ${branchPath}`
          : executeHost({ cwd: mainProjectPath })`git worktree remove ${branchPath}`
      ).pipe(
        Effect.catchTag("SandboxError", (e) => {
          if (e.message.includes(branchPath) && e.message.includes("not a working tree")) {
            return Console.log(`Worktree '${branchPath}' already deleted`);
          }

          if (
            e.message.includes(branchPath) &&
            e.message.includes("contains modified or untracked files, use --force to delete it")
          ) {
            return Effect.fail(
              new SandboxError({
                reason: "UncommittedChanges",
                message:
                  "Worktree contains uncommitted changes. Please commit or stash them before destroying the sandbox.",
              }),
            );
          }

          return Effect.fail(e);
        }),
      );
    });

    const attach = Effect.fn("DockerSandboxService.attach")(function* (
      _project: ProjectModel,
      workspacePath: string,
    ) {
      const containerName = yield* ensureContainer(workspacePath);

      yield* interactiveCommand
        .run(["docker", "exec", "-it", "-w", CONTAINER_CWD, containerName, CONTAINER_SHELL])
        .pipe(
          Effect.mapError(
            (error) =>
              new SandboxError({
                reason: "AttachFailed",
                message: error.message,
              }),
          ),
        );
    });

    const detach = Effect.fn("DockerSandboxService.detach")(function* (_project: ProjectModel) {
      return undefined;
    });

    return SandboxService.of({
      execute,
      init,
      destroy,
      attach,
      detach,
    });
  }),
);

import { Console, Effect, Layer, PlatformError, Scope } from "effect";
import { SandboxError, SandboxService } from "../port/sandbox.service";
import type { SandboxDestroyInput, SandboxInitInput } from "../port/sandbox.service";
import type { ChildProcess } from "effect/unstable/process";
import { DockerError, DockerService } from "../../common/docker";
import { InteractiveCommandService } from "../../common/adapter/interactive-command.service";
import type { ProjectModel } from "../domain";
import {
  DEFAULT_REPOSITORY_ROOT,
  DEFAULT_WORK_TREE_ROOT,
  DOCKER_WORKSPACE_DIR,
} from "../../common/constant/path";
import { homedir } from "node:os";

/** Map DockerError | PlatformError to SandboxError so the port interface stays clean. */
const mapDockerError = <A>(
  effect: Effect.Effect<A, DockerError | PlatformError.PlatformError, Scope.Scope>,
  reason: SandboxError["reason"] = "ExecutionFailed",
): Effect.Effect<A, SandboxError | PlatformError.PlatformError, Scope.Scope> =>
  effect.pipe(
    Effect.mapError((e) =>
      e instanceof DockerError ? new SandboxError({ reason, message: e.message }) : e,
    ),
  );

/**
 * Derive the Docker container name from a host-side cwd.
 *
 * The cwd produced by FileSystemService is either:
 *   - main checkout   : `<home>/.local/share/github/<repo>`
 *   - branch worktree : `<home>/.local/share/skipper/worktree/<repo>/<repo>.<branch>`
 *
 * We parse the repo and optional branch from these paths and map them to the
 * container naming convention used by DockerService.
 */
const resolveContainerFromCwd = (
  cwd: string,
  containerNameFn: (repo: string, branch: string | undefined) => string,
): { containerName: string; workDir: string } => {
  const home = homedir();
  const mainPrefix = `${home}/${DEFAULT_REPOSITORY_ROOT}/`;
  const branchPrefix = `${home}/${DEFAULT_WORK_TREE_ROOT}/`;

  if (cwd.startsWith(branchPrefix)) {
    const relative = cwd.slice(branchPrefix.length);
    const parts = relative.split("/");
    const repo = parts[0] ?? "";
    const tail = parts[1] ?? "";
    const branch = tail.startsWith(`${repo}.`) ? tail.slice(repo.length + 1) : tail;
    return { containerName: containerNameFn(repo, branch), workDir: DOCKER_WORKSPACE_DIR };
  }

  if (cwd.startsWith(mainPrefix)) {
    const repo = cwd.slice(mainPrefix.length).split("/")[0] ?? "";
    return { containerName: containerNameFn(repo, undefined), workDir: DOCKER_WORKSPACE_DIR };
  }

  // Fallback: treat the last path segment as the container name
  const fallbackName = cwd.split("/").pop() ?? "unknown";
  return { containerName: fallbackName, workDir: DOCKER_WORKSPACE_DIR };
};

export const DockerSandboxServiceLayer = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const docker = yield* DockerService;
    const { run } = yield* InteractiveCommandService;

    const execute = (options: ChildProcess.CommandOptions) =>
      Effect.fn("DockerSandboxService.execute")(function* (
        templates: TemplateStringsArray,
        ...expressions: readonly ChildProcess.TemplateExpression[]
      ) {
        const parts: string[] = [];
        for (let i = 0; i < templates.length; i++) {
          parts.push(templates[i] ?? "");
          if (i < expressions.length) {
            parts.push(String(expressions[i]));
          }
        }
        const command = parts.join("");

        const cwd = typeof options.cwd === "string" ? options.cwd : undefined;

        if (cwd === undefined) {
          return yield* new SandboxError({
            reason: "ExecutionFailed",
            message: "Docker execute requires a cwd",
          });
        }

        const { containerName, workDir } = resolveContainerFromCwd(cwd, docker.containerName);

        const exists = yield* mapDockerError(docker.containerExists(containerName));
        if (!exists) {
          return yield* new SandboxError({
            reason: "ExecutionFailed",
            message: `Container '${containerName}' does not exist. Create the workspace first.`,
          });
        }

        // For interactive commands (stdin: "inherit"), use docker exec -it via InteractiveCommandService
        if (options.stdin === "inherit") {
          yield* run([
            "docker",
            "exec",
            "-it",
            "-w",
            workDir,
            containerName,
            "sh",
            "-c",
            command,
          ]).pipe(
            Effect.mapError(
              (error) =>
                new SandboxError({
                  reason: "ExecutionFailed",
                  message: `Command failed in container '${containerName}': ${error.message}`,
                }),
            ),
          );
          return;
        }

        const result = yield* mapDockerError(
          docker.execInContainer(containerName, command, { cwd: workDir }),
        );

        if (result.length > 0) {
          yield* Console.log(result);
        }
      });

    const init = Effect.fn("DockerSandboxService.init")(function* (input: SandboxInitInput) {
      const { project, mainProjectPath, mainExists } = input;

      yield* mapDockerError(docker.ensureImage());

      if (!mainExists) {
        return yield* new SandboxError({
          reason: "ExecutionFailed",
          message:
            "Host checkout does not exist. Run clone with worktree backend first, or clone manually.",
        });
      }

      // Always ensure main container exists
      const mainContainerName = docker.containerName(project.name, undefined);
      const mainContainerExists = yield* mapDockerError(docker.containerExists(mainContainerName));

      if (!mainContainerExists) {
        yield* Console.log(`Creating main container '${mainContainerName}'...`);
        yield* mapDockerError(docker.createContainer(mainContainerName, project.name, undefined));

        // Copy host repo into container
        yield* Console.log("Copying repository into container...");
        yield* mapDockerError(docker.copyRepo(mainContainerName, mainProjectPath));
      }

      if (project.hasBranch()) {
        const branchContainerName = docker.containerName(project.name, project.branch);
        const branchContainerExists = yield* mapDockerError(
          docker.containerExists(branchContainerName),
        );

        if (!branchContainerExists) {
          yield* Console.log(`Creating branch container '${branchContainerName}'...`);
          yield* mapDockerError(
            docker.createContainer(branchContainerName, project.name, project.branch),
          );

          // Copy repo from host main checkout
          yield* Console.log("Copying repository into branch container...");
          yield* mapDockerError(docker.copyRepo(branchContainerName, mainProjectPath));

          // Create and checkout the branch inside the container
          yield* Console.log(`Creating branch '${project.branch}' in container...`);
          yield* mapDockerError(
            docker.execInContainer(
              branchContainerName,
              `git checkout -b ${project.branch} 2>/dev/null || git checkout ${project.branch}`,
            ),
          );
        }
      }
    });

    const destroy = Effect.fn("DockerSandboxService.destroy")(function* (
      input: SandboxDestroyInput,
    ) {
      const { project } = input;

      if (project.hasBranch()) {
        const branchContainerName = docker.containerName(project.name, project.branch);
        const exists = yield* mapDockerError(docker.containerExists(branchContainerName));

        if (exists) {
          yield* Console.log(`Removing container '${branchContainerName}'...`);
          yield* mapDockerError(docker.removeContainer(branchContainerName));
        } else {
          yield* Console.log(`Container '${branchContainerName}' not found`);
        }
      } else {
        const mainContainerName = docker.containerName(project.name, undefined);
        const exists = yield* mapDockerError(docker.containerExists(mainContainerName));

        if (exists) {
          yield* Console.log(`Removing container '${mainContainerName}'...`);
          yield* mapDockerError(docker.removeContainer(mainContainerName));
        } else {
          yield* Console.log(`Container '${mainContainerName}' not found`);
        }
      }
    });

    const attach = Effect.fn("DockerSandboxService.attach")(function* (
      project: ProjectModel,
      _path: string,
    ) {
      const name = project.hasBranch()
        ? docker.containerName(project.name, project.branch)
        : docker.containerName(project.name, undefined);

      const exists = yield* mapDockerError(docker.containerExists(name), "AttachFailed");

      if (!exists) {
        return yield* new SandboxError({
          reason: "AttachFailed",
          message: `Container '${name}' does not exist. Create the workspace first.`,
        });
      }

      yield* run(["docker", "exec", "-it", "-w", DOCKER_WORKSPACE_DIR, name, "bash"]).pipe(
        Effect.mapError(
          (error) =>
            new SandboxError({
              reason: "AttachFailed",
              message: `Failed to attach to container '${name}': ${error.message}`,
            }),
        ),
      );
    });

    const detach = Effect.fn("DockerSandboxService.detach")(function* (_project: ProjectModel) {
      // Docker detach is a no-op — exiting the shell detaches naturally
    });

    return {
      execute,
      init,
      destroy,
      attach,
      detach,
    };
  }),
);

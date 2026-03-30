import { Console, Effect, Layer, Path, Stream } from "effect";
import { SandboxError, SandboxService } from "../port/sandbox.service";
import type { SandboxDestroyInput, SandboxInitInput } from "../port/sandbox.service";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { TmuxService } from "../../common/tmux";
import type { ProjectModel } from "../domain";
import type { WorkspaceHandle } from "../port/workspace-registry.service";

export const WorkTreeSandboxServiceLayer = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;
    const path = yield* Path.Path;
    const tmux = yield* TmuxService;

    const runCommand = Effect.fn("WorkTreeSandboxService.runCommand")(function* (
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

    const execute = Effect.fn("WorkTreeSandboxService.execute")(function* (
      workspace: WorkspaceHandle,
      command: string,
      options: ChildProcess.CommandOptions = {},
    ) {
      yield* runCommand(command, {
        ...options,
        cwd: workspace.cwd,
      });
    });

    const init = Effect.fn("WorkTreeSandboxService.init")(function* (input: SandboxInitInput) {
      const { project, mainProjectPath, mainExists, branchPath } = input;

      if (!mainExists) {
        const gitLink = `git@github.com:${project.namespace}/${project.name}.git`;
        yield* runCommand(`git clone ${gitLink} ${mainProjectPath}`, {
          cwd: path.dirname(mainProjectPath),
        });
      }

      if (project.hasBranch() && branchPath !== undefined) {
        yield* runCommand(`git worktree add ${branchPath} -b ${project.branch}`, {
          cwd: mainProjectPath,
        });
      }
    });

    const destroy = Effect.fn("WorkTreeSandboxService.destroy")(function* (
      input: SandboxDestroyInput,
    ) {
      const { branchPath, force = false, mainProjectPath } = input;

      if (branchPath === undefined || mainProjectPath === undefined) {
        return;
      }

      yield* (
        force
          ? runCommand(`git worktree remove --force ${branchPath}`, { cwd: mainProjectPath })
          : runCommand(`git worktree remove ${branchPath}`, { cwd: mainProjectPath })
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

    const attach = Effect.fn("WorkTreeSandboxService.attach")(
      function* (workspace: WorkspaceHandle) {
        const { project, cwd } = workspace;
        yield* tmux.ensureInstalled();

        const sessionName = tmux.sessionName(project);

        const hasTmuxSession = yield* tmux.hasSession(sessionName);

        if (!hasTmuxSession) {
          yield* tmux.createSession(sessionName, cwd);
        }

        if (yield* tmux.isInSession()) {
          yield* tmux.switchClient(sessionName);
        } else {
          yield* tmux.attachSession(sessionName);
        }
      },
      Effect.catchTag("TmuxError", (e) =>
        Effect.fail(
          new SandboxError({
            reason: "AttachFailed",
            message: e.toReadable(),
          }),
        ),
      ),
    );

    const detach = Effect.fn("WorkTreeSandboxService.detach")(function* (project: ProjectModel) {
      const sessionName = tmux.sessionName(project);

      yield* tmux.killSession(sessionName).pipe(
        Effect.catchTag("TmuxError", (e) => {
          if ((e.stderr ?? "").includes("can't find session")) {
            return Console.log(`Tmux session '${sessionName}' already deleted`);
          }

          return Effect.fail(
            new SandboxError({
              reason: "DetachFailed",
              message: e.toReadable(),
            }),
          );
        }),
      );
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

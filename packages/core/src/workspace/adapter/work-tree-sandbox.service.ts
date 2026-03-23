import { Console, Effect, Layer, Stream } from "effect";
import { SandboxError, SandboxService } from "../port/sandbox.service";
import type { Command } from "effect/unstable/process/ChildProcess";
import { Tmux } from "../../common/tmux";
import type { ProjectModel } from "../domain";

export const WorkTreeSandboxServiceLayer = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const execute = Effect.fn("WorkTreeSandboxService.execute")(function* (command: Command) {
      const handle = yield* command;

      yield* Stream.runForEach(handle.all, (chunk) =>
        Effect.sync(() => {
          globalThis.process.stdout.write(chunk);
        }),
      );

      const exitCode = yield* handle.exitCode;

      if (exitCode !== 0) {
        const stderr = yield* handle.stderr.pipe(Stream.decodeText, Stream.mkString);
        return yield* new SandboxError({
          message: `Command failed with exit code ${exitCode}: ${stderr}`,
        });
      }
    });

    const init = Effect.fn("WorkTreeSandboxService.init")(() => Effect.void);

    const destroy = Effect.fn("WorkTreeSandboxService.destroy")(() => Effect.void);

    const attach = Effect.fn("WorkTreeSandboxService.attach")(
      function* (project: ProjectModel, path: string) {
        yield* Tmux.ensureInstalled();

        const sessionName = Tmux.sessionName(project);

        const isInTmuxSession = yield* Tmux.isInSession();
        const hasTmuxSession = yield* Tmux.hasSession(sessionName);

        if (!hasTmuxSession) {
          yield* Tmux.createSession(sessionName, path);
        }

        yield* isInTmuxSession ? Tmux.switchClient(sessionName) : Tmux.attachSession(sessionName);
      },
      Effect.catchTag("TmuxError", (e) =>
        Effect.fail(
          new SandboxError({
            message: e.toReadable(),
          }),
        ),
      ),
    );

    const detach = Effect.fn("WorkTreeSandboxService.detach")(function* (project: ProjectModel) {
      const sessionName = Tmux.sessionName(project);

      yield* Tmux.killSession(sessionName).pipe(
        Effect.catchTag("TmuxError", (e) => {
          if ((e.stderr ?? "").includes("can't find session")) {
            return Console.log(`Tmux session '${sessionName}' already deleted`);
          }

          return Effect.fail(
            new SandboxError({
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

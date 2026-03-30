import { DateTime, Effect } from "effect";
import type { ProjectModel } from "../domain/project.model";
import { FileSystemService } from "../port/file-system.service";
import { OpenCodeService } from "../../opencode";
import { SessionService } from "../../session/port/session.service";

const MAX_TITLE_LENGTH = 48;

const normalizeBranch = (project: ProjectModel) => project.branch ?? "main";

const buildTitle = Effect.fn("workspace.prompt.buildTitle")(function* (prompt: string) {
  const now = yield* DateTime.now;
  const normalized = prompt.replaceAll(/\s+/g, " ").trim();
  const snippet = normalized.slice(0, MAX_TITLE_LENGTH) || "workspace prompt";
  return `${snippet} ${DateTime.toEpochMillis(now).toString(36)}`;
});

const resolveCwd = Effect.fn("workspace.prompt.resolveCwd")(function* (project: ProjectModel) {
  const fileSystem = yield* FileSystemService;

  return yield* project.isMain()
    ? fileSystem.mainProjectCwd(project)
    : fileSystem.branchProjectCwd(project);
});

export const promptWorkspace = Effect.fn("workspace.prompt")(function* (
  project: ProjectModel,
  prompt: string,
  onTextDelta: (chunk: string) => Effect.Effect<void, never, never> = () => Effect.void,
) {
  const cwd = yield* resolveCwd(project);
  const openCode = yield* OpenCodeService;
  const sessionService = yield* SessionService;
  const title = yield* buildTitle(prompt);
  const providerSession = yield* openCode.createSession(cwd, title);

  const session = yield* sessionService.create({
    repository: project.name,
    branch: normalizeBranch(project),
    sandbox: project.sandboxKind(),
    title,
    providerSessionId: providerSession.id,
  });

  yield* sessionService.updateState(session.id, "working");

  const importTranscript = () =>
    Effect.gen(function* () {
      const messages = yield* openCode.listMessages(cwd, providerSession.id);

      for (const message of messages) {
        yield* sessionService.addMessage(session.id, message.role, message.content);
      }
    });

  const program = openCode.promptSession(cwd, providerSession.id, prompt, onTextDelta).pipe(
    Effect.tap(importTranscript),
    Effect.tap(() => sessionService.updateState(session.id, "idle")),
    Effect.catch((error) =>
      importTranscript().pipe(
        Effect.catch(() => Effect.void),
        Effect.andThen(sessionService.updateState(session.id, "stuck")),
        Effect.andThen(Effect.fail(error)),
      ),
    ),
  );

  return yield* program.pipe(
    Effect.onInterrupt(() =>
      openCode
        .abortSession(cwd, providerSession.id)
        .pipe(Effect.andThen(sessionService.updateState(session.id, "stuck"))),
    ),
    Effect.as(session),
  );
});

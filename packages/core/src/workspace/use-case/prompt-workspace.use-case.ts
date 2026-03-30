import { DateTime, Effect } from "effect";
import type { ProjectModel } from "../domain/project.model";
import { OpenCodeService } from "../../opencode";
import { SessionService } from "../../session/port/session.service";
import { WorkspaceRegistryService } from "../port/workspace-registry.service";

const MAX_TITLE_LENGTH = 48;

const normalizeBranch = (project: ProjectModel) => project.branch ?? "main";

const buildTitle = Effect.fn("workspace.prompt.buildTitle")(function* (prompt: string) {
  const now = yield* DateTime.now;
  const normalized = prompt.replaceAll(/\s+/g, " ").trim();
  const snippet = normalized.slice(0, MAX_TITLE_LENGTH) || "workspace prompt";
  return `${snippet} ${DateTime.toEpochMillis(now).toString(36)}`;
});

export const promptWorkspace = Effect.fn("workspace.prompt")(function* (
  project: ProjectModel,
  prompt: string,
  onTextDelta: (chunk: string) => Effect.Effect<void, never, never> = () => Effect.void,
) {
  const registry = yield* WorkspaceRegistryService;
  const workspace = yield* registry.resolve(project);
  const openCode = yield* OpenCodeService;
  const sessionService = yield* SessionService;
  const title = yield* buildTitle(prompt);
  const providerSession = yield* openCode.createSession(workspace, title);

  const session = yield* sessionService.create({
    repository: project.name,
    branch: normalizeBranch(project),
    title,
    providerSessionId: providerSession.id,
  });

  yield* sessionService.updateState(session.id, "working");

  const importTranscript = () =>
    Effect.gen(function* () {
      const messages = yield* openCode.listMessages(workspace, providerSession.id);

      for (const message of messages) {
        yield* sessionService.addMessage(session.id, message.role, message.content);
      }
    });

  const program = openCode.promptSession(workspace, providerSession.id, prompt, onTextDelta).pipe(
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
        .abortSession(workspace, providerSession.id)
        .pipe(Effect.andThen(sessionService.updateState(session.id, "stuck"))),
    ),
    Effect.as(session),
  );
});

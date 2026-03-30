import { createOpencodeClient, createOpencodeServer, type Part } from "@opencode-ai/sdk";
import { Effect, Layer } from "effect";
import {
  OpenCodeError,
  OpenCodeService,
  type OpenCodeTranscriptMessage,
} from "../port/opencode.service";
import type { WorkspaceHandle } from "../../workspace/port/workspace-registry.service";

const isTextPart = (part: Part): part is Extract<Part, { type: "text" }> => part.type === "text";

type StreamState = {
  messageRoles: Map<string, string>;
  partKinds: Map<string, string>;
  streamedPartIds: Set<string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const createStreamState = (): StreamState => ({
  messageRoles: new Map(),
  partKinds: new Map(),
  streamedPartIds: new Set(),
});

export const extractAssistantTextChunk = (
  event: unknown,
  sessionId: string,
  state: StreamState,
): string | undefined => {
  if (!isRecord(event) || getString(event.type) === undefined || !isRecord(event.properties)) {
    return undefined;
  }

  if (event.type === "message.updated" && isRecord(event.properties.info)) {
    const messageId = getString(event.properties.info.id);
    const role = getString(event.properties.info.role);

    if (messageId && role) {
      state.messageRoles.set(messageId, role);
    }

    return undefined;
  }

  if (event.type === "message.part.updated" && isRecord(event.properties.part)) {
    const part = event.properties.part;
    const partSessionId = getString(part.sessionID);
    const partId = getString(part.id);
    const messageId = getString(part.messageID);
    const partType = getString(part.type);

    if (partSessionId !== sessionId || !partId || !messageId || !partType) {
      return undefined;
    }

    state.partKinds.set(partId, partType);

    if (
      partType === "text" &&
      state.messageRoles.get(messageId) === "assistant" &&
      !state.streamedPartIds.has(partId)
    ) {
      const text = getString(part.text);

      if (text && text.length > 0) {
        state.streamedPartIds.add(partId);
        return text;
      }
    }

    return undefined;
  }

  if (event.type === "message.part.delta") {
    const partSessionId = getString(event.properties.sessionID);
    const partId = getString(event.properties.partID);
    const messageId = getString(event.properties.messageID);
    const field = getString(event.properties.field);
    const delta = getString(event.properties.delta);

    if (
      partSessionId !== sessionId ||
      !partId ||
      !messageId ||
      field !== "text" ||
      !delta ||
      state.messageRoles.get(messageId) !== "assistant" ||
      state.partKinds.get(partId) !== "text"
    ) {
      return undefined;
    }

    state.streamedPartIds.add(partId);
    return delta;
  }

  return undefined;
};

export const isSessionCompleteEvent = (event: unknown, sessionId: string) => {
  if (!isRecord(event) || !isRecord(event.properties)) {
    return false;
  }

  if (event.type === "session.idle") {
    return getString(event.properties.sessionID) === sessionId;
  }

  if (event.type === "session.status") {
    return (
      getString(event.properties.sessionID) === sessionId &&
      isRecord(event.properties.status) &&
      getString(event.properties.status.type) === "idle"
    );
  }

  return false;
};

const getSessionError = (event: unknown, sessionId: string) => {
  if (
    !isRecord(event) ||
    event.type !== "session.error" ||
    !isRecord(event.properties) ||
    getString(event.properties.sessionID) !== sessionId
  ) {
    return undefined;
  }

  return isRecord(event.properties.error) ? event.properties.error : undefined;
};

export const createOpenCodeError = (reason: OpenCodeError["reason"], message: string, cause?: unknown) =>
  new OpenCodeError({
    reason,
    message,
    cause: cause as any,
  });

const formatUnknownError = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown OpenCode error";

export const mapOpenCodeError = (error: unknown) => {
  if (error instanceof OpenCodeError) {
    return error;
  }

  const message = formatUnknownError(error);

  if (message.includes("spawn opencode ENOENT")) {
    return createOpenCodeError(
      "BinaryMissing",
      "OpenCode binary missing. Install `opencode` and retry.",
      error,
    );
  }

  if (message.includes("ProviderAuthError") || message.includes("auth")) {
    return createOpenCodeError(
      "AuthenticationFailed",
      "OpenCode auth missing. Run `opencode auth login` and retry.",
      error,
    );
  }

  return createOpenCodeError("ExecutionFailed", message, error);
};

const withClient = <A>(
  workspace: WorkspaceHandle,
  f: (client: ReturnType<typeof createOpencodeClient>) => Effect.Effect<A, OpenCodeError, never>,
): Effect.Effect<A, OpenCodeError, never> =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.tryPromise<Awaited<ReturnType<typeof createOpencodeServer>>, OpenCodeError>({
        try: () => createOpencodeServer({ port: 0 }),
        catch: mapOpenCodeError,
      }),
      (server) => Effect.sync(() => server.close()),
    );

    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: workspace.cwd,
    });

    return yield* f(client);
  }).pipe(Effect.scoped);

const extractText = (parts: ReadonlyArray<Part>) =>
  parts
    .filter((part) => isTextPart(part) && part.ignored !== true)
    .map((part) => (isTextPart(part) ? part.text : ""))
    .join("");

export const extractTranscript = (
  messages: ReadonlyArray<{ info: { role: string }; parts: ReadonlyArray<Part> }>,
): ReadonlyArray<OpenCodeTranscriptMessage> =>
  messages.flatMap((message) => {
    if (message.info.role !== "user" && message.info.role !== "assistant") {
      return [];
    }

    const content = extractText(message.parts).trim();

    if (content.length === 0) {
      return [];
    }

    return [{ role: message.info.role, content }];
  });

export const SdkOpenCodeServiceLayer = Layer.succeed(
  OpenCodeService,
  OpenCodeService.of({
    createSession: (workspace, title) =>
      withClient(workspace, (client) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise<
            Awaited<ReturnType<typeof client.session.create>>,
            OpenCodeError
          >({
            try: () => client.session.create({ body: { title } }),
            catch: mapOpenCodeError,
          });

          if (!result.data) {
            return yield* Effect.fail(
              createOpenCodeError("ExecutionFailed", "OpenCode session not created"),
            );
          }

          return {
            id: result.data.id,
            title: result.data.title,
          };
        }),
      ),
    promptSession: (workspace, sessionId, prompt, onTextDelta) =>
      withClient(workspace, (client) =>
        Effect.gen(function* () {
          const state = createStreamState();
          const eventsController = new AbortController();
          const events = yield* Effect.tryPromise<
            Awaited<ReturnType<typeof client.event.subscribe>>,
            OpenCodeError
          >({
            try: () => client.event.subscribe({ signal: eventsController.signal }),
            catch: mapOpenCodeError,
          });

          yield* Effect.tryPromise({
            try: () =>
              client.session.promptAsync({
                path: { id: sessionId },
                body: {
                  parts: [{ type: "text", text: prompt }],
                },
              }),
            catch: mapOpenCodeError,
          });

          yield* Effect.tryPromise({
            try: async () => {
              for await (const event of events.stream) {
                const chunk = extractAssistantTextChunk(event, sessionId, state);

                if (chunk !== undefined) {
                  await Effect.runPromise(onTextDelta(chunk));
                }

                if (isSessionCompleteEvent(event, sessionId)) {
                  eventsController.abort();
                  return;
                }

                const error = getSessionError(event, sessionId);

                if (error) {
                  eventsController.abort();
                  const errorData = isRecord(error.data) ? error.data : undefined;
                  const message =
                    errorData && typeof errorData.message === "string"
                      ? errorData.message
                      : "OpenCode session failed";
                  throw createOpenCodeError(
                    error?.name === "ProviderAuthError"
                      ? "AuthenticationFailed"
                      : "ExecutionFailed",
                    message,
                    error,
                  );
                }
              }

              eventsController.abort();
              throw createOpenCodeError(
                "ExecutionFailed",
                "OpenCode event stream ended unexpectedly",
              );
            },
            catch: mapOpenCodeError,
          }).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => eventsController.abort()).pipe(
                Effect.andThen(
                  Effect.tryPromise(() => client.session.abort({ path: { id: sessionId } })).pipe(
                    Effect.ignore,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    listMessages: (cwd, sessionId) =>
      withClient(cwd, (client) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise<
            Awaited<ReturnType<typeof client.session.messages>>,
            OpenCodeError
          >({
            try: () => client.session.messages({ path: { id: sessionId } }),
            catch: mapOpenCodeError,
          });

          return extractTranscript(result.data ?? []);
        }),
      ),
    abortSession: (cwd, sessionId) =>
      withClient(cwd, (client) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() => client.session.abort({ path: { id: sessionId } })).pipe(
            Effect.ignore,
          );
        }),
      ).pipe(Effect.ignore),
  }),
);

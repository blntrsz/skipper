import { createOpencodeClient } from "@opencode-ai/sdk";
import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  OpenCodeError,
  OpenCodeService,
} from "../port/opencode.service";
import { DOCKER_SANDBOX_PORT } from "../../workspace/adapter/docker-workspace.shared";
import type { WorkspaceHandle } from "../../workspace/port/workspace-registry.service";
import {
  createOpenCodeError,
  createStreamState,
  extractAssistantTextChunk,
  extractTranscript,
  isSessionCompleteEvent,
  mapOpenCodeError,
} from "./sdk-opencode.service";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\"'\"'`)}'`;

const ensureContainerName = (workspace: WorkspaceHandle) => {
  if (workspace.containerName) {
    return workspace.containerName;
  }

  throw createOpenCodeError("ExecutionFailed", "Missing Docker container name for OpenCode");
};

export const DockerOpenCodeServiceLayer = Layer.effect(
  OpenCodeService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;

    const runCommand = Effect.fn("DockerOpenCode.runCommand")((command: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawn(
            ChildProcess.make({
              shell: false,
            })`sh -lc ${command}`,
          );

          const stdout = yield* handle.stdout.pipe(Stream.decodeText, Stream.mkString);
          const stderr = yield* handle.stderr.pipe(Stream.decodeText, Stream.mkString);
          const exitCode = yield* handle.exitCode;

          if (exitCode !== 0) {
            return yield* Effect.fail(
              new OpenCodeError({
                reason: "ExecutionFailed",
                message: stderr || stdout || "Docker OpenCode command failed",
              }),
            );
          }

          return stdout.trim();
        }),
      ).pipe(Effect.mapError(mapOpenCodeError)),
    );

    const containerIp = Effect.fn("DockerOpenCode.containerIp")(function* (workspace: WorkspaceHandle) {
      return yield* runCommand(
        `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${shellQuote(ensureContainerName(workspace))}`,
      );
    });

    const ensureServer = Effect.fn("DockerOpenCode.ensureServer")(function* (workspace: WorkspaceHandle) {
      const containerName = ensureContainerName(workspace);
      const baseUrl = `http://${yield* containerIp(workspace)}:${DOCKER_SANDBOX_PORT}`;

      const probe = yield* Effect.exit(
        Effect.tryPromise({
          try: () => fetch(baseUrl),
          catch: mapOpenCodeError,
        }),
      );

      if (probe._tag === "Success") {
        return baseUrl;
      }

      yield* runCommand(
        `docker exec ${shellQuote(containerName)} sh -lc 'pgrep -f "opencode serve --hostname=0.0.0.0 --port=${DOCKER_SANDBOX_PORT}" >/dev/null || nohup opencode serve --hostname=0.0.0.0 --port=${DOCKER_SANDBOX_PORT} >/tmp/skipper-opencode.log 2>&1 &'`,
      );

      yield* Effect.tryPromise({
        try: async () => {
          for (let attempt = 0; attempt < 40; attempt++) {
            try {
              await fetch(baseUrl);
              return;
            } catch {
              await Bun.sleep(250);
            }
          }

          throw createOpenCodeError("ExecutionFailed", "Timed out waiting for OpenCode server");
        },
        catch: mapOpenCodeError,
      });

      return baseUrl;
    });

    const withClient = <A>(
      workspace: WorkspaceHandle,
      f: (client: ReturnType<typeof createOpencodeClient>) => Effect.Effect<A, OpenCodeError, never>,
    ) =>
      Effect.scoped(Effect.gen(function* () {
        const baseUrl = yield* ensureServer(workspace);
        const client = createOpencodeClient({
          baseUrl,
          directory: workspace.cwd,
        });

        return yield* f(client);
      }));

    return OpenCodeService.of({
      createSession: (workspace, title) =>
        withClient(workspace, (client) =>
          Effect.tryPromise<Awaited<ReturnType<typeof client.session.create>>, OpenCodeError>({
            try: () => client.session.create({ body: { title } }),
            catch: mapOpenCodeError,
          }).pipe(
            Effect.flatMap((result) =>
              result.data
                ? Effect.succeed({
                    id: result.data.id,
                    title: result.data.title,
                  })
                : Effect.fail(createOpenCodeError("ExecutionFailed", "OpenCode session not created")),
            ),
          ),
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
                Effect.tryPromise(() => client.session.abort({ path: { id: sessionId } })).pipe(
                  Effect.ignore,
                ),
              ),
            );
          }),
        ),
      listMessages: (workspace, sessionId) =>
        withClient(workspace, (client) =>
          Effect.tryPromise<Awaited<ReturnType<typeof client.session.messages>>, OpenCodeError>({
            try: () => client.session.messages({ path: { id: sessionId } }),
            catch: mapOpenCodeError,
          }).pipe(Effect.map((result) => extractTranscript(result.data ?? []))),
        ),
      abortSession: (workspace, sessionId) =>
        withClient(workspace, (client) =>
          Effect.tryPromise(() => client.session.abort({ path: { id: sessionId } })).pipe(
            Effect.ignore,
          ),
        ).pipe(Effect.ignore, Effect.catch(() => Effect.void)),
    });
  }),
);

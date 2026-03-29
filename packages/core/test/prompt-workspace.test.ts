/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { ProjectModel } from "../src/workspace/domain";
import {
  createStreamState,
  extractAssistantTextChunk,
  isSessionCompleteEvent,
} from "../src/opencode/adapter/sdk-opencode.service";
import { promptWorkspace } from "../src/workspace/use-case/prompt-workspace.use-case";
import { FileSystemService } from "../src/workspace/port/file-system.service";
import { OpenCodeService } from "../src/opencode";
import { SessionService } from "../src/session/port/session.service";

describe("promptWorkspace", () => {
  it("detects assistant deltas and completion status events", () => {
    const state = createStreamState();

    expect(
      extractAssistantTextChunk(
        {
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              role: "assistant",
            },
          },
        },
        "session-1",
        state,
      ),
    ).toBeUndefined();

    expect(
      extractAssistantTextChunk(
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-1",
              sessionID: "session-1",
              messageID: "msg-1",
              type: "text",
              text: "Hello",
            },
          },
        },
        "session-1",
        state,
      ),
    ).toBe("Hello");

    expect(
      extractAssistantTextChunk(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "session-1",
            messageID: "msg-1",
            partID: "part-1",
            field: "text",
            delta: " world",
          },
        },
        "session-1",
        state,
      ),
    ).toBe(" world");

    expect(
      isSessionCompleteEvent(
        {
          type: "session.status",
          properties: {
            sessionID: "session-1",
            status: { type: "idle" },
          },
        },
        "session-1",
      ),
    ).toBe(true);
  });

  it.effect("stores provider session id and imports transcript for branch workspace", () =>
    Effect.gen(function* () {
      const calls = {
        cwd: [] as Array<string>,
        sessionCreates: [] as Array<{
          repository: string;
          branch: string;
          title: string;
          providerSessionId?: string;
        }>,
        states: [] as Array<string>,
        messages: [] as Array<{ role: string; content: string }>,
        output: [] as Array<string>,
      };

      const project = new ProjectModel({ name: "skipper", branch: "feat/test" });

      yield* promptWorkspace(project, "Explain this", (chunk) =>
        Effect.sync(() => {
          calls.output.push(chunk);
        }),
      ).pipe(
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: Effect.die("unused"),
            init: () => Effect.void,
            destroy: () => Effect.void,
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.die("unused"),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.succeed("/worktrees/skipper/skipper.feat/test"),
          }),
        ),
        Effect.provideService(
          OpenCodeService,
          OpenCodeService.of({
            createSession: (cwd) =>
              Effect.sync(() => {
                calls.cwd.push(cwd);
                return { id: "provider-1", title: "ignored" };
              }),
            promptSession: (_cwd, _sessionId, _prompt, onTextDelta) =>
              onTextDelta("hello ").pipe(Effect.andThen(onTextDelta("world"))),
            listMessages: () =>
              Effect.succeed([
                { role: "user", content: "Explain this" },
                { role: "assistant", content: "hello world" },
              ]),
            abortSession: () => Effect.void,
          }),
        ),
        Effect.provideService(SqlClient.SqlClient, {} as any),
        Effect.provideService(
          SessionService,
          SessionService.of({
            create: (data) =>
              Effect.sync(() => {
                calls.sessionCreates.push(data);
                return {
                  id: "session-1" as any,
                  repository: data.repository,
                  branch: data.branch,
                  sandbox: data.sandbox ?? "worktree",
                  title: data.title,
                  providerSessionId: data.providerSessionId,
                  state: "idle" as const,
                  createdAt: 1,
                  updatedAt: 1,
                  lastMessageAt: 1,
                };
              }),
            get: () => Effect.die("unused"),
            list: () => Effect.die("unused"),
            delete: () => Effect.die("unused"),
            listMessages: () => Effect.die("unused"),
            addMessage: (_sessionId, role, content) =>
              Effect.sync(() => {
                calls.messages.push({ role, content });
                return {
                  id: `msg-${calls.messages.length}` as any,
                  sessionId: "session-1" as any,
                  role,
                  content,
                  createdAt: calls.messages.length,
                };
              }),
            updateState: (_sessionId, state) =>
              Effect.sync(() => {
                calls.states.push(state);
                return {
                  id: "session-1" as any,
                  repository: "skipper",
                  branch: "feat/test",
                  sandbox: "worktree" as const,
                  title: "title",
                  providerSessionId: "provider-1",
                  state,
                  createdAt: 1,
                  updatedAt: 1,
                  lastMessageAt: 1,
                };
              }),
          }),
        ),
      );

      expect(calls.cwd).toEqual(["/worktrees/skipper/skipper.feat/test"]);
      expect(calls.sessionCreates).toHaveLength(1);
      expect(calls.sessionCreates[0]?.repository).toBe("skipper");
      expect(calls.sessionCreates[0]?.branch).toBe("feat/test");
      expect(calls.sessionCreates[0]?.providerSessionId).toBe("provider-1");
      expect(calls.states).toEqual(["working", "idle"]);
      expect(calls.messages).toEqual([
        { role: "user", content: "Explain this" },
        { role: "assistant", content: "hello world" },
      ]);
      expect(calls.output).toEqual(["hello ", "world"]);
    }),
  );

  it.effect("normalizes main branch name and marks stuck on failure", () =>
    Effect.gen(function* () {
      const calls = {
        branches: [] as Array<string>,
        states: [] as Array<string>,
        aborts: 0,
      };

      const project = new ProjectModel({ name: "skipper" });

      const exit = yield* Effect.exit(
        promptWorkspace(project, "Explain main").pipe(
          Effect.provideService(
            FileSystemService,
            FileSystemService.of({
              fs: Effect.die("unused"),
              init: () => Effect.void,
              destroy: () => Effect.void,
              rootCwd: () => Effect.die("unused"),
              mainCwd: () => Effect.die("unused"),
              mainProjectCwd: () => Effect.succeed("/repos/skipper"),
              branchCwd: () => Effect.die("unused"),
              branchProjectCwd: () => Effect.die("unused"),
            }),
          ),
          Effect.provideService(
            OpenCodeService,
            OpenCodeService.of({
              createSession: () => Effect.succeed({ id: "provider-2", title: "ignored" }),
              promptSession: () =>
                Effect.fail({
                  _tag: "OpenCodeError",
                  reason: "ExecutionFailed",
                  message: "boom",
                } as any),
              listMessages: () => Effect.succeed([]),
              abortSession: () =>
                Effect.sync(() => {
                  calls.aborts++;
                }),
            }),
          ),
          Effect.provideService(SqlClient.SqlClient, {} as any),
          Effect.provideService(
            SessionService,
            SessionService.of({
              create: (data) =>
                Effect.sync(() => {
                  calls.branches.push(data.branch);
                  return {
                    id: "session-2" as any,
                    repository: data.repository,
                    branch: data.branch,
                    sandbox: data.sandbox ?? "worktree",
                    title: data.title,
                    providerSessionId: data.providerSessionId,
                    state: "idle" as const,
                    createdAt: 1,
                    updatedAt: 1,
                    lastMessageAt: 1,
                  };
                }),
              get: () => Effect.die("unused"),
              list: () => Effect.die("unused"),
              delete: () => Effect.die("unused"),
              listMessages: () => Effect.die("unused"),
              addMessage: () => Effect.die("unused"),
              updateState: (_sessionId, state) =>
                Effect.sync(() => {
                  calls.states.push(state);
                  return {
                    id: "session-2" as any,
                    repository: "skipper",
                    branch: "main",
                    sandbox: "worktree" as const,
                    title: "title",
                    providerSessionId: "provider-2",
                    state,
                    createdAt: 1,
                    updatedAt: 1,
                    lastMessageAt: 1,
                  };
                }),
            }),
          ),
        ),
      );

      expect(exit._tag).toBe("Failure");
      expect(calls.branches).toEqual(["main"]);
      expect(calls.states).toEqual(["working", "stuck"]);
      expect(calls.aborts).toBe(0);
    }),
  );
});

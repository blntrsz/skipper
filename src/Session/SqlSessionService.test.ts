import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect, Layer, String } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import * as Session from "../domain/Session";
import { migrations } from "../migrations";
import { SessionService } from "./SessionService";
import type { SessionService as SessionServiceApi } from "./SessionService";
import { SqlSessionService } from "./SqlSessionService";

const migratorOptions = {
  loader: SqliteMigrator.fromRecord(migrations),
} as const;

const makeDatabasePath = () =>
  join(tmpdir(), `skipper-session-${randomUUID()}.sqlite`);

const makeDatabaseLayer = (filename: string) => {
  const sqliteLayer = SqliteClient.layer({
    filename,
    create: true,
    transformQueryNames: String.camelToSnake,
    transformResultNames: String.snakeToCamel,
  });
  const migratorLayer = SqliteMigrator.layer(migratorOptions);

  return migratorLayer.pipe(Layer.provideMerge(sqliteLayer));
};

const runSessionTest = async <A, E>(
  effect: Effect.Effect<A, E, SessionServiceApi | SqlClient.SqlClient>
) => {
  const filename = makeDatabasePath();

  try {
    return await Effect.runPromise(
      Effect.gen(function* () {
        yield* SqliteMigrator.run(migratorOptions);

        return yield* effect;
      }).pipe(
        Effect.provide(SqlSessionService),
        Effect.provide(makeDatabaseLayer(filename))
      )
    );
  } finally {
    await Promise.all([
      rm(filename, { force: true }),
      rm(`${filename}-shm`, { force: true }),
      rm(`${filename}-wal`, { force: true }),
    ]);
  }
};

describe("SessionService", () => {
  test("unique repository + branch + title enforced", async () => {
    await expect(
      runSessionTest(
        Effect.gen(function* () {
          const service = yield* SessionService;

          yield* service.create({
            repository: "repo",
            branch: "main",
            title: "first",
          });

          return yield* service.create({
            repository: "repo",
            branch: "main",
            title: "first",
          });
        })
      )
    ).rejects.toBeDefined();
  });

  test("addMessage preserves order", async () => {
    const result = await runSessionTest(
      Effect.gen(function* () {
        const service = yield* SessionService;
        const session = yield* service.create({
          repository: "repo",
          branch: "main",
          title: "first",
        });
        const first = yield* service.addMessage(session.id, "user", "hello");
        const second = yield* service.addMessage(
          session.id,
          "assistant",
          "hi"
        );
        const messages = yield* service.listMessages(session.id);

        return { first, second, messages };
      })
    );

    expect(result.messages.map((message) => message.id)).toEqual([
      result.first.id,
      result.second.id,
    ]);
    expect(result.messages.map((message) => message.content)).toEqual([
      "hello",
      "hi",
    ]);
  });

  test("state updates bump updatedAt", async () => {
    const result = await runSessionTest(
      Effect.gen(function* () {
        const service = yield* SessionService;
        const session = yield* service.create({
          repository: "repo",
          branch: "main",
          title: "first",
        });

        yield* Effect.promise(() => Bun.sleep(2));

        const updated = yield* service.updateState(session.id, "working");

        return { session, updated };
      })
    );

    expect(result.updated.state).toBe("working");
    expect(result.updated.updatedAt).toBeGreaterThan(result.session.updatedAt);
  });

  test("addMessage updates session state and message timestamps", async () => {
    const result = await runSessionTest(
      Effect.gen(function* () {
        const service = yield* SessionService;
        const session = yield* service.create({
          repository: "repo",
          branch: "main",
          title: "first",
        });

        yield* Effect.promise(() => Bun.sleep(2));

        const message = yield* service.addMessage(
          session.id,
          "assistant",
          "hi",
          "unread"
        );
        const updated = yield* service.get(session.id);

        return { session, message, updated };
      })
    );

    expect(result.updated.state).toBe("unread");
    expect(result.updated.updatedAt).toBe(result.message.createdAt);
    expect(result.updated.lastMessageAt).toBe(result.message.createdAt);
    expect(result.updated.updatedAt).toBeGreaterThan(result.session.updatedAt);
  });

  test("stuck remains until explicit clear", async () => {
    const result = await runSessionTest(
      Effect.gen(function* () {
        const service = yield* SessionService;
        const session = yield* service.create({
          repository: "repo",
          branch: "main",
          title: "first",
        });

        yield* service.updateState(session.id, "stuck");
        yield* service.addMessage(
          session.id,
          "assistant",
          "need permission",
          "unread"
        );

        const stuck = yield* service.get(session.id);
        const cleared = yield* service.updateState(session.id, "idle");

        return { stuck, cleared };
      })
    );

    expect(result.stuck.state).toBe("stuck");
    expect(result.cleared.state).toBe("idle");
  });

  test("listMessages rejects unknown session", async () => {
    await expect(
      runSessionTest(
        Effect.gen(function* () {
          const service = yield* SessionService;

          return yield* service.listMessages(Session.generateSessionId());
        })
      )
    ).rejects.toBeDefined();
  });
});

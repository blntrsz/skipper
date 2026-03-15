import { BunFileSystem } from "@effect/platform-bun";
import { SqliteClient as EffectSqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect, String as EffectString, FileSystem, Layer } from "effect";
import * as Path from "../domain/Path";
import { migrations } from "../migrations";

export const migratorOptions = {
  loader: SqliteMigrator.fromRecord(migrations),
} as const;

const makeEnsureDatabaseDirectoryLive = () =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.makeDirectory(Path.databaseDir(), { recursive: true });
    }),
  ).pipe(Layer.provide(BunFileSystem.layer));

export const makeDatabaseLive = () => {
  return Layer.unwrap(
    Effect.sync(() => {
      const sqliteLive = EffectSqliteClient.layer({
        filename: Path.databasePath(),
        create: true,
        transformQueryNames: EffectString.camelToSnake,
        transformResultNames: EffectString.snakeToCamel,
      }).pipe(Layer.provide(makeEnsureDatabaseDirectoryLive()));

      const migratorLive = SqliteMigrator.layer(migratorOptions);

      return migratorLive.pipe(Layer.provideMerge(sqliteLive));
    }),
  );
};

export const makeTestDatabaseLive = () =>
  SqliteMigrator.layer(migratorOptions).pipe(
    Layer.provideMerge(
      EffectSqliteClient.layer({
        filename: ":memory:",
        create: true,
        transformQueryNames: EffectString.camelToSnake,
        transformResultNames: EffectString.snakeToCamel,
      }),
    ),
  );

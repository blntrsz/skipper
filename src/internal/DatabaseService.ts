import { Effect, FileSystem, Layer, String } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { SqliteMigrator } from "@effect/sql-sqlite-bun";
import { BunFileSystem } from "@effect/platform-bun";
import { migrations } from "../migrations";
import * as Path from "@/domain/Path";

export const migratorOptions = {
  loader: SqliteMigrator.fromRecord(migrations),
} as const;

const makeEnsureDatabaseDirectoryLive = () =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.makeDirectory(Path.databaseDir(), { recursive: true });
    })
  ).pipe(Layer.provide(BunFileSystem.layer));

export const makeDatabaseLive = () => {
  return Layer.unwrap(
    Effect.sync(() => {
      const sqliteLive = SqliteClient.layer({
        filename: Path.databasePath(),
        create: true,
        transformQueryNames: String.camelToSnake,
        transformResultNames: String.snakeToCamel,
      }).pipe(Layer.provide(makeEnsureDatabaseDirectoryLive()));

      const migratorLive = SqliteMigrator.layer(migratorOptions);

      return migratorLive.pipe(Layer.provideMerge(sqliteLive));
    })
  );
};

export const runMigrations = SqliteMigrator.run(migratorOptions).pipe(
  Effect.asVoid
);

export { SqliteClient };

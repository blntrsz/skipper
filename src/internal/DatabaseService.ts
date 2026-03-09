import { Effect, FileSystem, Layer, String } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { SqliteMigrator } from "@effect/sql-sqlite-bun";
import { BunFileSystem } from "@effect/platform-bun";
import { migrations } from "../migrations";
import { databaseDir, databasePath } from "./SkipperPaths";

const DB_PATH = databasePath();
const DB_DIR = databaseDir();

const migratorOptions = {
  loader: SqliteMigrator.fromRecord(migrations),
} as const;

const EnsureDatabaseDirectoryLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(DB_DIR, { recursive: true });
  })
).pipe(Layer.provide(BunFileSystem.layer));

const SqliteLive = SqliteClient.layer({
  filename: DB_PATH,
  create: true,
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel,
}).pipe(Layer.provide(EnsureDatabaseDirectoryLive));

const MigratorLive = SqliteMigrator.layer(migratorOptions);

export const runMigrations = SqliteMigrator.run(migratorOptions).pipe(
  Effect.asVoid
);

export const DatabaseLive = MigratorLive.pipe(Layer.provideMerge(SqliteLive));

export { SqliteClient };

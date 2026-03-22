import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { String as EffectString, Layer } from "effect";
import { migrations } from "../migrations";
import { DATABASE_FILE_NAME } from "./constant/path";
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { join } from "node:path";
import { homedir } from "node:os";

export const migratorOptions = {
  loader: SqliteMigrator.fromRecord(migrations),
} satisfies SqliteMigrator.MigratorOptions<never>;

export const SqlLayer = SqliteMigrator.layer(migratorOptions).pipe(
  Layer.provideMerge(
    SqliteClient.layer({
      filename: join(homedir(), DATABASE_FILE_NAME),
      create: true,
      transformQueryNames: EffectString.camelToSnake,
      transformResultNames: EffectString.snakeToCamel,
    }),
  ),
);

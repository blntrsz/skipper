import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      repository TEXT NOT NULL,
      branch TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_tasks_repository ON tasks(repository)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state)`;
});

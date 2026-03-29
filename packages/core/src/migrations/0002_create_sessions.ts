import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      repository TEXT NOT NULL,
      branch TEXT NOT NULL,
      sandbox TEXT NOT NULL DEFAULT 'worktree',
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_repository_branch_sandbox
    ON sessions(repository, branch, sandbox)
  `;
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_repository_branch_sandbox_title
    ON sessions(repository, branch, sandbox, title)
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state)`;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
    ON sessions(updated_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_session_messages_session_id_created_at_id
    ON session_messages(session_id, created_at, id)
  `;
});

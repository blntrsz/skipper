import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE sessions
    ADD COLUMN sandbox TEXT NOT NULL DEFAULT 'worktree'
  `.pipe(Effect.ignore);

  yield* sql`DROP INDEX IF EXISTS idx_sessions_repository_branch`.pipe(Effect.ignore);
  yield* sql`DROP INDEX IF EXISTS idx_sessions_repository_branch_title`.pipe(Effect.ignore);

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_repository_branch_sandbox
    ON sessions(repository, branch, sandbox)
  `;
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_repository_branch_sandbox_title
    ON sessions(repository, branch, sandbox, title)
  `;
});

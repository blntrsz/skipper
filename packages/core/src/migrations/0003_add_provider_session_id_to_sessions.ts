import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE sessions
    ADD COLUMN provider_session_id TEXT
  `.pipe(Effect.ignore);
});

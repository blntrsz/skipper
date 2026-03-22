import { SessionId } from "@skippercorp/core/session/domain";
import { Effect } from "effect";
import { Flag } from "effect/unstable/cli";

export const sessionStateChoices = ["idle", "working", "unread", "stuck"] as const;
export const sessionMessageRoleChoices = ["user", "assistant", "system"] as const;

export const idFlag = Flag.string("id").pipe(
  Flag.withSchema(SessionId),
  Flag.withDescription("Session id"),
);

export const printJson = (value: unknown) =>
  Effect.sync(() => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  });

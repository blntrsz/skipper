import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import * as Session from "../domain/Session";
import { withDatabase } from "../Runtime";
import { SessionService } from "./SessionService";

const sessionStateChoices = ["idle", "working", "unread", "stuck"] as const;
const sessionMessageRoleChoices = ["user", "assistant", "system"] as const;

const idFlag = Flag.string("id").pipe(
  Flag.withSchema(Session.SessionId),
  Flag.withDescription("Session id")
);

const printJson = (value: unknown) =>
  Effect.sync(() => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  });

const withSessionDependencies = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withDatabase(effect);

const createCommand = Command.make(
  "create",
  {
    repository: Flag.string("repository").pipe(
      Flag.withDescription("Repository name")
    ),
    branch: Flag.string("branch").pipe(Flag.withDescription("Branch name")),
    title: Flag.string("title").pipe(Flag.withDescription("Session title")),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* SessionService;
      const session = yield* service.create(input);

      yield* printJson(session);
    }).pipe(withSessionDependencies)
).pipe(Command.withDescription("Create session"));

const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const service = yield* SessionService;
    const sessions = yield* service.list();

    yield* printJson(sessions);
  }).pipe(withSessionDependencies)
).pipe(Command.withDescription("List all sessions"));

const getCommand = Command.make("get", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const service = yield* SessionService;
    const session = yield* service.get(input.id);

    yield* printJson(session);
  }).pipe(withSessionDependencies)
).pipe(Command.withDescription("Get session by id"));

const updateStateCommand = Command.make(
  "update-state",
  {
    id: idFlag,
    state: Flag.choice("state", sessionStateChoices).pipe(
      Flag.withDescription("Session state")
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* SessionService;
      const session = yield* service.updateState(input.id, input.state);

      yield* printJson(session);
    }).pipe(withSessionDependencies)
).pipe(Command.withDescription("Update session state"));

const addMessageCommand = Command.make(
  "add-message",
  {
    id: idFlag,
    role: Flag.choice("role", sessionMessageRoleChoices).pipe(
      Flag.withDescription("Message role")
    ),
    state: Flag.optional(
      Flag.choice("state", sessionStateChoices).pipe(
        Flag.withDescription("Next session state")
      )
    ),
    content: Flag.string("content").pipe(
      Flag.withDescription("Message content")
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* SessionService;
      const message = yield* service.addMessage(
        input.id,
        input.role,
        input.content,
        Option.getOrUndefined(input.state)
      );

      yield* printJson(message);
    }).pipe(withSessionDependencies)
).pipe(Command.withDescription("Add session message"));

const listMessagesCommand = Command.make("messages", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const service = yield* SessionService;
    const messages = yield* service.listMessages(input.id);

    yield* printJson(messages);
  }).pipe(withSessionDependencies)
).pipe(Command.withDescription("List session messages"));

const deleteCommand = Command.make("delete", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const service = yield* SessionService;

    yield* service.delete(input.id);
    yield* printJson({ deleted: true, id: input.id });
  }).pipe(withSessionDependencies)
).pipe(Command.withDescription("Delete session"));

export const SessionCli = Command.make("session").pipe(
  Command.withDescription("Manage sessions in sqlite db"),
  Command.withSubcommands([
    createCommand,
    listCommand,
    getCommand,
    updateStateCommand,
    addMessageCommand,
    listMessagesCommand,
    deleteCommand,
  ])
);

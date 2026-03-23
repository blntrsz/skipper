import { Command } from "effect/unstable/cli";
import { createSessionCommand } from "./create-session.command";
import { listSessionsCommand } from "./list-sessions.command";
import { getSessionCommand } from "./get-session.command";
import { updateSessionStateCommand } from "./update-session-state.command";
import { addSessionMessageCommand } from "./add-session-message.command";
import { listSessionMessagesCommand } from "./list-session-messages.command";
import { deleteSessionCommand } from "./delete-session.command";

export const sessionCommand = Command.make("session").pipe(
  Command.withDescription("Manage sessions"),
  Command.withAlias("s"),
  Command.withSubcommands([
    createSessionCommand,
    listSessionsCommand,
    getSessionCommand,
    updateSessionStateCommand,
    addSessionMessageCommand,
    listSessionMessagesCommand,
    deleteSessionCommand,
  ]),
);

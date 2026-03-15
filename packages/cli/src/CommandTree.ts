import { Command } from "effect/unstable/cli";
import { cloneCommand, sandboxCommand } from "./Sandbox";
import { SessionCli } from "./Session";
import { TaskCli } from "./Task";

export const command = Command.make("skipper").pipe(
  Command.withSubcommands([cloneCommand, sandboxCommand, SessionCli, TaskCli]),
);

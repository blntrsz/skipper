import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { AgentService, AgentServiceImpl } from "./Service";

export const runCommand = Command.make(
  "run",
  {
    prompt: Argument.string("prompt").pipe(
      Argument.withDescription("Prompt passed to configured command")
    ),
    repository: Flag.optional(
      Flag.string("repository").pipe(
        Flag.withDescription("Repository name (uses interactive picker when omitted)")
      )
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* AgentService;

      yield* service.run({
        prompt: input.prompt,
        repository: input.repository,
      });
    }).pipe(Effect.provide(AgentServiceImpl))
).pipe(Command.withDescription("Run configured command in a repository"));

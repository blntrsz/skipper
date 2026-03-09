import { Effect, Layer, ServiceMap } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { AgentService } from "./Port";
import { AgentServiceImpl } from "./Service";
import { AgentCommandServiceImpl } from "@/internal/AgentCommandService";
import { GitServiceImpl } from "@/internal/GitService";
import { GlobalConfigServiceImpl } from "@/internal/GlobalConfigService";

const agentLayer = AgentServiceImpl.pipe(
  Layer.provide(
    Layer.mergeAll(
      AgentCommandServiceImpl.pipe(
        Layer.provide(Layer.succeedServices(ServiceMap.mergeAll(GlobalConfigServiceImpl)))
      ),
      Layer.succeedServices(ServiceMap.mergeAll(GitServiceImpl))
    )
  )
);

export const runCommand = Command.make(
  "run",
  {
    prompt: Argument.string("prompt").pipe(
      Argument.withDescription("Prompt passed to configured command")
    ),
    repository: Flag.optional(
      Flag.string("repository").pipe(Flag.withDescription("Repository name"))
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* AgentService;

      yield* service.run({
        prompt: input.prompt,
        repository: input.repository,
      });
    }).pipe(Effect.provide(agentLayer))
).pipe(Command.withAlias("r"), Command.withDescription("Run configured command in a repository"));

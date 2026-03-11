import { Effect, Layer, ServiceMap } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { WorkflowService } from "./Port";
import { WorkflowServiceImpl } from "./Service";
import { WorkflowDefinitionServiceImpl } from "@/internal/WorkflowDefinitionService";
import { TerminalPicker } from "@/internal/Picker/TerminalService";

const workflowLayer = WorkflowServiceImpl.pipe(
  Layer.provide(
    Layer.succeedServices(ServiceMap.mergeAll(WorkflowDefinitionServiceImpl, TerminalPicker))
  )
);

const runCommand = Command.make(
  "run",
  {
    repository: Flag.optional(
      Flag.string("repository").pipe(Flag.withDescription("Repository name"))
    ),
    branch: Flag.optional(
      Flag.string("branch").pipe(Flag.withDescription("Branch name"))
    ),
    input: Flag.optional(
      Flag.string("input").pipe(Flag.withDescription("Workflow input JSON"))
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* WorkflowService;
      yield* service.run(input);
    }).pipe(Effect.provide(workflowLayer))
).pipe(Command.withDescription("Pick and run a workflow"));

export const workflowCommand = Command.make("workflow").pipe(
  Command.withAlias("w"),
  Command.withDescription("Run workflows"),
  Command.withSubcommands([runCommand])
);

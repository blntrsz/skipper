import { Effect, FileSystem, Layer, Option, ServiceMap } from "effect";
import { GitRepository } from "@/domain/GitRepository";
import { resolveWorkspacePath } from "@/domain/WorkspacePath";
import { listBranches, listRepositories } from "@/internal/SwitchService";
import { Picker, PickerCancelled, PickerNoMatch } from "@/internal/Picker/Service";
import { WorkflowDefinitionService } from "@/internal/WorkflowDefinitionService";
import { WorkflowServiceError } from "./Error";
import { WorkflowService } from "./Port";

const hasTerminal = () => process.stdin.isTTY === true && process.stdout.isTTY === true;

const ensureInteractive = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  hasTerminal()
    ? effect
    : Effect.fail(
        new WorkflowServiceError({
          message: "Workflow run requires an interactive terminal",
        })
      );

const resolveRepository = (
  picker: (typeof Picker.Service),
  repository: Option.Option<string>
) =>
  Effect.gen(function* () {
    const repositories = yield* listRepositories();

    if (repositories.length === 0) {
      return yield* Effect.fail(
        new WorkflowServiceError({ message: "No repositories found" })
      );
    }

    if (Option.isSome(repository)) {
      if (repositories.includes(repository.value)) {
        return repository.value;
      }

      return yield* Effect.fail(
        new WorkflowServiceError({
          message: `Repository '${repository.value}' not found`,
        })
      );
    }

    return yield* ensureInteractive(
      picker.pick({ message: "Repository", options: repositories })
    );
  });

const resolveBranch = (
  picker: (typeof Picker.Service),
  repository: string,
  branch: Option.Option<string>
) =>
  Effect.gen(function* () {
    const branches = yield* listBranches(repository);

    if (Option.isSome(branch)) {
      if (branches.includes(branch.value)) {
        return branch.value;
      }

      return yield* Effect.fail(
        new WorkflowServiceError({
          message: `Branch '${branch.value}' not found for '${repository}'`,
        })
      );
    }

    return yield* ensureInteractive(
      picker.pick({ message: "Branch", options: [...branches] })
    );
  });

export const WorkflowServiceImpl = Layer.effect(
  WorkflowService,
  Effect.gen(function* () {
    const workflowDefinitions = yield* WorkflowDefinitionService;
    const picker = yield* Picker;

    const run: WorkflowService["run"] = (input) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const repository = yield* resolveRepository(picker, input.repository);
        const branch = yield* resolveBranch(picker, repository, input.branch);
        const gitRepository = GitRepository.makeUnsafe({ repository, branch });
        const workspacePath = resolveWorkspacePath(gitRepository);

        if (!(yield* fs.exists(workspacePath))) {
          return yield* Effect.fail(
            new WorkflowServiceError({
              message: `Target path '${workspacePath}' not found for '${repository}:${branch}'`,
            })
          );
        }

        const workflows = yield* workflowDefinitions.list(gitRepository);

        if (workflows.length === 0) {
          return yield* Effect.fail(
            new WorkflowServiceError({
              message: `No workflows found for '${repository}:${branch}'`,
            })
          );
        }

        const workflowLabel = (w: (typeof workflows)[number]) =>
          w.source === "repo" ? `${w.name} [repo]` : w.name;
        const workflowByLabel = new Map(workflows.map((w) => [workflowLabel(w), w]));

        const selectedLabel = yield* ensureInteractive(
          picker.pick({
            message: "Workflow",
            options: workflows.map(workflowLabel),
          })
        );

        const definition = workflowByLabel.get(selectedLabel);
        if (!definition) {
          return yield* Effect.fail(
            new WorkflowServiceError({ message: `Workflow '${selectedLabel}' not found` })
          );
        }

        const payload = JSON.stringify({
          workflowPath: definition.path,
          workspacePath,
          input: Option.getOrUndefined(input.input),
        });

        const result = yield* Effect.tryPromise({
          try: () =>
            Bun.$`${["bun", "run", "./src/Workflow/Runtime.ts", payload]}`
              .cwd(process.cwd())
              .env(process.env)
              .nothrow(),
          catch: (cause) =>
            new WorkflowServiceError({
              message: `Workflow '${definition.name}' failed to start`,
              cause,
            }),
        });
        const exitCode = result.exitCode;

        if (exitCode !== 0) {
          return yield* Effect.fail(
            new WorkflowServiceError({
              message: `Workflow '${definition.name}' failed with exit code ${exitCode}`,
            })
          );
        }
      }).pipe(
        Effect.catchIf(
          (error): error is PickerCancelled | PickerNoMatch =>
            error instanceof PickerCancelled || error instanceof PickerNoMatch,
          () => Effect.void
        )
      );

    return { run } satisfies WorkflowService;
  })
);

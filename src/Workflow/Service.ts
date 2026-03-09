import { Effect, FileSystem, Layer, Option, ServiceMap } from "effect";
import { GitRepository } from "@/domain/GitRepository";
import { resolveWorkspacePath } from "@/domain/WorkspacePath";
import { listBranches, listRepositories } from "@/internal/SwitchService";
import { PickerCancelled, pickOne } from "@/internal/InteractivePicker";
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

const resolveRepository = (repository: Option.Option<string>) =>
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
      pickOne(
        "Repository",
        repositories.map((value) => ({ label: value, value }))
      )
    );
  });

const resolveBranch = (repository: string, branch: Option.Option<string>) =>
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
      pickOne(
        "Branch",
        branches.map((value) => ({ label: value, value }))
      )
    );
  });

export const WorkflowServiceImpl = Layer.effect(
  WorkflowService,
  Effect.gen(function* () {
    const workflowDefinitions = yield* WorkflowDefinitionService;

    const run: WorkflowService["run"] = (input) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const repository = yield* resolveRepository(input.repository);
        const branch = yield* resolveBranch(repository, input.branch);
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

        const definition = yield* ensureInteractive(
          pickOne(
            "Workflow",
            workflows.map((workflow) => ({
              label:
                workflow.source === "repo"
                  ? `${workflow.name} [repo]`
                  : workflow.name,
              value: workflow,
            }))
          )
        );

        const payload = JSON.stringify({
          workflowPath: definition.path,
          workspacePath,
          input: Option.getOrUndefined(input.input),
        });

        const proc = Bun.spawn(["bun", "run", "./src/Workflow/Runtime.ts", payload], {
          cwd: process.cwd(),
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          env: process.env,
        });
        const exitCode = yield* Effect.promise(() => proc.exited);

        if (exitCode !== 0) {
          return yield* Effect.fail(
            new WorkflowServiceError({
              message: `Workflow '${definition.name}' failed with exit code ${exitCode}`,
            })
          );
        }
      }).pipe(
        Effect.catchIf(
          (error): error is PickerCancelled => error instanceof PickerCancelled,
          () => Effect.void
        )
      );

    return { run } satisfies WorkflowService;
  })
);

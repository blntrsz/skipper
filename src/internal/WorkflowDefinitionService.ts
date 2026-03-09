import { Effect, FileSystem, Option, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { join, parse } from "node:path";
import { resolveWorkspacePath } from "@/domain/WorkspacePath";
import type { GitRepository } from "@/domain/GitRepository";
import { workflowRoot, workspaceWorkflowRoot } from "@/internal/SkipperPaths";
import { WorkflowDefinitionError } from "@/internal/WorkflowDefinitionError";

const WORKFLOW_EXTENSIONS = new Set([".ts"]);

export type WorkflowDefinitionSource = "user" | "repo";

export type WorkflowDefinition = {
  readonly name: string;
  readonly source: WorkflowDefinitionSource;
  readonly path: string;
  readonly repository: string;
  readonly branch: string;
};

type ListedWorkflow = {
  readonly name: string;
  readonly source: WorkflowDefinitionSource;
  readonly path: string;
};

const listWorkflowFilesInDirectory = (
  directory: string,
  source: WorkflowDefinitionSource
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(directory).pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound"
          ? Effect.succeed([])
          : Effect.fail(error)
      ),
      Effect.mapError(
        (error) =>
          new WorkflowDefinitionError({
            message: `Failed to list '${directory}'`,
            cause: error,
          })
      )
    );

    const workflows = yield* Effect.forEach(entries, (entry) =>
      Effect.gen(function* () {
        const path = join(directory, entry);
        const stats = yield* fs.stat(path).pipe(
          Effect.mapError(
            (error) =>
              new WorkflowDefinitionError({
                message: `Failed to list '${directory}'`,
                cause: error,
              })
          )
        );

        if (stats.type !== "File") {
          return Option.none<ListedWorkflow>();
        }

        const parsed = parse(entry);

        if (!WORKFLOW_EXTENSIONS.has(parsed.ext) || parsed.name.length === 0) {
          return Option.none<ListedWorkflow>();
        }

        return Option.some<ListedWorkflow>({
          name: parsed.name,
          source,
          path,
        });
      })
    );

    const filtered = workflows.flatMap((workflow) =>
      Option.isSome(workflow) ? [workflow.value] : []
    );
    const byName = new Map<string, ListedWorkflow>();

    for (const workflow of filtered) {
      const existing = byName.get(workflow.name);

      if (existing !== undefined) {
        return yield* Effect.fail(
          new WorkflowDefinitionError({
            message: `Duplicate workflow '${workflow.name}' in '${directory}'`,
          })
        );
      }

      byName.set(workflow.name, workflow);
    }

    return byName;
  });

export const listWorkflowDefinitions = (gitRepository: GitRepository) =>
  Effect.gen(function* () {
    const workspacePath = resolveWorkspacePath(gitRepository);
    const userWorkflows = yield* listWorkflowFilesInDirectory(workflowRoot(), "user");
    const repoWorkflows = yield* listWorkflowFilesInDirectory(
      workspaceWorkflowRoot(workspacePath),
      "repo"
    );
    const merged = new Map([...userWorkflows, ...repoWorkflows]);

    return [...merged.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(
        (workflow): WorkflowDefinition => ({
          ...workflow,
          repository: gitRepository.repository,
          branch: gitRepository.branch,
        })
      );
  });

export const WorkflowDefinitionService = ServiceMap.Service<{
  list: (
    gitRepository: GitRepository
  ) => Effect.Effect<
    readonly WorkflowDefinition[],
    PlatformError | WorkflowDefinitionError,
    FileSystem.FileSystem
  >;
  resolve: (
    gitRepository: GitRepository,
    workflow: Option.Option<string>
  ) => Effect.Effect<
    WorkflowDefinition,
    PlatformError | WorkflowDefinitionError,
    FileSystem.FileSystem
  >;
}>("WorkflowDefinitionService");

export const WorkflowDefinitionServiceImpl = ServiceMap.make(
  WorkflowDefinitionService,
  {
    list: listWorkflowDefinitions,
    resolve: (gitRepository, workflow) =>
      Effect.gen(function* () {
        const definitions = yield* listWorkflowDefinitions(gitRepository);

        if (definitions.length === 0) {
          return yield* Effect.fail(
            new WorkflowDefinitionError({
              message: `No workflows found for '${gitRepository.repository}:${gitRepository.branch}'`,
            })
          );
        }

        if (Option.isNone(workflow)) {
          return yield* Effect.fail(
            new WorkflowDefinitionError({ message: "Missing workflow name" })
          );
        }

        const definition = definitions.find((item) => item.name === workflow.value);

        if (definition !== undefined) {
          return definition;
        }

        return yield* Effect.fail(
          new WorkflowDefinitionError({
            message: `Workflow '${workflow.value}' not found for '${gitRepository.repository}:${gitRepository.branch}'`,
          })
        );
      }),
  }
);

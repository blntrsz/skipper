import { Workspace } from "@skippercorp/core";
import { Effect, Option, pipe } from "effect";
import { Flag, Prompt } from "effect/unstable/cli";
import { sandboxFlag } from "../../common/sandbox";

const MAIN_BRANCH_PICK = "__SKIPPER_MAIN__";

type BranchChoice = {
  title: string;
  value: string;
};

export const extractPickedBranch = (repository: string, input: string) => {
  const prefix = `${repository}.`;
  return input.startsWith(prefix) ? input.slice(prefix.length) : input;
};

export const buildBranchChoices = (repository: string, options: ReadonlyArray<string>) => {
  const choices = options.map((option) => {
    const branch = extractPickedBranch(repository, option);
    return {
      title: branch === "main" ? "main (branch worktree)" : branch,
      value: branch,
    } satisfies BranchChoice;
  });

  return [{ title: "main", value: MAIN_BRANCH_PICK } satisfies BranchChoice, ...choices];
};

export const resolvePickedBranch = (branch: string) =>
  branch === MAIN_BRANCH_PICK ? undefined : branch;

export const normalizeRepositoryName = (repository: string, sandbox: Workspace.SandboxKind) =>
  sandbox === "docker" && repository.endsWith(".docker") ? repository.slice(0, -7) : repository;

export const normalizeBranchChoice = (
  branch: string | undefined,
  sandbox: Workspace.SandboxKind,
) => {
  if (sandbox !== "docker" || branch === undefined || !branch.endsWith(".docker")) {
    return branch;
  }

  return branch.slice(0, -7);
};

export const flags = {
  git: {
    repository: Flag.optional(
      Flag.string("repository").pipe(
        Flag.withAlias("username"),
        Flag.withDescription("Git repository name"),
      ),
    ),
    branch: Flag.optional(
      Flag.string("branch").pipe(Flag.withAlias("branchname"), Flag.withDescription("Git branch")),
    ),
  },
  sandbox: sandboxFlag,
};

type PickProjectOptions = {
  branchMode: "new" | "existing";
};

export const pickProject = Effect.fn(function* (
  git: {
    repository: Option.Option<string>;
    branch: Option.Option<string>;
  },
  sandbox: Workspace.SandboxKind,
  options: PickProjectOptions,
) {
  const name = yield* Option.match(git.repository, {
    onSome: (value) => Effect.succeed(value),
    onNone: () =>
      pipe(
        Workspace.listMainProject(),
        Effect.andThen((options) =>
          Prompt.run(
            Prompt.autoComplete({
              message: "Select a repository",
              maxPerPage: 10,
              emptyMessage: "No matches",
              choices: options
                .filter((option) =>
                  sandbox === "docker" ? option.endsWith(".docker") : !option.endsWith(".docker"),
                )
                .map((option) => ({
                  title: normalizeRepositoryName(option, sandbox),
                  value: normalizeRepositoryName(option, sandbox),
                })),
            }),
          ),
        ),
      ),
  });

  const branch = yield* Option.match(git.branch, {
    onSome: (value) => Effect.succeed(value),
    onNone: () =>
      options.branchMode === "new"
        ? Prompt.run(
            Prompt.text({
              message: "Branch name",
              validate: (value) => {
                const branch = value.trim();
                return branch.length > 0
                  ? Effect.succeed(branch)
                  : Effect.fail("Branch name is required");
              },
            }),
          )
        : pipe(
            Workspace.listBranchProject(name),
            Effect.andThen((options) =>
              Prompt.run(
                Prompt.autoComplete({
                  message: "Select a branch",
                  maxPerPage: 10,
                  emptyMessage: "No matches",
                  choices: buildBranchChoices(
                    name,
                    options.filter((option) =>
                      sandbox === "docker"
                        ? option.endsWith(".docker")
                        : !option.endsWith(".docker"),
                    ),
                  ),
                }),
              ).pipe(
                Effect.map(resolvePickedBranch),
                Effect.map((branch) => normalizeBranchChoice(branch, sandbox)),
              ),
            ),
          ),
  });

  return new Workspace.ProjectModel({ name, branch, sandbox });
});

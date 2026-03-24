import { Workspace } from "@skippercorp/core";
import { Effect, Option, pipe } from "effect";
import { Flag, Prompt } from "effect/unstable/cli";

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
};

export type PickProjectOptions = {
  branchMode: "new" | "existing";
};

export const pickProject = Effect.fn(function* (
  git: {
    repository: Option.Option<string>;
    branch: Option.Option<string>;
  },
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
              choices: options.map((option) => ({ title: option, value: option })),
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
                  choices: buildBranchChoices(name, options),
                }),
              ).pipe(Effect.map(resolvePickedBranch)),
            ),
          ),
  });

  return new Workspace.ProjectModel({ name, branch });
});

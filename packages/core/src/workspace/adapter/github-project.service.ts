import { Effect, Layer } from "effect";
import { ProjectService } from "../port/project.service";
import { ChildProcess } from "effect/unstable/process";

export const GitHubProjectServiceLayer = Layer.effect(
  ProjectService,
  // eslint-disable-next-line require-yield
  Effect.gen(function* () {
    /**
     * Clones a GitHub Repository based on the provided project information
     *
     * @since 0.1.0
     * @category service-method
     */
    // eslint-disable-next-line require-yield
    const clone = Effect.fn("GitHubProjectService.clone")(function* (project, path) {
      const gitLink = `git@github.com:${project.namespace}/${project.name}.git`;
      return ChildProcess.make({
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })`git clone ${gitLink} ${path}`;
    });

    /**
     * Creates a new branch and adds it as a worktree based on the provided project information
     *
     * @since 0.1.0
     * @category service-method
     */
    // eslint-disable-next-line require-yield
    const branch = Effect.fn("GitHubProjectService.branch")(function* (branchName, path) {
      return ChildProcess.make({
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })`git worktree add ${path} -b ${branchName}`;
    });

    /**
     * Removes the worktree based on the provided project information
     *
     * @since 0.1.0
     * @category service-method
     */
    // eslint-disable-next-line require-yield
    const removeBranch = Effect.fn("GitHubProjectService.removeBranch")(function* (path) {
      return ChildProcess.make({
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })`git worktree remove ${path}`;
    });

    return {
      clone,
      branch,
      removeBranch,
    };
  }),
);

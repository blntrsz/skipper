import { Workspace } from "@skippercorp/core";
import { Effect } from "effect";
import { Argument, Command } from "effect/unstable/cli";

const githubSshRemotePattern = /^git@github\.com:(?<namespace>[^/]+)\/(?<name>[^/]+)\.git$/;
const invalidGithubSshRemoteMessage =
  "Expected GitHub SSH remote like git@github.com:owner/repo.git";

export type ParsedGithubSshRemote = {
  namespace: string;
  name: string;
};

export const parseGithubSshRemote = (remote: string): ParsedGithubSshRemote => {
  const match = githubSshRemotePattern.exec(remote);
  const namespace = match?.groups?.namespace;
  const name = match?.groups?.name;

  if (!namespace || !name) {
    throw new Error(invalidGithubSshRemoteMessage);
  }

  return { namespace, name };
};

export const cloneCommand = Command.make(
  "clone",
  {
    remote: Argument.string("remote").pipe(
      Argument.withDescription("GitHub SSH remote"),
      Argument.mapTryCatch(parseGithubSshRemote, () => invalidGithubSshRemoteMessage),
    ),
  },
  ({ remote }) =>
    Effect.gen(function* () {
      yield* Workspace.initWorkspace(new Workspace.ProjectModel(remote));
    }),
).pipe(Command.withDescription("Clone repository default branch"));

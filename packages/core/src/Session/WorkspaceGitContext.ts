import { basename, dirname, isAbsolute, resolve } from "node:path";

export type WorkspaceGitContext = {
  repository: string;
  branch: string;
};

export async function resolveWorkspaceGitContext(cwd: string): Promise<WorkspaceGitContext> {
  const branch = await readGitCommand(cwd, ["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  const commonDir = await readGitCommand(cwd, ["git", "rev-parse", "--git-common-dir"]);
  const repositoryFromCommonDir = resolveRepositoryFromCommonDir(cwd, commonDir);

  if (repositoryFromCommonDir !== undefined) {
    return {
      repository: repositoryFromCommonDir,
      branch,
    };
  }

  const remote = await readGitCommandOptional(cwd, ["git", "config", "--get", "remote.origin.url"]);
  const repositoryFromRemote = remote !== undefined ? repositoryFromRemoteUrl(remote) : undefined;

  if (repositoryFromRemote !== undefined) {
    return {
      repository: repositoryFromRemote,
      branch,
    };
  }

  const topLevel = await readGitCommand(cwd, ["git", "rev-parse", "--show-toplevel"]);

  return {
    repository: basename(topLevel),
    branch,
  };
}

async function readGitCommand(cwd: string, command: ReadonlyArray<string>) {
  const result = await Bun.$`${{
    raw: command.map((part) => Bun.$.escape(part)).join(" "),
  }}`
    .cwd(cwd)
    .quiet()
    .nothrow();

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || `Git command failed: ${command.join(" ")}`);
  }

  return result.text().trim();
}

async function readGitCommandOptional(cwd: string, command: ReadonlyArray<string>) {
  const result = await Bun.$`${{
    raw: command.map((part) => Bun.$.escape(part)).join(" "),
  }}`
    .cwd(cwd)
    .quiet()
    .nothrow();

  if (result.exitCode !== 0) {
    return undefined;
  }

  const text = result.text().trim();
  return text.length > 0 ? text : undefined;
}

function resolveRepositoryFromCommonDir(cwd: string, commonDir: string) {
  const absoluteCommonDir = isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
  const repository = basename(dirname(absoluteCommonDir));

  return repository.length > 0 && repository !== "." ? repository : undefined;
}

function repositoryFromRemoteUrl(remote: string) {
  const normalized = remote.trim().replace(/\.git$/, "");

  if (normalized.length === 0) {
    return undefined;
  }

  const match = normalized.match(/[:/]([^/]+)$/);
  return match?.[1];
}

<p align="center">
  <img src="docs/skipper-logo.png" alt="Skipper logo" width="220" />
</p>

<h1 align="center">@skippercorp/skipper-cli</h1>

<p align="center">
  Fast local worktree flow + task management CLI.
</p>

Workflows can be defined per user in `~/.config/skipper/workflow/*.ts` or per workspace in `.skipper/workflow/*.ts`.

## Install

```bash
bun add -g @skippercorp/skipper-cli
```

Or run without installing:

```bash
bunx @skippercorp/skipper-cli --help
```

## Quick start

```bash
# Clone a repo
skipper clone owner/repo

# Create sandbox resources
skipper sandbox add --repository repo --branch feature

# Run a prompt in a repo
skipper run --repository repo "fix typo in README"

# Pick repo, branch, then workflow
skipper workflow run

# Remove sandbox resources
skipper sandbox remove --repository repo --branch feature
```

## Commands

| Command                                               | Description                                    |
| ----------------------------------------------------- | ---------------------------------------------- |
| `skipper clone <owner/repo>`                          | Clone repo into `~/.local/share/github/<repo>` |
| `skipper sandbox add`                                 | Create sandbox resources                       |
| `skipper sandbox remove` (or `s rm`)                  | Remove sandbox resources                       |
| `skipper run --repository <repo> "<prompt>"`          | Run prompt in a repo                           |
| `skipper workflow run`                                | Pick repo, branch, workflow and run it         |
| `skipper task create`                                 | Create a task                                  |
| `skipper task list`                                   | List all tasks                                 |
| `skipper task get --id <id>`                          | Get task by ID                                 |
| `skipper task update-state --id <id> --state <state>` | Update task state                              |
| `skipper task delete --id <id>`                       | Delete a task                                  |

## Workflows

Workflow files are TypeScript modules discovered from:

```text
~/.config/skipper/workflow/*.ts
~/.local/share/github/my-repo/.skipper/workflow/*.ts
~/.local/share/skipper/worktree/my-repo/my-repo.feature/.skipper/workflow/*.ts
```

- `skipper workflow run` uses pickers: repository -> branch -> workflow
- workflow name comes from the filename stem
- if user + repo/worktree have same workflow name, repo/worktree wins
- workflows run with `bun`
- repo/worktree workflow lookup uses the selected workspace path

Example workflow:

```ts
export default async function issueTriage(context, { issueNumber }) {
  const details = await context.shell(
    `gh issue view ${issueNumber} --json number,title,body,comments`,
  );
  const comment = await context.prompt(
    `Summarize triage for issue #${issueNumber}: ${details.stdout}`,
  );
  await context.shell(`gh issue comment ${issueNumber} --body-file -`, {
    stdin: comment,
  });
}
```

Example code-review workflow for current local changes:

```ts
export default async function codeReviewWorkflow(context) {
  const diff = await context.shell("git diff --cached --no-ext-diff && git diff --no-ext-diff");

  if (diff.stdout.trim().length === 0) {
    process.stdout.write("No local changes to review.\n");
    return;
  }

  const review = await context.prompt(
    [
      "Review these local git changes. Staged diff comes first, then unstaged diff.",
      "Only report major or minor issues: correctness, regressions, security, reliability, and meaningful test gaps.",
      "Ignore style-only feedback and nitpicks.",
      "Keep feedback concise and actionable.",
      "",
      diff.stdout,
    ].join("\n"),
  );

  process.stdout.write(`${review.trim()}\n`);
}
```

Optional input:

```bash
skipper workflow run --input '{"issueNumber":123}'
```

Workflow host API in V1:

- `context.shell(command, { stdin? })` returns `{ stdout, stderr, exitCode }`
- `context.prompt(text)` runs the configured agent command and returns stdout

## Requirements

- `bun`
- `git`
- `gh` (GitHub CLI)
- `tmux`

## Development

```bash
bun install
bun run cli -- --help
bun run format
bun run lint
bun run check
bun test
```

## Release

Uses Changesets for versioning:

```bash
bun run changeset  # Add changeset
bun run release  # Publish to npm
```

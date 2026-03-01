<p align="center">
  <img src="docs/skipper-logo.png" alt="Skipper logo" width="220" />
</p>

<h1 align="center">@skippercorp/skipper</h1>

<p align="center">
  Fast local worktree flow + GitHub event automation in one CLI.
</p>

<p align="center">
  <a href="#quick-ramp-up">Quick ramp-up</a>
  <span> | </span>
  <a href="#command-cheat-sheet">Command cheat sheet</a>
  <span> | </span>
  <a href="#aws-worker-flow">AWS worker flow</a>
  <span> | </span>
  <a href="#development">Development</a>
</p>

Published package: `@skippercorp/skipper`  
CLI command: `skipper`

## Why skipper

- Keep repo cloning, worktree setup, and tmux session switching fast.
- Run prompt-based repo automation locally or in AWS.
- Wire GitHub webhooks to worker definitions in `.skipper/worker/*.ts`.

## Quick ramp-up

### Prerequisites

- `bun`
- `git`
- `gh` (GitHub CLI)
- `fzf`
- `tmux`
- For AWS commands: valid AWS credentials/profile with CloudFormation, ECS, EventBridge, S3, and IAM access.

### Install

Run without global install:

```bash
bunx @skippercorp/skipper hello
```

Or install globally:

```bash
bun add -g @skippercorp/skipper
skipper hello
```

### Local workflow in 60 seconds

```bash
# 1) Clone a repo into ~/.local/share/github/<repo>
skipper clone owner/repo

# 2) Create/attach a worktree and jump into tmux
skipper a

# 3) Pull latest + run prompt automation in selected repo
skipper run "fix flaky tests and update CI"

# 4) Remove a worktree and its tmux session
skipper rm
```

Skipper manages:

- Repositories: `~/.local/share/github/<repo>`
- Worktrees: `~/.local/share/skipper/worktree/<repo>/<worktree>`
- Tmux sessions: `<repo>-<worktree>`

## Command cheat sheet

| Command | What it does |
| --- | --- |
| `skipper clone <owner/repo-or-url>` | Clones repo using `gh` into `~/.local/share/github` |
| `skipper a` | Selects repo/worktree with `fzf`, creates if missing, then attaches tmux |
| `skipper rm` | Removes selected worktree and kills matching tmux session |
| `skipper run "<prompt>"` | Selects repo, pulls latest, runs `opencode run` |
| `skipper aws bootstrap ...` | Deploys shared AWS ingress stack + optional GitHub webhook |
| `skipper aws deploy ...` | Deploys repository-scoped subscription stack |
| `skipper aws run "<prompt>"` | Starts ECS task from bootstrap stack for prompt execution |

## AWS worker flow

Use this when you want GitHub events to trigger remote agent runs.

### 1) Add worker definitions

Create `.skipper/worker/review.ts`:

```ts
export default {
  metadata: {
    id: "review",
    type: "code-review",
    description: "Review new pull requests",
    enabled: true,
    version: "1",
  },
  triggers: [
    {
      provider: "github",
      event: "pull_request",
      actions: ["opened", "reopened", "ready_for_review", "synchronize"],
    },
  ],
  runtime: {
    mode: "comment-only",
    allowPush: false,
    prompt: "Review this pull request. Focus on correctness and regression risk.",
  },
};
```

### 2) Bootstrap shared infrastructure (once per service/env)

```bash
skipper aws bootstrap myservice sandbox --github-repo owner/repo
```

### 3) Deploy repo-scoped subscription stack

```bash
skipper aws deploy myservice sandbox --github-repo owner/repo
```

### 4) Trigger one-off remote run

```bash
skipper aws run --service myservice --env sandbox --wait "triage new issues"
```

Useful safety flags:

- `--dry-run-template` for `aws bootstrap` and `aws deploy`
- `--dry-run` for `aws run`

## Development

```bash
bun install
bun run cli
bun run lint
bun test
```

Run e2e issue subscription verification:

```bash
SKIPPER_E2E_GITHUB_REPO=blntrsz/skipper SKIPPER_E2E_REGION=eu-central-1 bun run test:e2e:issue-subscription
```

## Release flow (Changesets)

1. Add release note: `bun run changeset`
2. Check pending releases: `bunx changeset status`
3. Push to `main`: `.github/workflows/release.yml` opens/updates version PR
4. Merge version PR: workflow publishes to npm with `NPM_TOKEN`

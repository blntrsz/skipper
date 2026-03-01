# @skippercorp/skipper

Published npm package: `@skippercorp/skipper`.
CLI command name stays `skipper`.

Install dependencies:

```bash
bun install
```

Run locally:

```bash
bun run cli
```

Validate source standards:

```bash
bun run lint
```

Run e2e issue subscription verification (creates temp issue, waits for ECS task, verifies issue fetch logs, then closes issue + stops task):

```bash
SKIPPER_E2E_GITHUB_REPO=blntrsz/skipper SKIPPER_E2E_REGION=eu-central-1 bun run test:e2e:issue-subscription
```

## Release flow (Changesets)

1. Add a release note: `bun run changeset`
2. Check pending releases: `bunx changeset status`
3. Push to `main`: `.github/workflows/release.yml` opens/updates a version PR
4. Merge version PR: workflow publishes to npm with `NPM_TOKEN`

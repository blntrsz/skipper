# skipper

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run cli
```

To validate source standards:

```bash
bun run lint
```

To run e2e issue subscription verification (creates temp issue, waits for ECS task, verifies issue fetch logs, then closes issue + stops task):

```bash
SKIPPER_E2E_GITHUB_REPO=blntrsz/skipper SKIPPER_E2E_REGION=eu-central-1 bun run test:e2e:issue-subscription
```

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

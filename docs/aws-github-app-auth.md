# AWS GitHub App auth

Skipper AWS worker flow now uses GitHub App auth only.

## Required inputs

- GitHub App id.
- GitHub App private key stored in AWS SSM as `SecureString`.
- SSM parameter name must start with `/`.
- Bootstrap flags:
  - `--github-app-id <id>`
  - `--github-app-private-key-ssm-parameter <name>`

## Set private key in SSM

```bash
aws ssm put-parameter \
  --name "/skipper/<service>/<env>/github-app-private-key" \
  --type "SecureString" \
  --value "$(cat /path/to/github-app-private-key.pem)" \
  --overwrite
```

## Bootstrap + deploy

```bash
bun run cli aws bootstrap <service> <env> \
  --github-repo <owner/repo> \
  --github-app-id <id> \
  --github-app-private-key-ssm-parameter </ssm/param/name>

bun run cli aws deploy <service> <env> --github-repo <owner/repo>
```

## Runtime behavior

- Lambda reads private key from SSM.
- Lambda mints installation token from webhook payload `installation.id`.
- Lambda injects token into ECS env as `GITHUB_TOKEN`.
- Worker command requires `GITHUB_TOKEN` and always tokenizes GitHub HTTPS clone URLs.
- Lambda role includes `ssm:GetParameter` and constrained `kms:Decrypt` for custom CMK-backed parameters.

## Migration

- PAT flow removed.
- `GITHUB_TOKEN`/`GH_TOKEN` PAT sources are not used for AWS deploy/runtime auth.

import { Dockerfile } from "@skipper/core/internal/docker";

export const dockerfile = new Dockerfile()
  .from("ubuntu:latest")
  .run("apt-get update")
  .run("apt-get install -y curl unzip jq git gh")
  .run("useradd -m -s /bin/bash appuser")
  .copy(["docker-entry.ts"], "/home/appuser/docker-entry.ts", { chmod: "755" })
  .user("appuser")
  .run("curl -fsSL https://claude.ai/install.sh | bash")
  .run("curl -fsSL https://bun.sh/install | bash")
  .env("PATH", "/home/appuser/.local/bin:${PATH}")
  .env("PATH", "/home/appuser/.bun/bin:${PATH}")
  .env({
    CLAUDE_CODE_USE_BEDROCK: "1",
    AWS_REGION: "eu-central-1",
    ANTHROPIC_MODEL: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    ANTHROPIC_SMALL_FAST_MODEL: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
  })
  .cmd(["bun", "run", "/home/appuser/docker-entry.ts"]);

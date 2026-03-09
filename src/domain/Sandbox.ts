import { Schema } from "effect";

export const TmuxWorkTreeSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-worktree"),
});

export type TmuxWorkTreeSandboxConfig = typeof TmuxWorkTreeSandboxConfig.Type;

export const DockerSandboxConfig = Schema.Struct({
  type: Schema.Literal("docker"),
  sandbox: Schema.Option(Schema.String),
});

export type DockerSandboxConfig = typeof DockerSandboxConfig.Type;

export const SandboxConfig = Schema.Union([
  TmuxWorkTreeSandboxConfig,
  DockerSandboxConfig,
]);

export type SandboxConfig = typeof SandboxConfig.Type;

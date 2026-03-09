import { Schema } from "effect";

export const TmuxWorkTreeSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-worktree"),
});

export type TmuxWorkTreeSandboxConfig = typeof TmuxWorkTreeSandboxConfig.Type;

export const TmuxMainSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-main"),
});

export type TmuxMainSandboxConfig = typeof TmuxMainSandboxConfig.Type;

export const DockerSandboxConfig = Schema.Struct({
  type: Schema.Literal("docker"),
  sandbox: Schema.Option(Schema.String),
});

export type DockerSandboxConfig = typeof DockerSandboxConfig.Type;

export const EcsSandboxConfig = Schema.Struct({
  type: Schema.Literal("ecs"),
});

export type EcsSandboxConfig = typeof EcsSandboxConfig.Type;

export const SandboxConfig = Schema.Union([
  TmuxWorkTreeSandboxConfig,
  TmuxMainSandboxConfig,
  DockerSandboxConfig,
  EcsSandboxConfig,
]);

export type SandboxConfig = typeof SandboxConfig.Type;

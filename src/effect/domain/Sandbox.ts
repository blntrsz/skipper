import { Schema } from "effect";
import { GitRepository } from "./Git";

export const TmuxWorkTreeSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-worktree"),
  git: GitRepository,
});

export type TmuxWorkTreeSandboxConfig = typeof TmuxWorkTreeSandboxConfig.Type;

export const TmuxMainSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-main"),
  git: GitRepository,
});

export type TmuxMainSandboxConfig = typeof TmuxMainSandboxConfig.Type;

export const DockerSandboxConfig = Schema.Struct({
  type: Schema.Literal("docker"),
  git: GitRepository,
});

export type DockerSandboxConfig = typeof DockerSandboxConfig.Type;

export const EcsSandboxConfig = Schema.Struct({
  type: Schema.Literal("ecs"),
  git: GitRepository,
});

export type EcsSandboxConfig = typeof EcsSandboxConfig.Type;

export const SandboxConfig = Schema.Union([
  TmuxWorkTreeSandboxConfig,
  TmuxMainSandboxConfig,
  DockerSandboxConfig,
  EcsSandboxConfig,
]);

export type SandboxConfig = typeof SandboxConfig.Type;

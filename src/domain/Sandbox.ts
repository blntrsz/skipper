import { Schema } from "effect";

export const TmuxWorkTreeSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-worktree"),
});

export type TmuxWorkTreeSandboxConfig = typeof TmuxWorkTreeSandboxConfig.Type;

export const SandboxConfig = TmuxWorkTreeSandboxConfig;

export type SandboxConfig = typeof SandboxConfig.Type;

import { Schema } from "effect";

export class SandboxError extends Schema.TaggedErrorClass<SandboxError>("skipper/SandboxError")(
  "SandboxError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const TmuxWorkTreeSandboxConfig = Schema.Struct({
  type: Schema.Literal("tmux-worktree"),
});

export type TmuxWorkTreeSandboxConfig = typeof TmuxWorkTreeSandboxConfig.Type;

export const SandboxConfig = TmuxWorkTreeSandboxConfig;

export type SandboxConfig = typeof SandboxConfig.Type;

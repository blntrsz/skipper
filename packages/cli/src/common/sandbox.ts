import { Workspace } from "@skippercorp/core";
import { workspaceLayerForSandbox } from "@skippercorp/core/runtime/local-work-tree.runtime";
import { Effect } from "effect";
import { Flag } from "effect/unstable/cli";

export const sandboxChoices = ["worktree", "docker"] as const;

export const sandboxFlag = Flag.choice("sandbox", sandboxChoices).pipe(
  Flag.withDefault("worktree"),
  Flag.withDescription("Sandbox backend"),
);

export const provideSandbox = <A, E, R>(
  sandbox: Workspace.SandboxKind,
  effect: Effect.Effect<A, E, R>,
) => effect.pipe(Effect.provide(workspaceLayerForSandbox(sandbox)));

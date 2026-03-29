import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

export const SandboxKind = Schema.Union([Schema.Literal("worktree"), Schema.Literal("docker")]);
export type SandboxKind = typeof SandboxKind.Type;

export const DEFAULT_SANDBOX_KIND: SandboxKind = "worktree";

export const resolveSandboxKind = (sandbox: SandboxKind | undefined): SandboxKind =>
  sandbox ?? DEFAULT_SANDBOX_KIND;

export class ProjectModel extends Model.Class<ProjectModel>("ProjectModel")({
  namespace: Schema.optional(Schema.String),
  name: Schema.String,
  branch: Schema.optional(Schema.String),
  sandbox: Schema.optional(SandboxKind),
}) {
  hasBranch(): this is ProjectModel & { branch: string } {
    return this.branch !== undefined;
  }

  isMain(): this is ProjectModel & { branch: undefined } {
    return this.branch === undefined;
  }

  sandboxKind(): SandboxKind {
    return resolveSandboxKind(this.sandbox);
  }
}

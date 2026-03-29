import { Layer, ManagedRuntime } from "effect";
import { WorkTreeFileSystemServiceLayer } from "../workspace/adapter/work-tree-filesystem.use-case";
import { WorkTreeSandboxServiceLayer } from "../workspace/adapter/work-tree-sandbox.service";
import { DockerSandboxServiceLayer } from "../workspace/adapter/docker-sandbox.service";
import { BunServices } from "@effect/platform-bun";
import { SqlTaskRepositoryLayer } from "../task/adapter/sql-task.repository";
import { SqlLayer } from "../common/sql";
import { SqlSessionRepositoryLayer } from "../session";
import { SqlSessionServiceLayer } from "../session/adapter/sql-session.service";
import { SqlTaskServiceLayer } from "../task";
import { TmuxServiceImpl } from "../common/tmux";
import { InteractiveCommandServiceLayer } from "../common/adapter/interactive-command.service";
import { SdkOpenCodeServiceLayer } from "../opencode";
import { DEFAULT_SANDBOX_KIND, type SandboxKind } from "../workspace/domain";

const platformLayer = Layer.mergeAll(BunServices.layer, SqlLayer);

const sandboxLayerForKind = (sandbox: SandboxKind) =>
  sandbox === "docker" ? DockerSandboxServiceLayer : WorkTreeSandboxServiceLayer;

export const workspaceLayerForSandbox = (sandbox: SandboxKind = DEFAULT_SANDBOX_KIND) =>
  Layer.mergeAll(WorkTreeFileSystemServiceLayer, sandboxLayerForKind(sandbox));

const sessionLayer = Layer.provide(SqlSessionServiceLayer, SqlSessionRepositoryLayer);

const taskLayer = Layer.provide(SqlTaskServiceLayer, SqlTaskRepositoryLayer);

export const localRuntimeBaseLayer = Layer.mergeAll(
  sessionLayer,
  taskLayer,
  SdkOpenCodeServiceLayer,
).pipe(
  Layer.provideMerge(TmuxServiceImpl.pipe(Layer.provideMerge(InteractiveCommandServiceLayer))),
  Layer.provideMerge(platformLayer),
);

export const localWorkTreeLayer = workspaceLayerForSandbox().pipe(
  Layer.provideMerge(localRuntimeBaseLayer),
);

export const localWorkTreeRuntime = ManagedRuntime.make(localWorkTreeLayer);

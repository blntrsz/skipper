import { Layer, ManagedRuntime } from "effect";
import { WorkTreeFileSystemServiceLayer } from "../workspace/adapter/work-tree-filesystem.use-case";
import { WorkTreeSandboxServiceLayer } from "../workspace/adapter/work-tree-sandbox.service";
import { WorkTreeWorkspaceRegistryServiceLayer } from "../workspace/adapter/work-tree-workspace-registry.service";
import { BunServices } from "@effect/platform-bun";
import { SqlTaskRepositoryLayer } from "../task/adapter/sql-task.repository";
import { SqlLayer } from "../common/sql";
import { SqlSessionRepositoryLayer } from "../session";
import { SqlSessionServiceLayer } from "../session/adapter/sql-session.service";
import { SqlTaskServiceLayer } from "../task";
import { TmuxServiceImpl } from "../common/tmux";
import { InteractiveCommandServiceLayer } from "../common/adapter/interactive-command.service";
import { SdkOpenCodeServiceLayer } from "../opencode";

const platformLayer = Layer.mergeAll(BunServices.layer, SqlLayer);

const workspaceLayer = Layer.mergeAll(
  WorkTreeFileSystemServiceLayer,
  WorkTreeSandboxServiceLayer,
  Layer.provide(WorkTreeWorkspaceRegistryServiceLayer, WorkTreeFileSystemServiceLayer),
);

const sessionLayer = Layer.provide(SqlSessionServiceLayer, SqlSessionRepositoryLayer);

const taskLayer = Layer.provide(SqlTaskServiceLayer, SqlTaskRepositoryLayer);

export const localWorkTreeLayer = Layer.mergeAll(
  workspaceLayer,
  sessionLayer,
  taskLayer,
  SdkOpenCodeServiceLayer,
).pipe(
  Layer.provideMerge(TmuxServiceImpl.pipe(Layer.provideMerge(InteractiveCommandServiceLayer))),
  Layer.provideMerge(platformLayer),
);

export const localWorkTreeRuntime = ManagedRuntime.make(localWorkTreeLayer);

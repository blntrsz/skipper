import { Layer, ManagedRuntime } from "effect";
import { WorkTreeFileSystemServiceLayer } from "../workspace/adapter/work-tree-filesystem.use-case";
import { WorkTreeSandboxServiceLayer } from "../workspace/adapter/work-tree-sandbox.service";
import { BunServices } from "@effect/platform-bun";
import { SqlTaskRepositoryLayer } from "../task/adapter/sql-task.repository";
import { SqlLayer } from "../common/sql";
import { SqlSessionRepositoryLayer } from "../session";
import { SqlSessionServiceLayer } from "../session/adapter/sql-session.service";
import { SqlTaskServiceLayer } from "../task";
import { TmuxServiceImpl } from "../common/tmux";

const platformLayer = Layer.mergeAll(BunServices.layer, SqlLayer);

const workspaceLayer = Layer.provideMerge(
  WorkTreeSandboxServiceLayer,
  WorkTreeFileSystemServiceLayer,
);

const sessionLayer = Layer.provide(SqlSessionServiceLayer, SqlSessionRepositoryLayer);

const taskLayer = Layer.provide(SqlTaskServiceLayer, SqlTaskRepositoryLayer);

export const localWorkTreeLayer = Layer.mergeAll(workspaceLayer, sessionLayer, taskLayer).pipe(
  Layer.provideMerge(TmuxServiceImpl),
  Layer.provideMerge(platformLayer),
);

export const localWorkTreeRuntime = ManagedRuntime.make(localWorkTreeLayer);

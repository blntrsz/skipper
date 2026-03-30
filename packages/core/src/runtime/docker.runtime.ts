import { Layer, ManagedRuntime } from "effect";
import { BunServices } from "@effect/platform-bun";
import { InteractiveCommandServiceLayer } from "../common/adapter/interactive-command.service";
import { SqlLayer } from "../common/sql";
import { TmuxServiceImpl } from "../common/tmux";
import { DockerOpenCodeServiceLayer } from "../opencode";
import { SqlSessionRepositoryLayer } from "../session";
import { SqlSessionServiceLayer } from "../session/adapter/sql-session.service";
import { SqlTaskServiceLayer } from "../task";
import { SqlTaskRepositoryLayer } from "../task/adapter/sql-task.repository";
import {
  DockerFileSystemServiceLayer,
  DockerSandboxServiceLayer,
  DockerWorkspaceRegistryServiceLayer,
} from "../workspace/adapter";

const platformLayer = Layer.mergeAll(BunServices.layer, SqlLayer);

const workspaceLayer = Layer.mergeAll(
  DockerFileSystemServiceLayer,
  DockerSandboxServiceLayer,
  DockerWorkspaceRegistryServiceLayer,
);

const sessionLayer = Layer.provide(SqlSessionServiceLayer, SqlSessionRepositoryLayer);

const taskLayer = Layer.provide(SqlTaskServiceLayer, SqlTaskRepositoryLayer);

export const dockerLayer = Layer.mergeAll(
  workspaceLayer,
  sessionLayer,
  taskLayer,
  DockerOpenCodeServiceLayer,
).pipe(
  Layer.provideMerge(TmuxServiceImpl.pipe(Layer.provideMerge(InteractiveCommandServiceLayer))),
  Layer.provideMerge(platformLayer),
);

export const dockerRuntime = ManagedRuntime.make(dockerLayer);

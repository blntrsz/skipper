import { Layer, ManagedRuntime } from "effect";
import { WorkTreeFileSystemServiceLayer } from "../workspace/adapter/work-tree-filesystem.use-case";
import { DockerSandboxServiceLayer } from "../workspace/adapter/docker-sandbox.service";
import { BunServices } from "@effect/platform-bun";
import { SqlTaskRepositoryLayer } from "../task/adapter/sql-task.repository";
import { SqlLayer } from "../common/sql";
import { SqlSessionRepositoryLayer } from "../session";
import { SqlSessionServiceLayer } from "../session/adapter/sql-session.service";
import { SqlTaskServiceLayer } from "../task";
import { InteractiveCommandServiceLayer } from "../common/adapter/interactive-command.service";
import { SdkOpenCodeServiceLayer } from "../opencode";
import { DockerServiceLayer } from "../common/docker";

const platformLayer = Layer.mergeAll(BunServices.layer, SqlLayer);

const dockerInfraLayer = DockerServiceLayer.pipe(
  Layer.provideMerge(InteractiveCommandServiceLayer),
);

const workspaceLayer = Layer.provideMerge(
  Layer.provide(DockerSandboxServiceLayer, dockerInfraLayer),
  WorkTreeFileSystemServiceLayer,
);

const sessionLayer = Layer.provide(SqlSessionServiceLayer, SqlSessionRepositoryLayer);

const taskLayer = Layer.provide(SqlTaskServiceLayer, SqlTaskRepositoryLayer);

export const dockerSandboxLayer = Layer.mergeAll(
  workspaceLayer,
  sessionLayer,
  taskLayer,
  SdkOpenCodeServiceLayer,
).pipe(Layer.provideMerge(platformLayer));

export const dockerSandboxRuntime = ManagedRuntime.make(dockerSandboxLayer);

import { Schema } from "effect";

export const DEFAULT_DOCKER_SANDBOX_CONTAINER_PATH = "/workspace";
export const DEFAULT_DOCKER_SANDBOX_COMMAND = ["sleep", "infinity"] as const;

export const DockerSandboxFile = Schema.Struct({
  containerPath: Schema.optional(Schema.String),
  command: Schema.optional(Schema.Array(Schema.String)),
});

export type DockerSandboxFile = typeof DockerSandboxFile.Type;

export const DockerSandboxDefinitionSource = Schema.Union([
  Schema.Literal("user"),
  Schema.Literal("repo"),
]);

export type DockerSandboxDefinitionSource =
  typeof DockerSandboxDefinitionSource.Type;

export const DockerSandboxDefinition = Schema.Struct({
  name: Schema.String,
  repository: Schema.String,
  source: DockerSandboxDefinitionSource,
  directory: Schema.String,
  dockerfilePath: Schema.String,
  containerPath: Schema.String,
  command: Schema.Array(Schema.String),
});

export type DockerSandboxDefinition = typeof DockerSandboxDefinition.Type;

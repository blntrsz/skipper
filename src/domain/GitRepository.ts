import { Schema } from "effect";

export const GitRepository = Schema.Struct({
  repository: Schema.String,
  branch: Schema.String,
});

export type GitRepository = typeof GitRepository.Type;

export const GitRepositoryOption = Schema.Struct({
  repository: Schema.Option(Schema.String),
  branch: Schema.Option(Schema.String),
});

export type GitRepositoryOption = typeof GitRepositoryOption.Type;

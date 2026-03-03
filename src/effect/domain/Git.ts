import { Schema } from "effect";

export const GitRepository = Schema.Struct({
  repository: Schema.String,
  branch: Schema.String,
});

export type GitRepository = typeof GitRepository.Type;

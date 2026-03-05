import { Schema } from "effect";

export const GlobalConfig = Schema.Struct({
  command: Schema.optional(Schema.String),
});

export type GlobalConfig = typeof GlobalConfig.Type;

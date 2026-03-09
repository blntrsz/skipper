import { Schema } from "effect";

export const ServiceErrorFields = {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
};

export const getErrorMessage = (cause: unknown, fallback: string) => {
  if (typeof cause === "string" && cause.trim().length > 0) {
    return cause;
  }

  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message;
  }

  return fallback;
};

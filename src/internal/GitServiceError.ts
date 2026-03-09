import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class GitServiceError extends Schema.TaggedErrorClass<GitServiceError>(
  "skipper/GitServiceError"
)("GitServiceError", ServiceErrorFields) {}

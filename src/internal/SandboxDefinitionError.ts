import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class SandboxDefinitionError extends Schema.TaggedErrorClass<SandboxDefinitionError>(
  "skipper/SandboxDefinitionError"
)("SandboxDefinitionError", ServiceErrorFields) {}

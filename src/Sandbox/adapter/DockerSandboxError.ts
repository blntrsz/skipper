import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class DockerSandboxError extends Schema.TaggedErrorClass<DockerSandboxError>(
  "skipper/DockerSandboxError"
)("DockerSandboxError", ServiceErrorFields) {}

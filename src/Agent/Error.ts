import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class AgentServiceError extends Schema.TaggedErrorClass<AgentServiceError>(
  "skipper/AgentServiceError"
)("AgentServiceError", ServiceErrorFields) {}

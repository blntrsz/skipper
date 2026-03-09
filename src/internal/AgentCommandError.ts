import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class AgentCommandError extends Schema.TaggedErrorClass<AgentCommandError>(
  "skipper/AgentCommandError"
)("AgentCommandError", ServiceErrorFields) {}

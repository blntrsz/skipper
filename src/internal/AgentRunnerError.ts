import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class AgentRunnerError extends Schema.TaggedErrorClass<AgentRunnerError>(
  "skipper/AgentRunnerError"
)("AgentRunnerError", ServiceErrorFields) {}

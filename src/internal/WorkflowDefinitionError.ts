import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class WorkflowDefinitionError extends Schema.TaggedErrorClass<WorkflowDefinitionError>(
  "skipper/WorkflowDefinitionError"
)("WorkflowDefinitionError", ServiceErrorFields) {}

import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class WorkflowServiceError extends Schema.TaggedErrorClass<WorkflowServiceError>(
  "skipper/WorkflowServiceError"
)("WorkflowServiceError", ServiceErrorFields) {}

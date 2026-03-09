import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class InteractivePickerError extends Schema.TaggedErrorClass<InteractivePickerError>(
  "skipper/InteractivePickerError"
)("InteractivePickerError", ServiceErrorFields) {}

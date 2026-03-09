import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class SwitchError extends Schema.TaggedErrorClass<SwitchError>("skipper/SwitchError")(
  "SwitchError",
  ServiceErrorFields
) {}

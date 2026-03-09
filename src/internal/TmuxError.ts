import { Schema } from "effect";
import { ServiceErrorFields } from "@/internal/ServiceError";

export class TmuxError extends Schema.TaggedErrorClass<TmuxError>("skipper/TmuxError")(
  "TmuxError",
  ServiceErrorFields
) {}

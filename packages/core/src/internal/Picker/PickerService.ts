import { type Effect, Schema, ServiceMap } from "effect";

export class PickerError extends Schema.TaggedErrorClass<PickerError>(
  "skipper/PickerError",
)("PickerError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class PickerCancelled extends Schema.TaggedErrorClass<PickerCancelled>(
  "skipper/PickerCancelled",
)("PickerCancelled", {}) {}

export class PickerNoMatch extends Schema.TaggedErrorClass<PickerNoMatch>(
  "skipper/PickerNoMatch",
)("PickerNoMatch", { query: Schema.String }) {}

export interface PickerService {
  pick: ({
    options,
    message,
  }: {
    options: string[];
    message: string;
  }) => Effect.Effect<
    string,
    PickerError | PickerCancelled | PickerNoMatch,
    never
  >;
}

export const PickerService = ServiceMap.Service<PickerService>("PickerService");

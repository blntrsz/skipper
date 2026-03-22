import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

export class ProjectModel extends Model.Class<ProjectModel>("ProjectModel")({
  namespace: Schema.optional(Schema.String),
  name: Schema.String,
  branch: Schema.optional(Schema.String),
}) {
  hasBranch(): this is ProjectModel & { branch: string } {
    return this.branch !== undefined;
  }

  isMain(): this is ProjectModel & { branch: undefined } {
    return this.branch === undefined;
  }
}

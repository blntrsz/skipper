import { Flag } from "effect/unstable/cli";
import { TaskId } from "@skippercorp/core/task/domain";

const taskStateChoices = ["stale", "working", "asking-question", "done"] as const;

export const flags = {
  id: Flag.string("id").pipe(Flag.withSchema(TaskId), Flag.withDescription("Task id")),
  description: Flag.string("description").pipe(Flag.withDescription("Task description")),
  repository: Flag.string("repository").pipe(Flag.withDescription("Repository name")),
  branch: Flag.string("branch").pipe(Flag.withDescription("Branch name")),
  state: Flag.choice("state", taskStateChoices).pipe(Flag.withDescription("Task state")),
};

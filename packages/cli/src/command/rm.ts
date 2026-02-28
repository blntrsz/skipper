import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

export const createRm = Command.make("rm", {}, () =>
  Effect.gen(function* () {
    console.log("rm");
  }),
);

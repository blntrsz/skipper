import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

export const createNew = Command.make("new", {}, () =>
  Effect.gen(function* () {
    console.log("init");
  }),
);

import { Effect } from "effect";
import { TestConsole } from "effect/testing";

export const getStdOut = <A = unknown>(): Effect.Effect<A, Error, never> =>
  Effect.flatMap(TestConsole.logLines, (output) => {
    const json = output[output.length - 1];
    if (json === undefined) {
      return Effect.fail(new Error("Expected TaskCli output"));
    }

    return Effect.sync(() => JSON.parse(String(json)) as A);
  });

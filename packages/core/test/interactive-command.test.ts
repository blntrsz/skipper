/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  InteractiveCommandService,
  InteractiveCommandServiceLayer,
} from "../src/common/adapter/interactive-command.service";

describe("InteractiveCommandService", () => {
  it.effect("spawns detached command and unrefs it", () =>
    Effect.gen(function* () {
      const service = yield* InteractiveCommandService;
      const originalSpawn = Bun.spawn;
      const calls: Array<unknown> = [];
      let unrefCalled = false;

      try {
        (Bun as { spawn: typeof Bun.spawn }).spawn = ((options: unknown) => {
          calls.push(options);
          return {
            unref: () => {
              unrefCalled = true;
            },
          } as ReturnType<typeof Bun.spawn>;
        }) as typeof Bun.spawn;

        yield* service.run("tmux", ["attach-session", "-t", "skipper-main"]);
      } finally {
        (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
      }

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        cmd: ["tmux", "attach-session", "-t", "skipper-main"],
        detached: true,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      expect(unrefCalled).toBe(true);
    }).pipe(Effect.provide(InteractiveCommandServiceLayer)),
  );

  it.effect("maps spawn failures", () =>
    Effect.gen(function* () {
      const service = yield* InteractiveCommandService;
      const originalSpawn = Bun.spawn;

      try {
        (Bun as { spawn: typeof Bun.spawn }).spawn = (() => {
          throw new Error("boom");
        }) as typeof Bun.spawn;

        const error = yield* service
          .run("tmux", ["attach-session", "-t", "skipper-main"])
          .pipe(Effect.flip);

        expect(error.message).toBe("boom");
      } finally {
        (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
      }
    }).pipe(Effect.provide(InteractiveCommandServiceLayer)),
  );
});

import { AgentService, type Environment } from "@skipper/core/Agent/Service";
import { DockerService } from "@skipper/core/internal/docker";
import { Effect, Layer, ServiceMap } from "effect";
import { dockerfile } from "./Dockerfile";

const IMAGE_TAG = "skipper-claude-code";

const dockerLayer = Layer.effect(DockerService, DockerService.make);

export const DockerClaudeCodeService = ServiceMap.make(AgentService, {
  deployAgent: Effect.gen(function* () {
    const docker = yield* DockerService;
    const stream = yield* docker.build(
      {
        context: import.meta.dir,
        src: ["docker-entry.ts"],
      },
      {
        dockerfile: dockerfile.toString(),
        t: IMAGE_TAG,
      },
    );
    yield* Effect.tryPromise(
      () =>
        new Promise<void>((resolve, reject) => {
          (stream as NodeJS.ReadableStream).on("data", () => {});
          (stream as NodeJS.ReadableStream).on("end", resolve);
          (stream as NodeJS.ReadableStream).on("error", reject);
        }),
    );
  }).pipe(Effect.orDie, Effect.provide(dockerLayer)),
  runAgent: (prompt: string, environment: Environment) =>
    Effect.gen(function* () {
      const docker = yield* DockerService;
      yield* docker.run(IMAGE_TAG, {
        env: {
          GITHUB_USERNAME: environment.username,
          GITHUB_REPOSITORY: environment.repository,
          PROMPT: prompt,
        },
      });
    }).pipe(Effect.orDie, Effect.provide(dockerLayer)),
});

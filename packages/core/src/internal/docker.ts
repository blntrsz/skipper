import { Effect, ServiceMap } from "effect";
import Docker from "dockerode";

export class DockerService extends ServiceMap.Service<DockerService>()(
  "DockerService",
  {
    make: Effect.gen(function* () {
      const docker = new Docker();

      const build = Effect.fn(function* (
        file: string | NodeJS.ReadableStream | Docker.ImageBuildContext,
        options: Docker.ImageBuildOptions,
      ) {
        return yield* Effect.tryPromise(() => docker.buildImage(file, options));
      });

      const run = Effect.fn(function* (
        image: string,
        options?: { env?: Record<string, string> },
      ) {
        const Env = options?.env
          ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
          : undefined;
        const container = yield* Effect.tryPromise(() =>
          docker.createContainer({ Image: image, Env }),
        );
        yield* Effect.tryPromise(() => container.start());
        yield* Effect.tryPromise(() => container.wait());
      });

      return { build, run };
    }),
  },
) {}

type FromOptions = { as?: string; platform?: string };

export class Dockerfile {
  private instructions: string[] = [];

  from(image: string, options?: FromOptions): this {
    const parts = ["FROM"];
    if (options?.platform) parts.push(`--platform=${options.platform}`);
    parts.push(image);
    if (options?.as) parts.push("AS", options.as);
    this.instructions.push(parts.join(" "));
    return this;
  }

  workdir(path: string): this {
    this.instructions.push(`WORKDIR ${path}`);
    return this;
  }

  copy(sources: string[], dest: string, options?: { from?: string; chmod?: string }): this {
    const parts = ["COPY"];
    if (options?.from) parts.push(`--from=${options.from}`);
    if (options?.chmod) parts.push(`--chmod=${options.chmod}`);
    parts.push(...sources, dest);
    this.instructions.push(parts.join(" "));
    return this;
  }

  run(command: string | string[]): this {
    if (Array.isArray(command)) {
      this.instructions.push(`RUN ${JSON.stringify(command)}`);
    } else {
      this.instructions.push(`RUN ${command}`);
    }
    return this;
  }

  cmd(command: string[]): this {
    this.instructions.push(`CMD ${JSON.stringify(command)}`);
    return this;
  }

  entrypoint(command: string[]): this {
    this.instructions.push(`ENTRYPOINT ${JSON.stringify(command)}`);
    return this;
  }

  expose(port: number | string): this {
    this.instructions.push(`EXPOSE ${port}`);
    return this;
  }

  env(key: string, value: string): this;
  env(vars: Record<string, string>): this;
  env(keyOrVars: string | Record<string, string>, value?: string): this {
    if (typeof keyOrVars === "string") {
      this.instructions.push(`ENV ${keyOrVars}=${JSON.stringify(value)}`);
    } else {
      const pairs = Object.entries(keyOrVars)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" \\\n    ");
      this.instructions.push(`ENV ${pairs}`);
    }
    return this;
  }

  arg(name: string, defaultValue?: string): this {
    this.instructions.push(
      defaultValue !== undefined ? `ARG ${name}=${defaultValue}` : `ARG ${name}`,
    );
    return this;
  }

  add(sources: string[], dest: string): this {
    this.instructions.push(`ADD ${[...sources, dest].join(" ")}`);
    return this;
  }

  label(key: string, value: string): this;
  label(labels: Record<string, string>): this;
  label(keyOrLabels: string | Record<string, string>, value?: string): this {
    if (typeof keyOrLabels === "string") {
      this.instructions.push(`LABEL ${keyOrLabels}=${JSON.stringify(value)}`);
    } else {
      const pairs = Object.entries(keyOrLabels)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" \\\n      ");
      this.instructions.push(`LABEL ${pairs}`);
    }
    return this;
  }

  user(user: string): this {
    this.instructions.push(`USER ${user}`);
    return this;
  }

  volume(paths: string[]): this {
    this.instructions.push(`VOLUME ${JSON.stringify(paths)}`);
    return this;
  }

  toString(): string {
    return this.instructions.join("\n");
  }
}

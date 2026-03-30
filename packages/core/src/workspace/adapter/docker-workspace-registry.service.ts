import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { dockerWorkspaceEntry, dockerWorkspaceHandle } from "./docker-workspace.shared";
import {
  WorkspaceRegistryError,
  WorkspaceRegistryService,
} from "../port/workspace-registry.service";

const DOCKER_FILTER_PREFIX = "label=skipper.backend=docker";

const parseLines = (output: string) =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const DockerWorkspaceRegistryServiceLayer = Layer.effect(
  WorkspaceRegistryService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;

    const runCommand = Effect.fn("DockerWorkspaceRegistry.runCommand")((command: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawn(
            ChildProcess.make({
              shell: false,
            })`sh -lc ${command}`,
          );

          const stdout = yield* handle.stdout.pipe(Stream.decodeText, Stream.mkString);
          const stderr = yield* handle.stderr.pipe(Stream.decodeText, Stream.mkString);
          const exitCode = yield* handle.exitCode;

          if (exitCode !== 0) {
            return yield* Effect.fail(
              new WorkspaceRegistryError({
                message: stderr || "Failed to list Docker workspaces",
              }),
            );
          }

          return stdout;
        }),
      ),
    );

    const dockerList = Effect.fn("DockerWorkspaceRegistry.dockerList")(function* (
      ...filters: ReadonlyArray<string>
    ) {
      const stdout = yield* runCommand(
        `docker ps -a --filter ${DOCKER_FILTER_PREFIX} ${filters.join(" ")} --format '{{.Label "skipper.repository"}}\t{{.Label "skipper.branch"}}\t{{.Label "skipper.workspace"}}'`,
      );

      return parseLines(stdout);
    });

    const resolve = Effect.fn("DockerWorkspaceRegistry.resolve")((project) =>
      Effect.succeed(dockerWorkspaceHandle(project)),
    );

    const listMainProjects = Effect.fn("DockerWorkspaceRegistry.listMainProjects")(function* () {
      const lines = yield* dockerList(`--filter label=skipper.workspace=main`);

      return [
        ...new Set(
          lines.flatMap((line) => {
            const [repository] = line.split("\t");
            return repository && repository.length > 0 ? [repository] : [];
          }),
        ),
      ];
    });

    const listBranchProjects = Effect.fn("DockerWorkspaceRegistry.listBranchProjects")(function* (
      repository: string,
    ) {
      const lines = yield* dockerList(
        `--filter label=skipper.repository=${repository}`,
        `--filter label=skipper.workspace=branch`,
      );

      return lines.flatMap((line) => {
        const [repo, branch] = line.split("\t");
        return repo && branch ? [dockerWorkspaceEntry(repo, branch)] : [];
      });
    });

    return {
      resolve,
      listMainProjects,
      listBranchProjects,
    };
  }),
);

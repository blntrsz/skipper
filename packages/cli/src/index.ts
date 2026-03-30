import packageJson from "../package.json";
import { Effect } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import { localWorkTreeLayer } from "@skippercorp/core/runtime/local-work-tree.runtime";
import { dockerSandboxLayer } from "@skippercorp/core/runtime/docker.runtime";
import { Command } from "effect/unstable/cli";
import { rootCommand } from "./command.ts";
import { getSandboxBackendFromArgv } from "./common/global-flags.ts";

const runtimeLayer =
  getSandboxBackendFromArgv() === "docker" ? dockerSandboxLayer : localWorkTreeLayer;

Command.run(rootCommand, {
  version: packageJson.version,
}).pipe(
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(runtimeLayer),
  Effect.scoped,
  Effect.catchTag("ShowHelp", () => Effect.void),
  BunRuntime.runMain,
);

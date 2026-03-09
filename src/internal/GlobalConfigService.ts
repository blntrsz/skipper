import { Effect, FileSystem, PlatformError, ServiceMap } from "effect";
import { dirname } from "node:path";
import { GlobalConfig } from "../domain/GlobalConfig";
import { globalConfigPath } from "./SkipperPaths";

export const GLOBAL_CONFIG_PATH = globalConfigPath();

const parseConfig = (content: string): GlobalConfig => {
  try {
    const parsed = JSON.parse(content);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return GlobalConfig.makeUnsafe(parsed);
    }

    return GlobalConfig.makeUnsafe({});
  } catch {
    return GlobalConfig.makeUnsafe({});
  }
};

const readConfigObject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(GLOBAL_CONFIG_PATH);

  if (!exists) {
    return GlobalConfig.makeUnsafe({});
  }

  const content = yield* fs.readFileString(GLOBAL_CONFIG_PATH);
  return parseConfig(content);
});

export const GlobalConfigService = ServiceMap.Service<{
  getCommand: () =>
    Effect.Effect<string | undefined, PlatformError.PlatformError, FileSystem.FileSystem>;
  setCommand: (
    command: string
  ) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem>;
}>("GlobalConfigService");

export const GlobalConfigServiceImpl = ServiceMap.make(GlobalConfigService, {
  getCommand: () =>
    Effect.gen(function* () {
      const config = yield* readConfigObject;
      return typeof config.command === "string"
        ? config.command
        : undefined;
    }),
  setCommand: (command: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const config = yield* readConfigObject;
      const nextConfig = {
        ...config,
        command,
      };

      yield* fs.makeDirectory(dirname(GLOBAL_CONFIG_PATH), { recursive: true });
      yield* fs.writeFileString(
        GLOBAL_CONFIG_PATH,
        `${JSON.stringify(nextConfig, null, 2)}\n`
      );
    }),
});

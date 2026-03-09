import { describe, expect, test } from "bun:test";
import { getCreateCommands, getIdentity } from "./DockerSandboxService";

describe("DockerSandboxService", () => {
  test("builds repo image and repo+branch container names", () => {
    const identity = getIdentity(
      { repository: "demo", branch: "feature/test" },
      {
        name: "dev",
        repository: "demo",
        source: "repo",
        directory: "/tmp/dev",
        dockerfilePath: "/tmp/dev/Dockerfile",
        containerPath: "/workspace",
        command: ["sleep", "infinity"],
      }
    );

    expect(identity).toEqual({
      imageName: "skipper-demo:dev",
      containerName: "skipper-demo-feature-test-dev",
    });
  });

  test("builds docker commands in expected order", () => {
    const commands = getCreateCommands(
      { repository: "demo", branch: "feature" },
      {
        name: "dev",
        repository: "demo",
        source: "user",
        directory: "/tmp/dev",
        dockerfilePath: "/tmp/dev/Dockerfile",
        containerPath: "/container/path",
        command: ["sleep", "infinity"],
      },
      "/tmp/source"
    );

    expect(commands).toEqual([
      ["build", "-t", "skipper-demo:dev", "/tmp/dev"],
      [
        "run",
        "-d",
        "--name",
        "skipper-demo-feature-dev",
        "skipper-demo:dev",
        "sleep",
        "infinity",
      ],
      ["exec", "skipper-demo-feature-dev", "mkdir", "-p", "/container/path"],
      ["cp", "/tmp/source/.", "skipper-demo-feature-dev:/container/path"],
    ]);
  });
});

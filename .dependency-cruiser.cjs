const corePrefix = "^(?:packages/core/)?src(?:/|$)";
const domainPath = "^(?:packages/core/)?src/domain(?:/|$)";
const internalPath = "^(?:packages/core/)?src/internal(?:/|$)";
const migrationsPath = "^(?:packages/core/)?src/migrations(?:/|$)";
const verticalSlicePath =
  "^(?:packages/core/)?src/(?!domain(?:/|$)|internal(?:/|$)|migrations(?:/|$))[^/]+/";
const sessionSlicePath = "^(?:packages/core/)?src/Session(?:/|$)";
const taskSlicePath = "^(?:packages/core/)?src/Task(?:/|$)";
const sandboxSlicePath = "^(?:packages/core/)?src/Sandbox(?:/|$)";
const cliPath = "^packages/cli/src(?:/|$)";

module.exports = {
  forbidden: [
    {
      name: "domain-cant-depend-on-internal",
      severity: "error",
      from: { path: domainPath },
      to: { path: internalPath },
    },
    {
      name: "domain-cant-depend-on-vertical-slices",
      severity: "error",
      from: { path: domainPath },
      to: { path: verticalSlicePath },
    },
    {
      name: "internal-cant-depend-on-vertical-slices",
      severity: "error",
      from: { path: internalPath },
      to: { path: verticalSlicePath },
    },
    {
      name: "vertical-slices-cant-depend-on-cli",
      severity: "error",
      from: { path: verticalSlicePath },
      to: { path: cliPath },
    },
    {
      name: "core-cant-depend-on-cli",
      severity: "error",
      from: { path: corePrefix },
      to: { path: cliPath },
    },
    {
      name: "only-internal-can-import-migrations",
      severity: "error",
      from: {
        path: `^(?!(?:${internalPath.slice(1)})|(?:${migrationsPath.slice(1)})).+`,
      },
      to: { path: migrationsPath },
    },
    {
      name: "session-cant-depend-on-other-slices",
      severity: "error",
      from: { path: sessionSlicePath },
      to: { path: `(?:${taskSlicePath})|(?:${sandboxSlicePath})` },
    },
    {
      name: "task-cant-depend-on-other-slices",
      severity: "error",
      from: { path: taskSlicePath },
      to: { path: `(?:${sessionSlicePath})|(?:${sandboxSlicePath})` },
    },
    {
      name: "sandbox-cant-depend-on-other-slices",
      severity: "error",
      from: { path: sandboxSlicePath },
      to: { path: `(?:${sessionSlicePath})|(?:${taskSlicePath})` },
    },
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};

const corePath = "^packages/core/src(?:/|$)";
const domainPath = "^packages/core/src/domain(?:/|$)";
const internalPath = "^packages/core/src/internal(?:/|$)";
const verticalSlicePath =
  "^packages/core/src/(?!domain(?:/|$)|internal(?:/|$)|migrations(?:/|$))[^/]+/";
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
      from: { path: corePath },
      to: { path: cliPath },
    },
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};

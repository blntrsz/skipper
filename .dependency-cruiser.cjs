const domainPath = "^src/domain(?:/|$)";
const internalPath = "^src/internal(?:/|$)";
const verticalSlicePath =
  "^src/(?!domain(?:/|$)|internal(?:/|$)|migrations(?:/|$))[^/]+/";
const cliPath = "^src/Cli\\.ts$";

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
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};

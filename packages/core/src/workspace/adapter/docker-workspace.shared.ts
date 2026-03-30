import type { ProjectModel } from "../domain/project.model";
import type { WorkspaceHandle } from "../port/workspace-registry.service";

export const DOCKER_SANDBOX_IMAGE = "skipper-sandbox:latest";
export const DOCKER_SANDBOX_PORT = 4096;
export const DOCKER_SANDBOX_WORKDIR = "/workspace";

const sanitizeNamePart = (value: string) => {
  const sanitized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "workspace";
};

const resolveBranchLabel = (project: ProjectModel) => project.branch ?? "main";

export const dockerContainerName = (project: ProjectModel) =>
  `skipper-${sanitizeNamePart(project.name)}-${sanitizeNamePart(resolveBranchLabel(project))}`;

export const dockerWorkspaceCwd = (project: ProjectModel) =>
  `${DOCKER_SANDBOX_WORKDIR}/${project.name}`;

export const dockerWorkspaceHandle = (project: ProjectModel): WorkspaceHandle => ({
  project,
  cwd: dockerWorkspaceCwd(project),
  sandbox: "docker",
  containerName: dockerContainerName(project),
});

export const dockerWorkspaceEntry = (repository: string, branch: string) =>
  `${repository}.${branch}`;

export const dockerWorkspaceLabels = (project: ProjectModel) => ({
  "skipper.backend": "docker",
  "skipper.repository": project.name,
  "skipper.branch": resolveBranchLabel(project),
  "skipper.workspace": project.isMain() ? "main" : "branch",
});

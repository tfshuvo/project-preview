import { readRepoMetadata } from "./repo-storage";

export const DEPLOYMENT_DOMAIN_SUFFIX = "daytona.local";

export type DeploymentUiStatus = {
  state: "idle" | "deploying" | "live" | "failed";
  domain: string | null;
  url: string | null;
  commitSha: string | null;
  deploymentId: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type DeploymentTimelineEntry = {
  commitSha: string;
  commitMessage: string;
  commitDate: string;
  domain: string;
  url: string;
  deploymentId: string | null;
  state: "idle" | "deploying" | "live" | "failed";
};

export const getDomainForCommit = (commitSha: string) => {
  return `${commitSha.slice(0, 12)}-${DEPLOYMENT_DOMAIN_SUFFIX}`;
};

export const getDeploymentStatusForLatestCommit = async (
  repoId: string,
  isAgentRunning: boolean,
): Promise<DeploymentUiStatus> => {
  const metadata = await readRepoMetadata(repoId);
  const updatedAt = new Date().toISOString();

  if (!metadata || metadata.deployments.length === 0) {
    return {
      state: "idle",
      domain: null,
      url: null,
      commitSha: null,
      deploymentId: null,
      lastError: "No deployments found for repository.",
      updatedAt,
    };
  }

  // The latest deployment should be the first one in the array, based on addRepoDeployment logic
  const latestDeployment = metadata.deployments[0];

  return {
    state: latestDeployment.state,
    domain: latestDeployment.domain,
    url: latestDeployment.url,
    commitSha: latestDeployment.commitSha,
    deploymentId: latestDeployment.deploymentId,
    lastError: latestDeployment.state === "failed" ? "Deployment reported failed state." : null,
    updatedAt,
  };
};

export const getDeploymentTimelineFromCommits = async (
  repoId: string,
  limit = 12,
): Promise<DeploymentTimelineEntry[]> => {
  const metadata = await readRepoMetadata(repoId);

  if (!metadata || !metadata.deployments) {
    return [];
  }

  return metadata.deployments.slice(0, limit).map(d => ({
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    commitDate: d.commitDate,
    domain: d.domain,
    url: d.url,
    deploymentId: d.deploymentId,
    state: d.state,
  }));
};

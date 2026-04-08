import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createVmForRepo } from "@/lib/adorable-vm";
import { getOrCreateIdentitySession } from "@/lib/identity-session";
import {
  ADORABLE_WRAPPER_REPO_PREFIX,
  type RepoMetadata,
  type RepoDeploymentSummary,
  createConversationInRepo,
  readRepoMetadata,
  writeRepoMetadata,
  listIdentityRepos
} from "@/lib/repo-storage";

// No more serverless deployments to reconcile locally, so we just pass through deployments
const toRepoResponse = async (
  repo: any,
) => {
  return {
    id: repo.id,
    name: repo.name || "Untitled Repo",
    metadata: repo.metadata,
  };
};

export async function GET() {
  const { identityId } = await getOrCreateIdentitySession();
  
  const repos = await listIdentityRepos(identityId);
  const items = await Promise.all(repos.map(toRepoResponse));

  return NextResponse.json({
    identityId,
    repositories: items,
  });
}

export async function POST(req: Request) {
  const { identityId } = await getOrCreateIdentitySession();

  let requestedName: string | undefined;
  let requestedConversationTitle: string | undefined;
  let githubRepoName: string | undefined;
  try {
    const payload = (await req.json()) as {
      name?: string;
      conversationTitle?: string;
      githubRepoName?: string;
    };
    const nextName = payload?.name?.trim();
    const nextConversationTitle = payload?.conversationTitle?.trim();
    const nextGithubRepoName = payload?.githubRepoName?.trim();
    requestedName = nextName ? nextName : undefined;
    requestedConversationTitle = nextConversationTitle
      ? nextConversationTitle
      : undefined;
    githubRepoName = nextGithubRepoName ? nextGithubRepoName : undefined;
  } catch {
    requestedName = undefined;
    requestedConversationTitle = undefined;
    githubRepoName = undefined;
  }

  const inferredName =
    requestedName ?? githubRepoName?.split("/").pop()?.trim() ?? "Project";
  
  // Create VM through Daytona
  const sourceCloneUrl = githubRepoName 
    ? `https://github.com/${githubRepoName}.git` 
    : undefined;
    
  const vm = await createVmForRepo(sourceCloneUrl);
  
  const sourceRepoId = vm.vmId; // use vmId as fake sourceRepoId 
  const wrapperRepoId = `${ADORABLE_WRAPPER_REPO_PREFIX}${inferredName}-${randomUUID().slice(0, 8)}`;

  const initialMetadata: RepoMetadata = {
    version: 2,
    sourceRepoId,
    ...(requestedName ? { name: requestedName } : { name: inferredName }),
    vm,
    conversations: [],
    deployments: [],
    productionDomain: null,
    productionDeploymentId: null,
  };

  await writeRepoMetadata(wrapperRepoId, initialMetadata, identityId);

  const conversationId = randomUUID();
  const metadata = await createConversationInRepo(
    wrapperRepoId,
    initialMetadata,
    conversationId,
    requestedConversationTitle,
  );

  return NextResponse.json({
    id: wrapperRepoId,
    metadata,
    conversationId,
  });
}

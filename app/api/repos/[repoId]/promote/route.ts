import { NextResponse } from "next/server";
import { getOrCreateIdentitySession } from "@/lib/identity-session";
import {
  promoteRepoDeploymentToProduction,
  readRepoMetadata,
  listIdentityRepos
} from "@/lib/repo-storage";

const assertRepoAccess = async (identityId: string, repoId: string) => {
  const repositories = await listIdentityRepos(identityId);
  return repositories.some((repo) => repo.id === repoId);
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;
  const { identityId } = await getOrCreateIdentitySession();

  if (!(await assertRepoAccess(identityId, repoId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let deploymentId = "";
  try {
    const payload = (await req.json()) as { deploymentId?: string };
    deploymentId = payload?.deploymentId?.trim() ?? "";
  } catch {
    deploymentId = "";
  }

  if (!deploymentId) {
    return NextResponse.json(
      { error: "deploymentId is required" },
      { status: 400 },
    );
  }

  const metadata = await readRepoMetadata(repoId);
  if (!metadata) {
    return NextResponse.json(
      { error: "Repository metadata not found" },
      { status: 404 },
    );
  }

  if (!metadata.productionDomain) {
    return NextResponse.json(
      { error: "Configure a production domain first" },
      { status: 400 },
    );
  }

  // With Daytona + MongoDB local environment, domains are handled
  // via local proxy setups (e.g., Caddy or Nginx router). We record the promotion
  // in MongoDB. The local infrastructure can react to it.
  const nextMetadata = await promoteRepoDeploymentToProduction(
    repoId,
    metadata,
    deploymentId,
  );

  return NextResponse.json({
    productionDomain: nextMetadata.productionDomain,
    productionDeploymentId: nextMetadata.productionDeploymentId,
  });
}

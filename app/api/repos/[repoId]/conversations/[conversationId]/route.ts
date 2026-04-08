import { NextResponse } from "next/server";
import { getOrCreateIdentitySession } from "@/lib/identity-session";
import { readConversationMessages, listIdentityRepos } from "@/lib/repo-storage";

const assertRepoAccess = async (identityId: string, repoId: string) => {
  const repositories = await listIdentityRepos(identityId);
  return repositories.some((repo: any) => repo.id === repoId);
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repoId: string; conversationId: string }> },
) {
  const { repoId, conversationId } = await params;
  const { identityId } = await getOrCreateIdentitySession();

  if (!(await assertRepoAccess(identityId, repoId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await readConversationMessages(repoId, conversationId);
  return NextResponse.json({ messages });
}

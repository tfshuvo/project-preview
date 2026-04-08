import { Assistant } from "../../assistant";
import { RepoWelcome } from "@/components/assistant-ui/repo-welcome";
import { getOrCreateIdentitySession } from "@/lib/identity-session";
import { readConversationMessages, listIdentityRepos } from "@/lib/repo-storage";

const hasRepoAccess = async (identityId: string, repoId: string) => {
  const repositories = await listIdentityRepos(identityId);
  return repositories.some((repo: any) => repo.id === repoId);
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ repoId: string; conversationId: string }>;
}) {
  const { repoId, conversationId } = await params;
  const { identityId } = await getOrCreateIdentitySession();

  if (!(await hasRepoAccess(identityId, repoId))) {
    return (
      <Assistant
        initialMessages={[]}
        selectedRepoId={repoId}
        selectedConversationId={conversationId}
        welcome={<RepoWelcome />}
      />
    );
  }

  const initialMessages = await readConversationMessages(
    repoId,
    conversationId,
  );
  return (
    <Assistant
      initialMessages={initialMessages}
      selectedRepoId={repoId}
      selectedConversationId={conversationId}
      welcome={<RepoWelcome />}
    />
  );
}

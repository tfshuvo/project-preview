import { type UIMessage } from "ai";
import connectToDatabase from "./db";
import { 
  RepoMetadataModel, 
  ConversationMessageModel,
  IRepoMetadata,
  IRepoConversationSummary,
  IRepoDeploymentSummary,
  IRepoVmMetadata
} from "./models/repo";

export const ADORABLE_WRAPPER_REPO_PREFIX = "adorable-meta - ";

export type RepoVmMetadata = IRepoVmMetadata;
export type RepoConversationSummary = IRepoConversationSummary;
export type RepoDeploymentSummary = IRepoDeploymentSummary;

export type RepoMetadata = {
  version: 2;
  sourceRepoId: string;
  name?: string;
  vm: RepoVmMetadata;
  conversations: RepoConversationSummary[];
  deployments: RepoDeploymentSummary[];
  productionDomain: string | null;
  productionDeploymentId: string | null;
};

const mapToMetadata = (doc: IRepoMetadata): RepoMetadata => {
  return {
    version: 2,
    sourceRepoId: doc.sourceRepoId,
    name: doc.name,
    vm: { 
      vmId: doc.vm.vmId,
      previewUrl: doc.vm.previewUrl,
      devCommandTerminalUrl: doc.vm.devCommandTerminalUrl,
      additionalTerminalsUrl: doc.vm.additionalTerminalsUrl
    },
    conversations: doc.conversations.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })),
    deployments: doc.deployments.map(d => ({
      commitSha: d.commitSha,
      commitMessage: d.commitMessage,
      commitDate: d.commitDate,
      domain: d.domain,
      url: d.url,
      deploymentId: d.deploymentId,
      state: d.state
    })),
    productionDomain: doc.productionDomain,
    productionDeploymentId: doc.productionDeploymentId,
  };
};

export const readRepoMetadata = async (
  repoId: string,
): Promise<RepoMetadata | null> => {
  await connectToDatabase();
  const repo = await RepoMetadataModel.findOne({ wrapperRepoId: repoId }).lean();
  if (!repo) return null;
  return mapToMetadata(repo as any);
};

export const resolveSourceRepoId = async (repoId: string) => {
  const metadata = await readRepoMetadata(repoId);
  return metadata?.sourceRepoId ?? repoId;
};

export const writeRepoMetadata = async (
  repoId: string,
  metadata: RepoMetadata,
  identityId?: string,
) => {
  await connectToDatabase();
  await RepoMetadataModel.findOneAndUpdate(
    { wrapperRepoId: repoId },
    {
      ...metadata,
      wrapperRepoId: repoId,
      ...(identityId ? { identityId } : {}),
    },
    { upsert: true, new: true }
  );
};

export const createConversationInRepo = async (
  repoId: string,
  metadata: RepoMetadata,
  conversationId: string,
  initialTitle?: string,
) => {
  await connectToDatabase();
  const latestMetadata = (await readRepoMetadata(repoId)) ?? metadata;
  const now = new Date().toISOString();
  const normalizedInitialTitle = initialTitle?.trim().replace(/\s+/g, " ");
  const fallbackTitle =
    normalizedInitialTitle && normalizedInitialTitle.length > 0
      ? normalizedInitialTitle.slice(0, 60)
      : `Conversation ${latestMetadata.conversations.length + 1}`;

  const updatedConversation: RepoConversationSummary = {
    id: conversationId,
    title: fallbackTitle,
    createdAt: now,
    updatedAt: now,
  };

  const nextMetadata: RepoMetadata = {
    ...latestMetadata,
    conversations: [
      updatedConversation,
      ...latestMetadata.conversations,
    ],
  };

  await RepoMetadataModel.findOneAndUpdate(
    { wrapperRepoId: repoId },
    { conversations: nextMetadata.conversations }
  );
  
  await ConversationMessageModel.create({
    conversationId,
    repoId,
    messages: []
  });

  return nextMetadata;
};

export const readConversationMessages = async (
  repoId: string,
  conversationId: string,
): Promise<UIMessage[]> => {
  await connectToDatabase();
  const conv = await ConversationMessageModel.findOne({ conversationId }).lean();
  return (conv?.messages as UIMessage[]) ?? [];
};

const deriveConversationTitle = (
  messages: UIMessage[] | undefined,
  fallback: string,
): string => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return fallback;
  }

  const userMessage = messages.find((m) => m.role === "user");
  const textPart = userMessage?.parts?.find((part) => part.type === "text");
  const text = textPart && "text" in textPart ? textPart.text : "";
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return fallback;
  return clean.slice(0, 60);
};

export const saveConversationMessages = async (
  repoId: string,
  metadata: RepoMetadata,
  conversationId: string,
  messages: UIMessage[],
) => {
  await connectToDatabase();
  const latestMetadata = (await readRepoMetadata(repoId)) ?? metadata;
  const now = new Date().toISOString();

  const existing = latestMetadata.conversations.find(
    (c) => c.id === conversationId,
  );
  const fallbackTitle =
    existing?.title ??
    `Conversation ${latestMetadata.conversations.length + 1}`;
  const title = deriveConversationTitle(messages, fallbackTitle);

  const updatedConversation: RepoConversationSummary = {
    id: conversationId,
    title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextConversations = [
    updatedConversation,
    ...latestMetadata.conversations.filter((c) => c.id !== conversationId),
  ];

  await RepoMetadataModel.findOneAndUpdate(
    { wrapperRepoId: repoId },
    { conversations: nextConversations }
  );

  await ConversationMessageModel.findOneAndUpdate(
    { conversationId },
    { repoId, messages },
    { upsert: true }
  );

  return { ...latestMetadata, conversations: nextConversations };
};

export const addRepoDeployment = async (
  repoId: string,
  metadata: RepoMetadata,
  deployment: RepoDeploymentSummary,
) => {
  await connectToDatabase();
  const latestMetadata = (await readRepoMetadata(repoId)) ?? metadata;
  const nextDeployments = [
    deployment,
    ...latestMetadata.deployments.filter(
      (d) => d.commitSha !== deployment.commitSha,
    ),
  ];

  await RepoMetadataModel.findOneAndUpdate(
    { wrapperRepoId: repoId },
    { deployments: nextDeployments }
  );

  return { ...latestMetadata, deployments: nextDeployments };
};

export const setRepoProductionDomain = async (
  repoId: string,
  metadata: RepoMetadata,
  productionDomain: string,
) => {
  await connectToDatabase();
  const latestMetadata = (await readRepoMetadata(repoId)) ?? metadata;
  await RepoMetadataModel.findOneAndUpdate(
    { wrapperRepoId: repoId },
    { productionDomain }
  );
  return { ...latestMetadata, productionDomain };
};

export const promoteRepoDeploymentToProduction = async (
  repoId: string,
  metadata: RepoMetadata,
  productionDeploymentId: string,
) => {
  await connectToDatabase();
  const latestMetadata = (await readRepoMetadata(repoId)) ?? metadata;
  await RepoMetadataModel.findOneAndUpdate(
    { wrapperRepoId: repoId },
    { productionDeploymentId }
  );
  return { ...latestMetadata, productionDeploymentId };
};

export const listIdentityRepos = async (identityId: string) => {
  await connectToDatabase();
  const repos = await RepoMetadataModel.find({ identityId }).lean();
  return repos.map(repo => ({
    id: repo.wrapperRepoId,
    name: repo.name,
    metadata: mapToMetadata(repo as any)
  }));
};

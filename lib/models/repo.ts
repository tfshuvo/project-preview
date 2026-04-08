import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRepoVmMetadata {
  vmId: string;
  previewUrl: string;
  devCommandTerminalUrl: string;
  additionalTerminalsUrl: string;
}

export interface IRepoConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface IRepoDeploymentSummary {
  commitSha: string;
  commitMessage: string;
  commitDate: string;
  domain: string;
  url: string;
  deploymentId: string | null;
  state: "idle" | "deploying" | "live" | "failed";
}

export interface IRepoMetadata extends Document {
  version: number;
  sourceRepoId: string; // used as the primary identifier (wrapperRepoId might be matched here)
  wrapperRepoId: string; // to keep track of the ID generated locally
  name?: string;
  identityId: string; // The user who owns this
  vm: IRepoVmMetadata;
  conversations: IRepoConversationSummary[];
  deployments: IRepoDeploymentSummary[];
  productionDomain: string | null;
  productionDeploymentId: string | null;
}

export interface IConversationMessage extends Document {
  conversationId: string;
  repoId: string;
  messages: any[]; // UIMessage array
}

const RepoVmMetadataSchema = new Schema<IRepoVmMetadata>({
  vmId: { type: String, required: true },
  previewUrl: { type: String, required: true },
  devCommandTerminalUrl: { type: String, required: true },
  additionalTerminalsUrl: { type: String, required: true },
});

const RepoConversationSummarySchema = new Schema<IRepoConversationSummary>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
});

const RepoDeploymentSummarySchema = new Schema<IRepoDeploymentSummary>({
  commitSha: { type: String, required: true },
  commitMessage: { type: String, required: true },
  commitDate: { type: String, required: true },
  domain: { type: String, required: true },
  url: { type: String, required: true },
  deploymentId: { type: String, default: null },
  state: { type: String, enum: ["idle", "deploying", "live", "failed"], required: true },
});

const RepoMetadataSchema = new Schema<IRepoMetadata>({
  version: { type: Number, default: 2 },
  sourceRepoId: { type: String, required: true },
  wrapperRepoId: { type: String, required: true, unique: true },
  name: { type: String },
  identityId: { type: String, required: true, index: true },
  vm: { type: RepoVmMetadataSchema, required: true },
  conversations: { type: [RepoConversationSummarySchema], default: [] },
  deployments: { type: [RepoDeploymentSummarySchema], default: [] },
  productionDomain: { type: String, default: null },
  productionDeploymentId: { type: String, default: null },
});

const ConversationMessageSchema = new Schema<IConversationMessage>({
  conversationId: { type: String, required: true, unique: true },
  repoId: { type: String, required: true, index: true },
  messages: { type: Schema.Types.Mixed, default: [] },
});

export const RepoMetadataModel: Model<IRepoMetadata> = mongoose.models.RepoMetadata || mongoose.model<IRepoMetadata>("RepoMetadata", RepoMetadataSchema);
export const ConversationMessageModel: Model<IConversationMessage> = mongoose.models.ConversationMessage || mongoose.model<IConversationMessage>("ConversationMessage", ConversationMessageSchema);

import { Schema, model } from 'mongoose';

export interface ChatSubdoc {
  chatId: string;
  title: string;
  projectId: string;       // mirror parent for convenience
  projectName: string;
  messageCount: number;
  metadata: {
    source?: string;       // 'chatgpt-export' | 'chatsworth-app'
    exportedAt?: Date;     // when this chat was last exported/synced
    sourceUpdatedAt?: Date;// remote last-modified (used for conflict resolution)
    localCreatedAt?: Date; // subdoc timestamps (mapped below)
    localUpdatedAt?: Date;
  };
}

export interface ProjectDoc {
  projectId: string;
  name: string;
  chats: ChatSubdoc[];
  lastSyncedAt?: Date;     // this project touched during a sync
  createdAt?: Date;        // auto (project doc)
  updatedAt?: Date;        // auto (project doc)
}

const ChatSchema = new Schema<ChatSubdoc>(
  {
    chatId: { type: String, required: true },
    title: { type: String, required: true },
    projectId: { type: String, required: true },
    projectName: { type: String, required: true },
    messageCount: { type: Number, default: 0 },
    metadata: {
      source: { type: String, default: 'chatgpt-export' },
      exportedAt: Date,
      sourceUpdatedAt: Date,
      localCreatedAt: Date,
      localUpdatedAt: Date,
    },
  },
  {
    _id: false,
    // Keep subdoc timestamps separate from sourceUpdatedAt
    timestamps: { createdAt: 'metadata.localCreatedAt', updatedAt: 'metadata.localUpdatedAt' },
  }
);

const ProjectSchema = new Schema<ProjectDoc>(
  {
    projectId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    chats: { type: [ChatSchema], default: [] },
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

// Indexes
ProjectSchema.index({ projectId: 1 }, { unique: true });
ProjectSchema.index({ 'chats.chatId': 1 });
ProjectSchema.index({ name: 1 });
ProjectSchema.index({ 'chats.title': 'text' });

export const ProjectModel = model<ProjectDoc>('Project', ProjectSchema);

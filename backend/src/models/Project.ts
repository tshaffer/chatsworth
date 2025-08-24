// models/Project.ts
import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  chatId: { type: String, required: true },     // rename `id` → `chatId` for clarity
  title: { type: String, required: true },
  projectId: { type: String, required: true },  // mirror parent for easier querying
  projectName: { type: String, required: true },// from conv.project.name
  messageCount: { type: Number, default: 0 },

  // Export metadata (use Date, not string)
  metadata: {
    user: String,               // optional, if present in export
    created: Date,              // from create_time
    updated: Date,              // from update_time
    exportedAt: Date,           // when we ran the sync
    source: { type: String, default: 'chatgpt-export' }, // provenance
  },
}, { _id: false });

export const ChatModel = mongoose.model('Chat', ChatSchema);

const ProjectSchema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true }, // maps to conv.project.id (or 'none')
  name: { type: String, required: true },                    // conv.project.name or "No Project"
  chats: { type: [ChatSchema], default: [] },
  lastSyncedAt: Date,
});

// helpful indexes
ProjectSchema.index({ 'chats.chatId': 1 });
ProjectSchema.index({ name: 1 });
ProjectSchema.index({ 'chats.title': 'text' });

export const ProjectModel = mongoose.model('Project', ProjectSchema);

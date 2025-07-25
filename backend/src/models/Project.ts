// models/Project.ts
import mongoose from 'mongoose';

// This schema is now used only for nested storage within Project (optional)
const EmbeddedChatEntrySchema = new mongoose.Schema({
  originalPrompt: String,
  promptSummary: String,
  response: String,
  embedding: {
    type: [Number], // 1536 floats for text-embedding-3-small
    default: undefined,
  },
}, { _id: false });

const ChatSchema = new mongoose.Schema({
  id: String,
  title: String,
  metadata: {
    title: String,
    user: String,
    created: String,
    updated: String,
    exported: String,
  },
  entries: [EmbeddedChatEntrySchema], // still nested here for now
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  id: String,
  name: String,
  chats: [ChatSchema],
});

// Full-text index for traditional keyword search
ProjectSchema.index({
  'chats.title': 'text',
  'chats.entries.originalPrompt': 'text',
  'chats.entries.promptSummary': 'text',
  'chats.entries.response': 'text',
});

export const ProjectModel = mongoose.model('Project', ProjectSchema);

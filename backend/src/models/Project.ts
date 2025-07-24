// models/Project.ts
import mongoose from 'mongoose';

const ChatEntrySchema = new mongoose.Schema({
  originalPrompt: String,
  promptSummary: String,
  response: String,
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
  entries: [ChatEntrySchema]
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  id: String,
  name: String,
  chats: [ChatSchema],
});

// Create a full-text index on nested chat entry fields and chat titles
ProjectSchema.index({
  'chats.title': 'text',
  'chats.entries.originalPrompt': 'text',
  'chats.entries.promptSummary': 'text',
  'chats.entries.response': 'text',
});

export const ProjectModel = mongoose.model('Project', ProjectSchema);

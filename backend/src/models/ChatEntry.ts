// models/ChatEntry.ts
import mongoose from 'mongoose';

const ChatEntrySchema = new mongoose.Schema({
  projectId: String,
  chatId: String,
  originalPrompt: String,
  promptSummary: String,
  response: String,
  embedding: {
    type: [Number],
    default: undefined,
  },
});

ChatEntrySchema.index({ embedding: '2dsphere' }); // optional, MongoDB Atlas will use vector index instead

export const ChatEntryModel = mongoose.model('ChatEntry', ChatEntrySchema);

// models/Project.ts
import mongoose from 'mongoose';

const ChatEntrySchema = new mongoose.Schema({
  prompt: String,
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

export const ProjectModel = mongoose.model('Project', ProjectSchema);

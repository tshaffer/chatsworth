// models/Project.ts
import mongoose from 'mongoose';

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
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  id: String,
  name: String,
  chats: [ChatSchema],
});

// Full-text index (if you still want text search on titles)
ProjectSchema.index({
  'chats.title': 'text',
});

export const ProjectModel = mongoose.model('Project', ProjectSchema);

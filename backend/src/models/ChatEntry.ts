import mongoose from 'mongoose';

const ChatEntrySchema = new mongoose.Schema({
  projectId: { type: String, required: true },
  chatId: { type: String, required: true },
  position: { type: Number, required: true },  // 0..N per conversation (user→assistant pairs)
  originalPrompt: String,
  promptSummary: String,                         // optional, if you add summarization later
  response: String,

  // optional helpful metadata:
  createdAt: Date,   // earliest timestamp in this pair, if you compute it
  updatedAt: Date,   // last timestamp in this pair, if you compute it
  exportedAt: Date,
  source: { type: String, default: 'chatgpt-export' },

  // embeddings
  embedding: {
    type: [Number],
    default: undefined,
    validate: {
      // Optional: enforce dimension (1536 for text-embedding-3-small)
      validator: (v: number[] | undefined) => !v || v.length === 1536,
      message: 'embedding must be 1536-dimensional',
    },
  },
}, { timestamps: false });

// Uniqueness: 1 entry per (chatId, position)
ChatEntrySchema.index({ chatId: 1, position: 1 }, { unique: true });

export const ChatEntryModel = mongoose.model('ChatEntry', ChatEntrySchema);

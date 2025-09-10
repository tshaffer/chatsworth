import { Schema, Types, model } from 'mongoose';

export interface ChatEntryDoc {
  _id: Types.ObjectId;            // <-- add this
  entryId: string;           // NEW: stable user-message ID from export
  projectId: string;
  chatId: string;
  position: number;          // 0..N within chat (reorderable)
  title?: string;
  originalPrompt?: string;
  promptSummary?: string;
  response?: string;

  // provenance & freshness
  source?: string;           // 'chatgpt-export' | 'chatsworth-app'
  sourceUpdatedAt?: Date;    // remote last-modified time (compare on sync)
  fingerprint?: string;      // SHA-256 over normalized fields
  exportedAt?: Date;         // when we wrote this from export last

  // local timestamps
  createdAt?: Date;
  updatedAt?: Date;

  // embeddings (optional)
  embedding?: number[];
}

const ChatEntrySchema = new Schema<ChatEntryDoc>(
  {
    entryId: { type: String, required: true, unique: true },
    projectId: { type: String, required: true, index: true },
    chatId: { type: String, required: true, index: true },
    position: { type: Number, required: true },
    title: String,
    originalPrompt: String,
    promptSummary: String,
    response: String,
    source: { type: String, default: 'chatgpt-export' },
    sourceUpdatedAt: Date,
    fingerprint: String,
    exportedAt: Date,
    embedding: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (v: number[] | undefined) => !v || v.length === 1536,
        message: 'embedding must be 1536-dimensional',
      },
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// Helpful indexes
ChatEntrySchema.index({ entryId: 1 }, { unique: true });
ChatEntrySchema.index({ chatId: 1, position: 1 }, { unique: true }); // still useful for ordering
ChatEntrySchema.index({ chatId: 1, updatedAt: -1 });

export const ChatEntryModel = model<ChatEntryDoc>('ChatEntry', ChatEntrySchema);

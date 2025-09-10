import { Schema, model } from 'mongoose';

export type TombstoneDoc = {
  kind: 'entry' | 'chat' | 'project';
  projectId?: string;
  chatId?: string;
  entryId?: string;
  deletedAt: Date;             // when Chatsworth deleted it
  deletedBy?: string;          // optional
  source: 'app';               // who issued the deletion
};

const TombstoneSchema = new Schema<TombstoneDoc>(
  {
    kind: { type: String, enum: ['entry','chat','project'], required: true },
    projectId: String,
    chatId: String,
    entryId: String,
    deletedAt: { type: Date, required: true },
    deletedBy: String,
    source: { type: String, default: 'app' },
  },
  { timestamps: true }
);

// Prevent dup tombstones for the same object:
TombstoneSchema.index(
  { kind: 1, projectId: 1, chatId: 1, entryId: 1 },
  { unique: true, partialFilterExpression: { kind: { $exists: true } } }
);

export const TombstoneModel = model('tombstones', TombstoneSchema);

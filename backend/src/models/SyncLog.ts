// models/SyncLog.ts
import { Schema, model } from 'mongoose';

export interface SyncLogDoc {
  runId: string;             // uuid
  startedAt: Date;
  finishedAt?: Date;
  dryRun: boolean;
  source: 'chatgpt-export' | 'chatsworth-app';
  sourcePath?: string;       // file path or batch id
  counts: {
    projects: { created: number; renamed: number };
    chats: { created: number; renamed: number; movedProject: number };
    entries: {
      created: number; renamed: number; movedChat: number; movedProject: number;
      reordered: number; editedPromptSummary: number; editedResponse: number;
      deleted: number; resurrected: number;
      skippedByFingerprint: number;
    };
  };
  notes?: string[];
  error?: string;
}

const SyncLogSchema = new Schema<SyncLogDoc>({
  runId: { type: String, required: true, unique: true },
  startedAt: { type: Date, required: true },
  finishedAt: Date,
  dryRun: { type: Boolean, default: false },
  source: { type: String, required: true },
  sourcePath: String,
  counts: { type: Object, required: true },
  notes: [String],
  error: String,
});

export const SyncLogModel = model<SyncLogDoc>('SyncLog', SyncLogSchema);

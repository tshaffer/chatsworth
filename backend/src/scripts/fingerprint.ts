// fingerprint.ts
import crypto from 'crypto';

export function entryFingerprint(input: {
  title?: string;
  promptSummary?: string;
  response?: string;
  position: number;
  chatId: string;
  projectId: string;
}) {
  const norm = [
    input.title ?? '',
    input.promptSummary ?? '',
    input.response ?? '',
    String(input.position),
    input.chatId,
    input.projectId,
  ].join('|');
  return crypto.createHash('sha256').update(norm).digest('hex');
}

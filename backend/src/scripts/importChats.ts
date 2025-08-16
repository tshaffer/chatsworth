// src/scripts/classifyMarkdownImports.ts
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

import { ProjectModel } from '../models';
import { connectDB } from '../config/db';
import { parseMarkdownFiles, MarkdownFileData } from '../controllers';
import { Chat, Project } from '../types';

// ------------------------------
// CLI
// ------------------------------
type CLI = {
  chatsDirectory: string;
  csv?: boolean; // optional: --csv to print CSV summary
};

function parseArgs(): CLI {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const ix = args.findIndex((a) => a.startsWith(`--${key}=`));
    if (ix >= 0) return args[ix].split('=')[1];
    return args.includes(`--${key}`) ? '' : undefined;
  };
  return {
    chatsDirectory: get('chatsDirectory')!,
    csv: args.includes('--csv'),
  };
}

// ------------------------------
// File Discovery
// ------------------------------
async function getAllMarkdownFiles(dirPath: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (p.toLowerCase().endsWith('.md')) out.push(p);
    }
  }
  await walk(dirPath);
  return out;
}

async function getMarkdownFileData(chatsDirectory: string): Promise<MarkdownFileData[]> {
  const files = await getAllMarkdownFiles(chatsDirectory);
  return parseMarkdownFiles(files);
}

// ------------------------------
// DB Access
// ------------------------------
async function getChatsByChatId(): Promise<Record<string, Chat>> {
  const map: Record<string, Chat> = {};
  const projects: Project[] = await ProjectModel.find().lean();
  for (const project of projects) {
    for (const chat of project.chats) {
      map[String(chat.id)] = chat;
    }
  }
  return map;
}

async function getChatsByTitle(): Promise<Record<string, Chat[]>> {
  // Some titles may collide; store array.
  const map: Record<string, Chat[]> = {};
  const projects: Project[] = await ProjectModel.find().lean();
  for (const project of projects) {
    for (const chat of project.chats) {
      const key = (chat.title || '').trim();
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(chat);
    }
  }
  return map;
}

// ------------------------------
// Hashing helpers
// ------------------------------
function sha1(s: string): string {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
}

/**
 * Normalize whitespace, line endings, code fences, etc. for robust comparisons.
 */
function normalizeText(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '') // trim trailing spaces
    .replace(/\n{3,}/g, '\n\n') // collapse >2 newlines
    .trim();
}

/**
 * Extract a "core content" string from a parsed markdown file.
 * Prefers structured entries if present; otherwise falls back to cleaned raw content.
 */
function coreFromMarkdown(m: MarkdownFileData): string {
  // If parser produced entries, use those (ignores headings/metadata differences)
  if (Array.isArray((m as any).entries) && (m as any).entries.length) {
    const entries = (m as any).entries as Array<{ prompt?: string; response?: string }>;
    const blocks = entries.map((e, i) => {
      const q = (e.prompt ?? '').trim();
      const a = (e.response ?? '').trim();
      return `#${i + 1}\nQ:\n${q}\n---\nA:\n${a}`;
    });
    return normalizeText(blocks.join('\n\n'));
  }
  // Fallback: raw content stripped of obvious metadata lines
  const raw = (m as any).content ?? '';
  const stripped = raw
    // strip typical metadata lines our exporter writes, adjust as needed:
    .replace(/^(\*\*Created:\*\*|Created:).*$\n?/gim, '')
    .replace(/^(\*\*Updated:\*\*|Updated:).*$\n?/gim, '')
    .replace(/^(\*\*Exported:\*\*|Exported:).*$\n?/gim, '')
    .replace(/^(\*\*User:\*\*|User:).*$\n?/gim, '')
    .replace(/^(\*\*Chat ID:\*\*|Chat ID:).*$\n?/gim, '');
  return normalizeText(stripped);
}

/**
 * Extract a "core content" string from a DB Chat.
 * Focus on the actual conversation text, ignoring metadata formatting.
 */
function coreFromDbChat(chat: Chat): string {
  // Assemble a minimal, deterministic text from entries
  const parts: string[] = [];
  // Some schemas use `entries` with { originalPrompt, promptSummary, response }.
  // Prefer originalPrompt if present; else fall back to promptSummary.
  (chat.entries ?? []).forEach((e, i) => {
    const q = (e as any).originalPrompt ?? (e as any).promptSummary ?? '';
    const a = (e as any).response ?? '';
    parts.push(`#${i + 1}\nQ:\n${q.trim()}\n---\nA:\n${a.trim()}`);
  });
  // Also include the chat title, because users sometimes edit only the title in the file
  const title = (chat.title ?? '').trim();
  const header = title ? `TITLE:\n${title}\n===\n` : '';
  return normalizeText(header + parts.join('\n\n'));
}

// ------------------------------
// Matching helpers
// ------------------------------
function titleOfMarkdown(m: MarkdownFileData): string | undefined {
  // Try explicit parsers first; fallback to first H1; finally filename
  const metaTitle = (m as any).title as string | undefined;
  if (metaTitle && metaTitle.trim()) return metaTitle.trim();

  const content = ((m as any).content as string | undefined) ?? '';
  const h1 = content.match(/^\s*#\s+(.+)\s*$/m);
  if (h1 && h1[1]?.trim()) return h1[1].trim();

  return undefined;
}

function chatIdOfMarkdown(m: MarkdownFileData): string | undefined {
  // If your parser pulls a chatId from frontmatter/header, read it here
  return (m as any).chatId ? String((m as any).chatId) : undefined;
}

// ------------------------------
// Classification
// ------------------------------
type Classification =
  | 'NOT_IMPORTED'
  | 'IMPORTED_UNCHANGED'
  | 'IMPORTED_AND_UPDATED';

type Classified = {
  filePath: string;
  title?: string;
  matchedChatId?: string;
  classification: Classification;
  fileHash: string;
  dbHash?: string;
};

async function classifyAll(
  markdowns: MarkdownFileData[],
  dbById: Record<string, Chat>,
  dbByTitle: Record<string, Chat[]>
): Promise<Classified[]> {
  const results: Classified[] = [];

  for (const m of markdowns) {
    const filePath = (m as any).filePath as string;
    const title = titleOfMarkdown(m);
    const maybeId = chatIdOfMarkdown(m);

    const fileCore = coreFromMarkdown(m);
    const fileHash = sha1(fileCore);

    let matchedChat: Chat | undefined;

    // 1) Prefer exact chatId match if present
    if (maybeId && dbById[maybeId]) {
      matchedChat = dbById[maybeId];
    } else if (title && dbByTitle[title]?.length) {
      // 2) Title match: if multiple, pick the closest by simple heuristic
      const candidates = dbByTitle[title];
      if (candidates.length === 1) {
        matchedChat = candidates[0];
      } else {
        // tie-breaker: choose the one with the closest entry count
        const nFileEntries =
          Array.isArray((m as any).entries) && (m as any).entries.length
            ? (m as any).entries.length
            : undefined;
        let best: Chat | undefined;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (const c of candidates) {
          const diff = Math.abs((c.entries?.length ?? 0) - (nFileEntries ?? 0));
          if (diff < bestDiff) {
            best = c;
            bestDiff = diff;
          }
        }
        matchedChat = best ?? candidates[0];
      }
    }

    if (!matchedChat) {
      results.push({
        filePath,
        title,
        classification: 'NOT_IMPORTED',
        fileHash,
      });
      continue;
    }

    const dbCore = coreFromDbChat(matchedChat);
    const dbHash = sha1(dbCore);

    const classification: Classification =
      fileHash === dbHash ? 'IMPORTED_UNCHANGED' : 'IMPORTED_AND_UPDATED';

    results.push({
      filePath,
      title,
      matchedChatId: String(matchedChat.id),
      classification,
      fileHash,
      dbHash,
    });
  }

  return results;
}

// ------------------------------
// Output helpers
// ------------------------------
function printSummary(classified: Classified[]) {
  const counts = classified.reduce<Record<Classification, number>>(
    (acc, c) => {
      acc[c.classification]++;
      return acc;
    },
    {
      NOT_IMPORTED: 0,
      IMPORTED_UNCHANGED: 0,
      IMPORTED_AND_UPDATED: 0,
    }
  );

  console.log('\n=== Classification Summary ===');
  console.log(`NOT_IMPORTED           : ${counts.NOT_IMPORTED}`);
  console.log(`IMPORTED_UNCHANGED     : ${counts.IMPORTED_UNCHANGED}`);
  console.log(`IMPORTED_AND_UPDATED   : ${counts.IMPORTED_AND_UPDATED}`);

  const show = (label: Classification) => {
    const items = classified.filter((c) => c.classification === label);
    if (items.length === 0) return;
    console.log(`\n--- ${label} (${items.length}) ---`);
    for (const r of items) {
      const t = r.title ? `  [${r.title}]` : '';
      const id = r.matchedChatId ? `  (chatId=${r.matchedChatId})` : '';
      console.log(`• ${r.filePath}${t}${id}`);
    }
  };

  show('NOT_IMPORTED');
  show('IMPORTED_UNCHANGED');
  show('IMPORTED_AND_UPDATED');
}

function printCsv(classified: Classified[]) {
  console.log('\npath,title,matchedChatId,classification,fileHash,dbHash');
  for (const r of classified) {
    const row = [
      JSON.stringify(r.filePath),
      JSON.stringify(r.title ?? ''),
      JSON.stringify(r.matchedChatId ?? ''),
      r.classification,
      r.fileHash,
      r.dbHash ?? '',
    ];
    console.log(row.join(','));
  }
}

// ------------------------------
// Main
// ------------------------------
async function main() {
  const cli = parseArgs();
  if (!cli.chatsDirectory) {
    throw new Error('Missing required argument: --chatsDirectory=/path');
  }

  await connectDB();

  try {
    const markdowns = await getMarkdownFileData(cli.chatsDirectory);

    const [dbById, dbByTitle] = await Promise.all([
      getChatsByChatId(),
      getChatsByTitle(),
    ]);

    const classified = await classifyAll(markdowns, dbById, dbByTitle);

    printSummary(classified);
    if (cli.csv) {
      printCsv(classified);
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Classify script failed:', err);
  process.exit(1);
});

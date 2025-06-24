import { ChatEntry, MarkdownMetadata, ParsedMarkdown } from '../types';
import MarkdownIt from 'markdown-it';

export function extractChatEntriesPreservingMarkdown(markdownText: string): ChatEntry[] {
  const md = new MarkdownIt();
  const tokens = md.parse(markdownText, {});
  const chatEntries: ChatEntry[] = [];

  let currentPrompt: string | null = null;
  let currentResponse: string | null = null;
  let collecting: 'prompt' | 'response' | null = null;

  // Collect original markdown lines
  const lines = markdownText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (/^##\s*prompt:/i.test(line)) {
      // Save previous entry if valid
      if (currentPrompt !== null && currentResponse !== null) {
        chatEntries.push({ originalPrompt: currentPrompt.trim(), promptSummary: currentPrompt.trim(), response: currentResponse.trim() });
      }
      currentPrompt = '';
      currentResponse = null;
      collecting = 'prompt';
      i++; // Skip current "Prompt:" line
      continue;
    }

    if (/^##\s*response:/i.test(line)) {
      currentResponse = '';
      collecting = 'response';
      i++; // Skip current "Response:" line
      continue;
    }

    if (collecting === 'prompt') {
      currentPrompt += lines[i] + '\n';
    } else if (collecting === 'response') {
      currentResponse += lines[i] + '\n';
    }

    i++;
  }

  // Final entry
  if (currentPrompt !== null && currentResponse !== null) {
    chatEntries.push({ originalPrompt: currentPrompt.trim(), promptSummary: currentPrompt.trim(), response: currentResponse.trim() });
  }

  return chatEntries;
}

export function extractMarkdownMetadata(markdownText: string): MarkdownMetadata | null {
  const lines = markdownText.split('\n').map(line => line.trim());

  const titleMatch = lines.find(line => line.startsWith('# '));
  const userLine = lines.find(line => line.toLowerCase().startsWith('**user:**'));
  const createdLine = lines.find(line => line.toLowerCase().startsWith('**created:**'));
  const updatedLine = lines.find(line => line.toLowerCase().startsWith('**updated:**'));
  const exportedLine = lines.find(line => line.toLowerCase().startsWith('**exported:**'));

  if (!titleMatch || !userLine || !createdLine || !updatedLine || !exportedLine) {
    return null; // Required metadata is missing
  }

  return {
    title: titleMatch.replace(/^#\s*/, ''),
    user: userLine.replace(/\*\*user:\*\*\s*/i, ''),
    created: createdLine.replace(/\*\*created:\*\*\s*/i, ''),
    updated: updatedLine.replace(/\*\*updated:\*\*\s*/i, ''),
    exported: exportedLine.replace(/\*\*exported:\*\*\s*/i, ''),
  };
}

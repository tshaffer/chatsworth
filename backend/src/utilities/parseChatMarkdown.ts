import { ChatEntry, MarkdownMetadata } from '../types';

export function extractChatEntriesPreservingMarkdown(markdownText: string): Omit<ChatEntry, 'chatId' | 'projectId'>[] {
  const chatEntries: Omit<ChatEntry, 'chatId' | 'projectId'>[] = [];

  let currentPrompt: string | null = null;
  let currentResponse: string | null = null;
  let collecting: 'prompt' | 'response' | null = null;

  const lines = markdownText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (/^##\s*prompt:/i.test(line)) {
      if (currentPrompt !== null && currentResponse !== null) {
        chatEntries.push({
          originalPrompt: currentPrompt.trim(),
          promptSummary: currentPrompt.trim(),
          response: currentResponse.trim(),
          position: chatEntries.length,
        });
      }
      currentPrompt = '';
      currentResponse = null;
      collecting = 'prompt';
      i++;
      continue;
    }

    if (/^##\s*response:/i.test(line)) {
      currentResponse = '';
      collecting = 'response';
      i++;
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
    chatEntries.push({
      originalPrompt: currentPrompt.trim(),
      promptSummary: currentPrompt.trim(),
      response: currentResponse.trim(),
      position: chatEntries.length,
    });
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
    return null;
  }

  return {
    title: titleMatch.replace(/^#\s*/, ''),
    user: userLine.replace(/\*\*user:\*\*\s*/i, ''),
    created: createdLine.replace(/\*\*created:\*\*\s*/i, ''),
    updated: updatedLine.replace(/\*\*updated:\*\*\s*/i, ''),
    exported: exportedLine.replace(/\*\*exported:\*\*\s*/i, ''),
  };
}

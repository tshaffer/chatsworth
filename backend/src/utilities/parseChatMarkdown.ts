import { ChatEntry, MarkdownMetadata, ParsedMarkdown } from 'base';
import MarkdownIt from 'markdown-it';

let lastCurrentResponse: string | null = null;

function outputFinalResponse(currentResponse: string | null): void {
  if (!currentResponse || currentResponse.trim() === '') {
    return;
  }
  if (lastCurrentResponse === currentResponse) {
    // console.log('No change in response, skipping output.');
    return;
  }
  lastCurrentResponse = currentResponse;
  console.log('Output final response:');
  // console.log(currentResponse);
}

export function extractChatEntries(markdownText: string): ChatEntry[] {
  const md = new MarkdownIt();
  const tokens = md.parse(markdownText, {});
  const chatEntries: ChatEntry[] = [];

  let currentPrompt: string | null = null;
  let currentResponse: string | null = null;
  let collecting: 'prompt' | 'response' | null = null;

  for (const token of tokens) {
    if (token.tag === 'hr') {
      console.log('hr tag detected')
    }
    if (token.type === 'heading_open' && token.tag === 'h2') {
      // collecting = null;
      // outputFinalResponse(currentResponse);
    } else if (token.type === 'inline') {
      const content = token.content.trim();
      if (content.toLowerCase().startsWith('prompt:')) {
        if (currentPrompt && currentResponse !== null) {
          chatEntries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
        }
        currentPrompt = '';
        outputFinalResponse(currentResponse);
        currentResponse = null;
        collecting = 'prompt';
      } else if (content.toLowerCase().startsWith('response:')) {
        currentResponse = '';
        collecting = 'response';
      } else {
        if (collecting === 'prompt') currentPrompt += content + '\n';
        if (collecting === 'response') {
          if (content.includes('into your mocked import logic')) {
            console.log('Failure next');
          }
          currentResponse += content + '\n';
        }
      }
    }
  }

  if (currentPrompt && currentResponse !== null) {
    chatEntries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
  }

  return chatEntries;
}

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
        chatEntries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
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
    chatEntries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
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

export function parseMarkdown(markdownText: string): ParsedMarkdown {
  const chatEntries = extractChatEntriesPreservingMarkdown(markdownText);
  const metadata = extractMarkdownMetadata(markdownText);
  return { chatEntries, metadata };
}

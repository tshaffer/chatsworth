import MarkdownIt from 'markdown-it';

export interface ChatEntry {
  prompt: string;
  response: string;
}

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
  const entries: ChatEntry[] = [];

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
          entries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
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
    entries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
  }

  return entries;
}

export function extractChatEntriesPreservingMarkdown(markdownText: string): ChatEntry[] {
  const md = new MarkdownIt();
  const tokens = md.parse(markdownText, {});
  const entries: ChatEntry[] = [];

  let currentPrompt: string | null = null;
  let currentResponse: string | null = null;
  let collecting: 'prompt' | 'response' | null = null;

  // Collect original markdown lines
  const lines = markdownText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (/^prompt:/i.test(line)) {
      // Save previous entry if valid
      if (currentPrompt !== null && currentResponse !== null) {
        entries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
      }
      currentPrompt = '';
      currentResponse = null;
      collecting = 'prompt';
      i++; // Skip current "Prompt:" line
      continue;
    }

    if (/^response:/i.test(line)) {
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
    entries.push({ prompt: currentPrompt.trim(), response: currentResponse.trim() });
  }

  return entries;
}

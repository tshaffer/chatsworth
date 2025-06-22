import MarkdownIt from 'markdown-it';

export interface ChatEntry {
  prompt: string;
  response: string;
}

function outputFinalResponse(currentResponse: string | null): void {
  if (!currentResponse || currentResponse.trim() === '') {
    return;
  }
  console.log('Final response:');
  console.log(currentResponse);
}

export function extractChatEntries(markdownText: string): ChatEntry[] {
  const md = new MarkdownIt();
  const tokens = md.parse(markdownText, {});
  const entries: ChatEntry[] = [];

  let currentPrompt: string | null = null;
  let currentResponse: string | null = null;
  let collecting: 'prompt' | 'response' | null = null;

  for (const token of tokens) {
    if (token.type === 'heading_open' && token.tag === 'h2') {
      collecting = null;
      outputFinalResponse(currentResponse);
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

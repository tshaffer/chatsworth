import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { Root, Content, Heading, Paragraph, Text, Code } from 'mdast';
import { readFileSync } from 'fs';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface ParsedChat {
  title: string;
  entries: ChatEntry[];
}

export function parseChatMarkdown(filePath: string): ParsedChat {
  const fileContent = readFileSync(filePath, 'utf-8');
  const tree = unified().use(remarkParse).parse(fileContent) as Root;

  let title = 'Untitled Chat';
  const entries: ChatEntry[] = [];

  let currentRole: ChatEntry['role'] | null = null;
  let currentText: string[] = [];

  function flushEntry() {
    if (currentRole && currentText.length) {
      entries.push({
        role: currentRole,
        content: currentText.join('\n').trim(),
      });
      currentText = [];
    }
  }

  for (const node of tree.children as Content[]) {
    if (node.type === 'heading' && node.depth === 1) {
      const heading = node as Heading;
      const textNode = heading.children.find((c): c is Text => c.type === 'text');
      if (textNode) title = textNode.value;
    } else if (node.type === 'paragraph') {
      const paragraph = node as Paragraph;
      const text = paragraph.children
        .filter((c): c is Text => c.type === 'text')
        .map(c => c.value)
        .join('');

      if (text.startsWith('**User:**')) {
        flushEntry();
        currentRole = 'user';
        currentText.push(text.replace('**User:**', '').trim());
      } else if (text.startsWith('**ChatGPT:**')) {
        flushEntry();
        currentRole = 'assistant';
        currentText.push(text.replace('**ChatGPT:**', '').trim());
      } else {
        currentText.push(text);
      }
    } else if (node.type === 'code') {
      const codeNode = node as Code;
      currentText.push('```\n' + codeNode.value + '\n```');
    }
  }

  flushEntry();

  return { title, entries };
}

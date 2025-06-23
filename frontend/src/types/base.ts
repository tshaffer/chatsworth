export const getServerUrl = (): string => {
  return (window as any).__ENV__?.BACKEND_URL || 'http://localhost:8080';
};

export const apiUrlFragment = '/api/v1/';

export interface FileToImport {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  lastModifiedDate: string;
}

export interface ChatEntry {
  prompt: string;
  response: string;
}

export interface MarkdownMetadata {
  title: string;
  user: string;
  created: string;
  updated: string;
  exported: string;
}

export interface ParsedMarkdown {
  chatEntries: ChatEntry[];
  metadata: MarkdownMetadata | null;
}

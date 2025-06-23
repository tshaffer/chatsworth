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

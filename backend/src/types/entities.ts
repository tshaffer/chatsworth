// A single prompt/response pair
export interface ChatEntry {
  originalPrompt: string,
  promptSummary: string,
  response: string;
}

// Metadata extracted from the markdown
export interface MarkdownMetadata {
  title: string;
  user: string;
  created: string;
  updated: string;
  exported: string;
}

// A single chat (e.g., a markdown file or a conversation session)
export interface Chat {
  id: string; // unique identifier, e.g., filename or UUID
  title: string; // often same as metadata.title
  metadata: MarkdownMetadata | null;
  entries: ChatEntry[];
}

// A project (e.g., named folder or session group)
export interface Project {
  id: string; // unique identifier
  name: string;
  chats: Chat[];
}

// Top-level structure returned from the backend
export interface ParsedMarkdown {
  projects: Project[];
}

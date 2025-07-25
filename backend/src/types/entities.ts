// Top-level structure returned from the backend
export interface ProjectsState {
  projectList: Project[];
}

// A project (e.g., named folder or session group)
export interface Project {
  id: string; // unique identifier
  name: string;
  chats: Chat[];
}

// Metadata extracted from the markdown
export interface MarkdownMetadata {
  title: string;
  user: string;
  created: string;
  updated: string;
  exported: string;
}

export interface Chat {
  id: string;
  title: string;
  metadata?: MarkdownMetadata;
}

// A single prompt/response pair
export interface ChatEntry {
  _id?: string; // optional for creating new entries, present when loaded from DB
  chatId: string;
  projectId: string;
  originalPrompt: string;
  promptSummary: string;
  response: string;
  position?: number; // optional, used to determine order within the chat
  embedding?: number[]; // optional, if vector embedding is used
}

export interface SemanticSearchResultEntry {
  _id: string;
  chatId: string;
  projectId: string;
  originalPrompt: string;
  promptSummary: string;
  response: string;
  // Include other fields from ChatEntry if needed
}

export interface SemanticSearchResultChat {
  chatId: string;
  chatTitle: string;
  entries: SemanticSearchResultEntry[];
}

export interface SemanticSearchResultProject {
  projectId: string;
  projectName: string;
  chats: SemanticSearchResultChat[];
}

export type SemanticSearchResults = SemanticSearchResultProject[];

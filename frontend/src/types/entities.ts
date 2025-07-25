import { Search } from "react-router-dom";

// Top-level structure returned from the backend
export interface ProjectsState {
  projectList: Project[];
  selectedChatId: string | null;
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

// A single chat (e.g., a markdown file or a conversation session)
export interface Chat {
  id: string; // unique identifier, e.g., filename or UUID
  title: string; // often same as metadata.title
  metadata: MarkdownMetadata | null;
  entries: ChatEntry[];
}

export interface ChatEntry {
  _id: string;
  projectId: string;
  chatId: string;
  originalPrompt: string;
  promptSummary: string;
  response: string;
  embedding?: number[]; // vector representation for semantic search
}

export interface SearchResult {
  id: string;          // project ID
  name: string;        // project name
  chats: Chat[];
}

export type SearchResults = SearchResult[];

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

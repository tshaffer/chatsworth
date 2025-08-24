export interface Chat {
  id: string;             // domain id = chatId in DB
  title: string;
  projectId: string;
  projectName: string;
  messageCount: number;
}

export interface Project {
  id: string;             // domain id = projectId in DB
  name: string;
  chats: Chat[];
}

export interface ChatEntry {
  entryId: string;        // NEW: stable key
  projectId: string;
  chatId: string;
  position: number;
  // make these optional to match DB (and avoid TS errors)
  originalPrompt?: string;
  promptSummary?: string;
  response?: string;
}

// If you expose ProjectsState in responses:
export interface ProjectsState {
  projectList: Project[];
}

// A single prompt/response pair
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

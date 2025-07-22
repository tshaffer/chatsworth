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

export interface MoveChatEntryBody {
  fromProjectId: string;
  fromChatId: string;
  toProjectId: string;
  toChatId: string;
  entryIndex: number;
  newIndex?: number; // Optional: place in the destination chat
}

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

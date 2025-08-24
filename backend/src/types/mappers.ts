// Extend your mappers file
import { ChatSubdoc, ProjectDoc } from '../models';
import type { ChatEntryDoc } from '../models/ChatEntry';
import type { Chat, ChatEntry, Project } from '../types/entities';

export function toDomainProject(d: ProjectDoc): Project {
  return {
    id: d.projectId,
    name: d.name,
    chats: (d.chats ?? []).map(toDomainChat),
  };
}

export function toDomainEntry(d: ChatEntryDoc): ChatEntry {
  return {
    entryId: String((d as any).entryId ?? d._id), // normalize to string
    projectId: d.projectId,
    chatId: d.chatId,
    position: d.position ?? 0,
    originalPrompt: d.originalPrompt ?? '',
    promptSummary: d.promptSummary ?? '',
    response: d.response ?? '',
  };
}

// Optional if you ever construct from domain to DB
export function fromDomainEntry(e: ChatEntry): Partial<ChatEntryDoc> {
  return {
    projectId: e.projectId,
    chatId: e.chatId,
    position: e.position ?? 0,
    originalPrompt: e.originalPrompt ?? '',
    promptSummary: e.promptSummary ?? '',
    response: e.response ?? '',
  };
}

export function toDomainChat(c: ChatSubdoc): Chat {
  return {
    id: c.chatId,                 // domain id mirrors DB chatId
    title: c.title,
    projectId: c.projectId,
    projectName: c.projectName,
    messageCount: c.messageCount ?? 0,
  };
}

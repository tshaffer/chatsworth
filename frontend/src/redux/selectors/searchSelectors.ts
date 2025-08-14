// frontend/src/redux/selectors/searchSelectors.ts
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import type { Project, Chat, ChatEntry } from '../../types';

// ---- Types for the selector output
export interface FilteredChat {
  chatId: string;
  chatTitle: string;
  matchingEntryIds: string[];
}

export interface FilteredProject {
  projectId: string;
  projectName: string;
  chats: FilteredChat[];
}

type SearchMode = 'fulltext' | 'semantic';

// ---- Semantic result types (as returned by your backend)
type SemanticEntry = { id: string };
type SemanticChat = { chatId: string; chatTitle: string; entries: SemanticEntry[] };
type SemanticProject = { projectId: string; projectName: string; chats: SemanticChat[] };
export type SemanticSearchResults = SemanticProject[];

// ---- Base input from Redux
const selectProjects = (s: RootState) => s.projects.projectList;

// ---- Helpers
const normalize = (q: string) => q.trim().toLowerCase();

const hasTextMatchInEntry = (e: Partial<ChatEntry>, nq: string): boolean => {
  return (
    (e.promptSummary ?? '').toLowerCase().includes(nq) ||
    (e.originalPrompt ?? '').toLowerCase().includes(nq) ||
    (e.response ?? '').toLowerCase().includes(nq)
  );
};

const entryId = (e: Partial<ChatEntry>): string | undefined =>
  (e as any)._id ?? (e as any).id;

// ---- Factory selector
export const makeSelectFilteredProjects = () =>
  createSelector(
    [
      selectProjects,
      (_: RootState, query: string | null) => query,
      (_: RootState, mode: SearchMode) => mode,
      (_: RootState, semantic: SemanticSearchResults | null) => semantic,
    ],
    (projects: Project[], query, mode, semantic): FilteredProject[] => {
      // Semantic mode: map backend structure directly
      if (mode === 'semantic' && semantic && semantic.length > 0) {
        return semantic.map((p: SemanticProject): FilteredProject => ({
          projectId: p.projectId,
          projectName: p.projectName,
          chats: p.chats.map((c: SemanticChat): FilteredChat => ({
            chatId: c.chatId,
            chatTitle: c.chatTitle,
            matchingEntryIds: c.entries.map((e: SemanticEntry) => e.id),
          })),
        }));
      }

      // Keyword mode (or empty semantic): local filter
      const nq = normalize(query || '');
      if (!nq) {
        // No query → return all projects/chats, with empty matchingEntryIds
        return projects.map((p: Project): FilteredProject => ({
          projectId: p.id,
          projectName: p.name,
          chats: p.chats.map((c: Chat): FilteredChat => ({
            chatId: c.id,
            chatTitle: c.title,
            matchingEntryIds: [],
          })),
        }));
      }

      // With query: include only chats that match
      const filtered: FilteredProject[] = [];

      for (const p of projects as Project[]) {
        const chats: FilteredChat[] = [];

        for (const c of p.chats as Chat[]) {
          const titleMatches = (c.title ?? '').toLowerCase().includes(nq);

          const matchingEntryIds: string[] = (c.entries ?? [])
            .filter((e: ChatEntry) => hasTextMatchInEntry(e, nq))
            .map((e: ChatEntry) => entryId(e))
            .filter((id): id is string => typeof id === 'string');

          if (titleMatches || matchingEntryIds.length > 0) {
            chats.push({
              chatId: c.id,
              chatTitle: c.title,
              matchingEntryIds,
            });
          }
        }

        if (chats.length > 0) {
          filtered.push({
            projectId: p.id,
            projectName: p.name,
            chats,
          });
        }
      }

      return filtered;
    }
  );

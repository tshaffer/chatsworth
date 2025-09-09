// frontend/src/redux/selectors/searchSelectors.ts
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import type { Project, Chat, ChatEntry, SemanticSearchResultChat, SemanticSearchResultEntry, SemanticSearchResultProject, SemanticSearchResults } from '../../types';

// ---- at bottom of searchSelectors.ts

type SearchMode = 'fulltext' | 'semantic';

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

type PropsArg = {
  query: string | null;
  mode: SearchMode;
  semantic: SemanticSearchResults | null;
};

// Base input
const selectProjects = (s: RootState) => s.projects.projectList;

const normalize = (q: string) => q.trim().toLowerCase();

const hasTextMatchInEntry = (e: Partial<ChatEntry>, nq: string): boolean =>
  (e.promptSummary ?? '').toLowerCase().includes(nq) ||
  (e.originalPrompt ?? '').toLowerCase().includes(nq) ||
  (e.response ?? '').toLowerCase().includes(nq);

const getEntryIdLoose = (e: Partial<ChatEntry>): string | undefined =>
  (e as any)._id ?? (e as any).id;

export const makeSelectFilteredProjects = () =>
  createSelector(
    [selectProjects, (_: RootState, props: PropsArg) => props],
    (projects: Project[], { query, mode, semantic }: PropsArg): FilteredProject[] => {
      if (mode === 'semantic' && semantic && semantic.length > 0) {
        return semantic.map((p) => ({
          projectId: p.projectId,
          projectName: p.projectName,
          chats: p.chats.map((c) => ({
            chatId: c.chatId,
            chatTitle: c.chatTitle,
            matchingEntryIds: c.entries.map((e) => e.entryId),
          })),
        }));
      }

      const nq = normalize(query || '');
      if (!nq) {
        return projects.map((p) => ({
          projectId: p.id,
          projectName: p.name,
          chats: p.chats.map((c) => ({
            chatId: c.id,
            chatTitle: c.title,
            matchingEntryIds: [],
          })),
        }));
      }

      const filtered: FilteredProject[] = [];
      for (const p of projects) {
        const chats: FilteredChat[] = [];
        for (const c of p.chats) {
          const titleMatches = (c.title ?? '').toLowerCase().includes(nq);
          const matchingEntryIds: string[] = (c.entries ?? [])
            .filter((e) => hasTextMatchInEntry(e, nq))
            .map((e) => getEntryIdLoose(e))
            .filter((id): id is string => typeof id === 'string');

          if (titleMatches || matchingEntryIds.length > 0) {
            chats.push({ chatId: c.id, chatTitle: c.title, matchingEntryIds });
          }
        }
        if (chats.length > 0) {
          filtered.push({ projectId: p.id, projectName: p.name, chats });
        }
      }
      return filtered;
    }
  );

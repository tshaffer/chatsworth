// redux/selectors/chatSelectors.ts
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';

export const selectEntriesState = (s: RootState) => s.chatEntries;
export const selectIdsByChatId = createSelector(selectEntriesState, (s) => s.idsByChatId);
export const selectEntriesById  = createSelector(selectEntriesState, (s) => s.byId);

export const makeSelectEntriesForChat = () =>
  createSelector(
    [selectIdsByChatId, selectEntriesById, (_: RootState, chatId: string) => chatId],
    (idsByChat, byId, chatId) => (idsByChat[chatId] || []).map((id) => byId[id])
  );

// If you keep projects/chats in a different slice:
export const selectProjects = (s: RootState) => s.projects.projectList;

export const makeSelectChatsByProjectId = () =>
  createSelector(
    [selectProjects, (_: RootState, projectId: string) => projectId],
    (projects, projectId) => projects.find((p) => p.id === projectId)?.chats ?? []
  );

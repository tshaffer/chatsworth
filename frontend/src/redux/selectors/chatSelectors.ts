import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { ChatEntry } from '../../types';

export const selectChatEntriesByChatId = createSelector(
  (state: RootState) => state.projects.projectList,
  (projects): Record<string, ChatEntry[]> => {
    const lookup: Record<string, ChatEntry[]> = {};
    for (const project of projects) {
      for (const chat of project.chats) {
        lookup[chat.id] = chat.entries;
      }
    }
    return lookup;
  }
);

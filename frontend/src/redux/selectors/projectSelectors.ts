// redux/selectors/projectSelectors.ts
import { RootState } from '../store';

export const selectSelectedProjectId = (state: RootState): string | null => {
  const selectedChatId = state.projects.selectedChatId;
  if (!selectedChatId) return null;

  for (const project of state.projects.projectList) {
    if (project.chats.some(chat => chat.id === selectedChatId)) {
      return project.id;
    }
  }

  return null;
};

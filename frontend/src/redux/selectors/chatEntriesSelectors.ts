import { RootState } from '../store';

export const selectChatEntries = (state: RootState, chatId: string) =>
  state.chatEntries.entriesByChatId[chatId] || [];

export const selectChatEntriesLoading = (state: RootState, chatId: string) =>
  state.chatEntries.loadingByChatId[chatId] || false;

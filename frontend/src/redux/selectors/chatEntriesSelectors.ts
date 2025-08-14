import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { ChatEntry } from '../../types';

// base slice
const selectChatEntriesState = (s: RootState) => s.chatEntries;

// inputs
const selectIdsByChatId = createSelector(selectChatEntriesState, s => s.idsByChatId);
const selectEntriesById  = createSelector(selectChatEntriesState, s => s.byId);

/**
 * Factory selector: memoized per component instance.
 * Usage:
 *   const sel = useMemo(makeSelectChatEntriesByChatId, []);
 *   const entries = useSelector(s => sel(s, selectedChatId));
 */
export const makeSelectChatEntriesByChatId = () =>
  createSelector(
    [
      selectIdsByChatId,
      selectEntriesById,
      (_: RootState, chatId: string | null | undefined) => chatId
    ],
    (idsByChat, byId, chatId): ChatEntry[] =>
      chatId ? (idsByChat[chatId] || []).map(id => byId[id]).filter(Boolean) as ChatEntry[] : []
  );

/** Optional: count-only variant */
export const makeSelectChatEntryCountByChatId = () =>
  createSelector(
    [selectIdsByChatId, (_: RootState, chatId: string | null | undefined) => chatId],
    (idsByChat, chatId) => (chatId ? (idsByChat[chatId] || []).length : 0)
  );

/** Non-factory (simple) version if you ever need it */
export const selectChatEntriesByChatId = (state: RootState, chatId: string): ChatEntry[] =>
  (state.chatEntries.idsByChatId[chatId] || []).map(id => state.chatEntries.byId[id]).filter(Boolean);

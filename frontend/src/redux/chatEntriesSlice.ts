// redux/chatEntriesSlice.ts
import { createSlice, createAsyncThunk, PayloadAction, nanoid } from '@reduxjs/toolkit';
import axios from 'axios';
import { ChatEntry } from '../types';
import type { RootState } from './store'; // adjust the path if your store file is elsewhere

type EntriesById = Record<string, ChatEntry>;
type State = {
  byId: EntriesById;          // normalized
  idsByChatId: Record<string, string[]>; // chatId -> entry ids
};

// helper to normalize server payload to ChatEntry
const normalizeServerEntry = (e: any): ChatEntry => ({
  id: String(e.id ?? e._id),
  chatId: String(e.chatId),
  projectId: String(e.projectId),
  originalPrompt: e.originalPrompt ?? '',
  promptSummary: e.promptSummary ?? '',
  response: e.response ?? '',
});

// 👉 NEW: fetch entries for a chat (keyword mode)
export const fetchChatEntries = createAsyncThunk<
  { chatId: string; entries: ChatEntry[] },
  { chatId: string },
  { state: RootState }
>('chatEntries/fetchChatEntries', async ({ chatId }) => {
  // Try preferred route first
  try {
    const res = await axios.get(`/api/v1/chats/${chatId}/entries`);
    const entries = (res.data?.entries ?? []).map(normalizeServerEntry);
    return { chatId, entries };
  } catch (firstErr) {
    // Fallback: /api/v1/chat-entries?chatId=...
    const res = await axios.get(`/api/v1/chat-entries`, { params: { chatId } });
    const entries = (res.data?.entries ?? []).map(normalizeServerEntry);
    return { chatId, entries };
  }
});

const initialState: State = { byId: {}, idsByChatId: {} };

// --- optimistic reducers
const slice = createSlice({
  name: 'chatEntries',
  initialState,
  reducers: {
    patchEntryOptimistic(
      state,
      action: PayloadAction<{ id: string; changes: Partial<ChatEntry>; txId: string }>
    ) {
      const { id, changes, txId } = action.payload;
      const prev = state.byId[id];
      if (!prev) return;
      // Stash previous state for potential rollback
      (state.byId[id] as any).__prevByTx ??= {};
      (state.byId[id] as any).__prevByTx[txId] = prev;
      state.byId[id] = { ...prev, ...changes };
    },
    rollbackEntry(state, action: PayloadAction<{ id: string; txId: string }>) {
      const { id, txId } = action.payload;
      const prev = (state.byId[id] as any)?.__prevByTx?.[txId];
      if (prev) {
        state.byId[id] = prev;
        delete (state.byId[id] as any).__prevByTx[txId];
      }
    },
    commitEntry(state, action: PayloadAction<{ id: string; txId: string }>) {
      const { id, txId } = action.payload;
      if ((state.byId[id] as any)?.__prevByTx) {
        delete (state.byId[id] as any).__prevByTx[txId];
      }
    },
    upsertEntriesForChat(
      state,
      action: PayloadAction<{ chatId: string; entries: ChatEntry[] }>
    ) {
      const { chatId, entries } = action.payload;
      state.idsByChatId[chatId] = entries.map((e) => e.id);
      for (const e of entries) state.byId[e.id] = e;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchChatEntries.fulfilled, (state, action) => {
      const { chatId, entries } = action.payload;
      state.idsByChatId[chatId] = entries.map((e) => e.id);
      for (const e of entries) state.byId[e.id] = e;
    });
  },
});

export const {
  patchEntryOptimistic,
  rollbackEntry,
  commitEntry,
  upsertEntriesForChat,
} = slice.actions;

// --- optimistic thunk example
export const updateResponse = createAsyncThunk<
  void,
  { entryId: string; newResponse: string }
>('chatEntries/updateResponse', async ({ entryId, newResponse }, { dispatch }) => {
  const txId = nanoid();
  dispatch(patchEntryOptimistic({ id: entryId, changes: { response: newResponse }, txId }));
  try {
    await axios.patch(`/api/v1/chat-entries/${entryId}`, { response: newResponse });
    dispatch(commitEntry({ id: entryId, txId }));
  } catch (err) {
    dispatch(rollbackEntry({ id: entryId, txId }));
    // (Optional) toast error
  }
});

export default slice.reducer;

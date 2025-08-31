// redux/chatEntriesSlice.ts
import { createSlice, createAsyncThunk, PayloadAction, nanoid } from '@reduxjs/toolkit';
import axios from 'axios';
import { ChatEntry } from '../types';

type EntriesById = Record<string, ChatEntry>;
type State = {
  byId: EntriesById;          // normalized
  idsByChatId: Record<string, string[]>; // chatId -> entry ids
};

// helper to normalize server payload to ChatEntry
const normalizeServerEntry = (e: any): ChatEntry => ({
  entryId: String(e.entryId ?? e._id),
  chatId: String(e.chatId),
  projectId: String(e.projectId),
  originalPrompt: e.originalPrompt ?? '',
  promptSummary: e.promptSummary ?? '',
  response: e.response ?? '',
});

export const fetchChatEntries = createAsyncThunk<
  { chatId: string; entries: ChatEntry[] },
  { chatId: string }
>('chatEntries/fetchChatEntries', async ({ chatId }) => {
  const res = await axios.get('/api/v1/chatEntries', {
    params: { chatId },
    // headers: { 'Cache-Control': 'no-cache' }, // optional
  });

  // ✅ Handle both shapes:
  // - backend returns an array:      res.data = [ ... ]
  // - backend returns an object:     res.data = { entries: [ ... ] }
  const raw = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.entries)
      ? res.data.entries
      : [];

  const entries: ChatEntry[] = raw.map(normalizeServerEntry);
  return { chatId, entries };
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
      state.idsByChatId[chatId] = entries.map((e) => e.entryId);
      for (const e of entries) state.byId[e.entryId] = e;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchChatEntries.fulfilled, (state, action) => {
      const { chatId, entries } = action.payload;
      state.idsByChatId[chatId] = entries.map((e) => e.entryId);
      for (const e of entries) state.byId[e.entryId] = e;
    });
  },
});

export const {
  patchEntryOptimistic,
  rollbackEntry,
  commitEntry,
  upsertEntriesForChat,
} = slice.actions;

export const updateResponse = createAsyncThunk<
  void,
  { entryId: string; newResponse: string }
>('chatEntries/updateResponse', async ({ entryId, newResponse }, { dispatch }) => {
  const txId = nanoid();
  dispatch(patchEntryOptimistic({ id: entryId, changes: { response: newResponse }, txId }));
  try {
    // ✅ use your camelCase route
    await axios.patch(`/api/v1/chatEntries/${entryId}`, { response: newResponse });
    dispatch(commitEntry({ id: entryId, txId }));
  } catch (err) {
    dispatch(rollbackEntry({ id: entryId, txId }));
    // optionally toast
  }
});

export default slice.reducer;

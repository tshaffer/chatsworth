// redux/chatEntriesSlice.ts
import { createSlice, createAsyncThunk, PayloadAction, nanoid } from '@reduxjs/toolkit';
import axios from 'axios';

export interface ChatEntry {
  id: string;
  chatId: string;
  projectId: string;
  originalPrompt: string;
  promptSummary: string;
  response: string;
}

type EntriesById = Record<string, ChatEntry>;
type State = {
  byId: EntriesById;          // normalized
  idsByChatId: Record<string, string[]>; // chatId -> entry ids
};

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

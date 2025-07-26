// redux/chatEntriesSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './store';

export interface ChatEntry {
  _id: string;
  projectId: string;
  chatId: string;
  originalPrompt: string;
  promptSummary: string;
  response: string;
}

interface ChatEntriesState {
  entriesByChatId: Record<string, ChatEntry[]>;
  loadingByChatId: Record<string, boolean>;
  errorByChatId: Record<string, string | null>;
}

const initialState: ChatEntriesState = {
  entriesByChatId: {},
  loadingByChatId: {},
  errorByChatId: {},
};

export const fetchChatEntries = createAsyncThunk<
  ChatEntry[],       // Return type
  string,            // chatId
  { state: RootState }
>('chatEntries/fetchChatEntries', async (chatId, thunkAPI) => {
  const response = await fetch(`/api/v1/chatEntries?chatId=${chatId}`);
  if (!response.ok) throw new Error('Failed to fetch chat entries');
  return await response.json();
});

const chatEntriesSlice = createSlice({
  name: 'chatEntries',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchChatEntries.pending, (state, action) => {
        state.loadingByChatId[action.meta.arg] = true;
        state.errorByChatId[action.meta.arg] = null;
      })
      .addCase(fetchChatEntries.fulfilled, (state, action) => {
        const chatId = action.meta.arg;
        state.entriesByChatId[chatId] = action.payload;
        state.loadingByChatId[chatId] = false;
      })
      .addCase(fetchChatEntries.rejected, (state, action) => {
        const chatId = action.meta.arg;
        state.loadingByChatId[chatId] = false;
        state.errorByChatId[chatId] = action.error.message || 'Unknown error';
      });
  },
});

export default chatEntriesSlice.reducer;

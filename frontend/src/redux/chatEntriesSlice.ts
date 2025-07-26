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

export const updatePromptSummary = createAsyncThunk<
  void,
  { chatEntryId: string; promptSummary: string; chatId: string },
  { dispatch: AppDispatch }
>('chatEntries/updatePromptSummary', async ({ chatEntryId, promptSummary, chatId }, { dispatch }) => {
  await fetch(`/api/v1/chatEntries/${chatEntryId}/promptSummary`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptSummary }),
  });
  dispatch(fetchChatEntries(chatId));
});

export const updateOriginalPrompt = createAsyncThunk<
  void,
  { chatEntryId: string; originalPrompt: string; chatId: string },
  { dispatch: AppDispatch }
>('chatEntries/updateOriginalPrompt', async ({ chatEntryId, originalPrompt, chatId }, { dispatch }) => {
  await fetch(`/api/v1/chatEntries/${chatEntryId}/originalPrompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalPrompt }),
  });
  dispatch(fetchChatEntries(chatId));
});

export const updateResponse = createAsyncThunk<
  void,
  { chatEntryId: string; response: string; chatId: string },
  { dispatch: AppDispatch }
>('chatEntries/updateResponse', async ({ chatEntryId, response, chatId }, { dispatch }) => {
  await fetch(`/api/v1/chatEntries/${chatEntryId}/response`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  });
  dispatch(fetchChatEntries(chatId));
});

export const deleteChatEntry = createAsyncThunk<
  void,
  { chatEntryId: string; chatId: string },
  { dispatch: AppDispatch }
>('chatEntries/deleteChatEntry', async ({ chatEntryId, chatId }, { dispatch }) => {
  await fetch(`/api/v1/chatEntries/${chatEntryId}`, {
    method: 'DELETE',
  });
  dispatch(fetchChatEntries(chatId));
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

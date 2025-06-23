import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ParsedMarkdown } from '../types';

interface ParsedMarkdownState {
  parsedMarkdown: ParsedMarkdown;
}

const initialState: ParsedMarkdownState = {
  parsedMarkdown: {
    projects: [],
  },
};

const parsedMarkdownSlice = createSlice({
  name: 'parsedMarkdown',
  initialState,
  reducers: {
    setParsedMarkdown(state, action: PayloadAction<ParsedMarkdown>) {
      state.parsedMarkdown = action.payload;
    },
    clearParsedMarkdown(state) {
      state.parsedMarkdown = { projects: [] };
    }
  },
});

export const { setParsedMarkdown, clearParsedMarkdown } = parsedMarkdownSlice.actions;
export default parsedMarkdownSlice.reducer;

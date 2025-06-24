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
    },
    appendParsedMarkdown(state, action: PayloadAction<ParsedMarkdown>) {
      const newProjects = action.payload.projects;

      // Optional: prevent duplicates by project.name
      const existingNames = new Set(state.parsedMarkdown.projects.map(p => p.name));
      const filteredProjects = newProjects.filter(p => !existingNames.has(p.name));

      state.parsedMarkdown.projects.push(...filteredProjects);
    },
  },
});

export const { setParsedMarkdown, clearParsedMarkdown, appendParsedMarkdown } = parsedMarkdownSlice.actions;
export default parsedMarkdownSlice.reducer;

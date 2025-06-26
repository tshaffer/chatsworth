import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Projects } from '../types';

interface ProjectsState {
  projects: Projects;
}

const initialState: ProjectsState = {
  projects: {
    projects: [],
  },
};

const parsedMarkdownSlice = createSlice({
  name: 'parsedMarkdown',
  initialState,
  reducers: {
    setParsedMarkdown(state, action: PayloadAction<Projects>) {
      state.projects = action.payload;
    },
    clearProjects(state) {
      state.projects = { projects: [] };
    },
    appendProject(state, action: PayloadAction<Projects>) {
      const newProjects = action.payload.projects;

      // Optional: prevent duplicates by project.name
      const existingNames = new Set(state.projects.projects.map(p => p.name));
      const filteredProjects = newProjects.filter(p => !existingNames.has(p.name));

      state.projects.projects.push(...filteredProjects);
    },
  },
});

export const { setParsedMarkdown, clearProjects: clearParsedMarkdown, appendProject: appendParsedMarkdown } = parsedMarkdownSlice.actions;
export default parsedMarkdownSlice.reducer;

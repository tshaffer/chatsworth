// redux/projectsSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Project, ProjectsState } from '../types';

const initialState: ProjectsState = {
  projects: [],
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setProjects(state, action: PayloadAction<Project[]>) {
      state.projects = action.payload;
    },
    clearProjects(state) {
      state.projects = [];
    },
    appendProjects(state, action: PayloadAction<Project[]>) {
      const existingIds = new Set(state.projects.map((p) => p.id));
      const newProjects = action.payload.filter((p) => !existingIds.has(p.id));
      state.projects.push(...newProjects);
    },
  },
});

export const { setProjects, clearProjects, appendProjects } = projectsSlice.actions;
export default projectsSlice.reducer;

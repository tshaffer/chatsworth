// redux/projectsSlice.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Project, ProjectsState } from '../types';

export const fetchProjects = createAsyncThunk(
  'projects/fetchProjects',
  async () => {
    const response = await axios.get('/api/v1/projects');
    return response.data.projects; // ✅ unwrap the data
  }
);

export const updatePromptSummary = createAsyncThunk<
  { chatId: string; entryIndex: number; promptSummary: string },
  { chatId: string; entryIndex: number; promptSummary: string }
>(
  'projects/updatePromptSummary',
  async ({ chatId, entryIndex, promptSummary }) => {
    await axios.patch(`/api/v1/chat-entries/${chatId}/${entryIndex}`, {
      promptSummary,
    });
    return { chatId, entryIndex, promptSummary };
  }
);

const initialState: ProjectsState = {
  projectList: [],
  selectedChatId: null,
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setProjects(state, action: PayloadAction<Project[]>) {
      state.projectList = action.payload;
    },
    clearProjects(state) {
      state.projectList = [];
    },
    appendProjects(state, action: PayloadAction<Project[]>) {
      const existingIds = new Set(state.projectList.map((p) => p.id));
      const newProjects = action.payload.filter((p) => !existingIds.has(p.id));
      state.projectList.push(...newProjects);
    },
    setSelectedChatId(state, action: PayloadAction<string | null>) {
      state.selectedChatId = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.projectList = action.payload;
      })
      .addCase(updatePromptSummary.fulfilled, (state, action) => {
        const { chatId, entryIndex, promptSummary } = action.payload;

        for (const project of state.projectList) {
          const chat = project.chats.find((c) => c.id === chatId);
          if (chat && chat.entries[entryIndex]) {
            chat.entries[entryIndex].promptSummary = promptSummary;
            break;
          }
        }
      });
  }
});

export const { setProjects, clearProjects, appendProjects, setSelectedChatId } = projectsSlice.actions;
export default projectsSlice.reducer;

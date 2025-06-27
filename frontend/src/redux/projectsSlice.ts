// redux/projectsSlice.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Project, ProjectsState } from '../types';

export const fetchProjects = createAsyncThunk(
  'projects/fetchProjects',
  async () => {
    const response = await axios.get('/api/v1/projects');
    return response.data.projectList; // ✅ unwrap the data
  }
);

export const renameProject = createAsyncThunk<
  { projectId: string; name: string },
  { projectId: string; name: string }
>(
  'projects/renameProject',
  async ({ projectId, name }) => {
    await axios.patch(`/api/v1/projects/${projectId}`, { name });
    return { projectId, name };
  }
);

export const renameChat = createAsyncThunk<
  { chatId: string; title: string },
  { chatId: string; title: string }
>(
  'projects/renameChat',
  async ({ chatId, title }) => {
    await axios.patch(`/api/v1/chats/${chatId}`, { newTitle: title });
    return { chatId, title }; // still return title for local Redux update
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
    },
    appendParsedMarkdown(state, action: PayloadAction<ProjectsState>) {
      const incomingProjects = action.payload.projectList;

      // Avoid duplicates by ID
      const existingIds = new Set(state.projectList.map(p => p.id));
      const newProjects = incomingProjects.filter(p => !existingIds.has(p.id));

      state.projectList.push(...newProjects);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.projectList = action.payload;
      })
      .addCase(renameProject.fulfilled, (state, action) => {
        const { projectId, name } = action.payload;
        const project = state.projectList.find(p => p.id === projectId);
        if (project) {
          project.name = name;
        }
      })
      .addCase(renameChat.fulfilled, (state, action) => {
        const { chatId, title } = action.payload;
        for (const project of state.projectList) {
          const chat = project.chats.find(c => c.id === chatId);
          if (chat) {
            chat.title = title;
            break;
          }
        }
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

export const { setProjects, clearProjects, appendProjects, setSelectedChatId, appendParsedMarkdown } = projectsSlice.actions;
export default projectsSlice.reducer;

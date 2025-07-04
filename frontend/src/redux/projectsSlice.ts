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

export const createProject = createAsyncThunk(
  'projects/createProject',
  async (name: string, thunkAPI) => {
    try {
      const response = await axios.post('/api/v1/projects', { name });
      return response.data;
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data?.error || 'Failed to create project');
    }
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

// In projectsSlice.ts
export const persistReorderedChats = createAsyncThunk<
  { projectId: string; newOrder: string[] },
  { projectId: string; newOrder: string[] }
>('projects/persistReorderedChats', async ({ projectId, newOrder }) => {
  await axios.post(`/api/v1/projects/${projectId}/reorderChats`, { newOrder });
  return { projectId, newOrder };
});

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

export const deleteChat = createAsyncThunk(
  'projects/deleteChat',
  async ({ projectId, chatId }: { projectId: string, chatId: string }, thunkAPI) => {
    try {
      await axios.delete(`/api/v1/projects/${projectId}/chats/${chatId}`);
      return { projectId, chatId };
    } catch (error) {
      console.error('Failed to delete chat:', error);
      return thunkAPI.rejectWithValue('Failed to delete chat');
    }
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

export const deleteChatEntry = createAsyncThunk(
  'projects/deleteChatEntry',
  async ({ chatId, entryIndex }: { chatId: string; entryIndex: number }) => {
    await axios.delete(`/api/v1/chat-entries/${chatId}/${entryIndex}`);
    return { chatId, entryIndex };
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
    reorderChatEntries: (
      state,
      action: PayloadAction<{
        chatId: string;
        entryIndex: number;
        direction: 'up' | 'down';
      }>
    ) => {
      const { chatId, entryIndex, direction } = action.payload;

      for (const project of state.projectList) {
        const chat = project.chats.find(c => c.id === chatId);
        if (!chat) continue;

        const newIndex = direction === 'up' ? entryIndex - 1 : entryIndex + 1;
        if (newIndex < 0 || newIndex >= chat.entries.length) return;

        const temp = chat.entries[entryIndex];
        chat.entries[entryIndex] = chat.entries[newIndex];
        chat.entries[newIndex] = temp;
        break;
      }
    },
    setSelectedChatId(state, action: PayloadAction<string | null>) {
      state.selectedChatId = action.payload;
    },
    appendParsedMarkdown(state, action: PayloadAction<ProjectsState>) {
      const incomingProjects = action.payload.projectList;

      for (const incoming of incomingProjects) {
        const existing = state.projectList.find(p => p.id === incoming.id);

        if (!existing) {
          // New project — add it
          state.projectList.push(incoming);
        } else {
          // Existing project — merge new chats
          const existingChatIds = new Set(existing.chats.map(c => c.id));
          const newChats = incoming.chats.filter(c => !existingChatIds.has(c.id));
          existing.chats.push(...newChats);
        }
      }
    },
    deleteChatFromProject: (state, action: PayloadAction<{ projectId: string, chatId: string }>) => {
      const { projectId, chatId } = action.payload;
      const project = state.projectList.find(p => p.id === projectId);
      if (project) {
        project.chats = project.chats.filter(chat => chat.id !== chatId);
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.projectList = action.payload;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projectList.push(action.payload);
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
      })
      .addCase(deleteChat.fulfilled, (state, action) => {
        const { projectId, chatId } = action.payload;
        const project = state.projectList.find(p => p.id === projectId);
        if (project) {
          project.chats = project.chats.filter(chat => chat.id !== chatId);
        }
      })
      .addCase(deleteChatEntry.fulfilled, (state, action) => {
        const { chatId, entryIndex } = action.payload;
        const project = state.projectList.find(p => p.chats.some(c => c.id === chatId));
        const chat = project?.chats.find(c => c.id === chatId);
        if (chat && entryIndex >= 0 && entryIndex < chat.entries.length) {
          chat.entries.splice(entryIndex, 1);
        }
      })
      .addCase(persistReorderedChats.fulfilled, (state, action) => {
        const { projectId, newOrder } = action.payload;
        const project = state.projectList.find(p => p.id === projectId);
        if (!project) return;

        const chatMap = new Map(project.chats.map(chat => [chat.id, chat]));
        project.chats = newOrder.map(id => chatMap.get(id)).filter(Boolean) as typeof project.chats;
      });
  }
});

export const { setProjects, clearProjects, appendProjects, reorderChatEntries, setSelectedChatId, appendParsedMarkdown } = projectsSlice.actions;
export default projectsSlice.reducer;

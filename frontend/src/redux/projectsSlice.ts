// redux/projectsSlice.ts
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';
import { Chat, Project, ProjectsState } from '../types';

export const fetchProjects = createAsyncThunk(
  'projects/fetchProjects',
  async () => {
    const response = await axios.get('/api/v1/projects');
    return response.data.projectList;
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

export const renameProject = createAsyncThunk(
  'projects/renameProject',
  async ({ projectId, name }: { projectId: string; name: string }) => {
    await axios.patch(`/api/v1/projects/${projectId}`, { name });
    return { projectId, name };
  }
);

export const deleteProject = createAsyncThunk(
  'projects/deleteProject',
  async (projectId: string) => {
    await axios.delete(`/api/v1/projects/${projectId}`);
    return projectId;
  }
);

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
>('projects/renameChat', async ({ chatId, title }) => {
  await axios.patch(`/api/v1/chats/${chatId}`, { newTitle: title });
  return { chatId, title };
});

export const deleteChat = createAsyncThunk(
  'projects/deleteChat',
  async ({ projectId, chatId }: { projectId: string; chatId: string }, thunkAPI) => {
    try {
      await axios.delete(`/api/v1/projects/${projectId}/chats/${chatId}`);
      return { projectId, chatId };
    } catch (error) {
      console.error('Failed to delete chat:', error);
      return thunkAPI.rejectWithValue('Failed to delete chat');
    }
  }
);

export const moveChatToProject = createAsyncThunk<
  { chatId: string; sourceProjectId: string; targetProjectId: string },
  { chatId: string; sourceProjectId: string; targetProjectId: string }
>('projects/moveChatToProject', async ({ chatId, sourceProjectId, targetProjectId }) => {
  await axios.post('/api/v1/projects/moveChat', {
    chatId,
    sourceProjectId,
    targetProjectId,
  });
  return { chatId, sourceProjectId, targetProjectId };
});

const initialState: ProjectsState = {
  projectList: [],
  selectedChatId: null,
};

function findProjectAndChatById(state: ProjectsState, chatId: string) {
  for (const project of state.projectList) {
    const chat = project.chats.find(c => c.id === chatId);
    if (chat) return { projectId: project.id, chat };
  }
  return undefined;
}

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
      for (const incoming of incomingProjects) {
        const existing = state.projectList.find(p => p.id === incoming.id);
        if (!existing) {
          state.projectList.push(incoming);
        } else {
          const existingChatIds = new Set(existing.chats.map(c => c.id));
          const newChats = incoming.chats.filter(c => !existingChatIds.has(c.id));
          existing.chats.push(...newChats);
        }
      }
    },
    deleteChatFromProject(state, action: PayloadAction<{ projectId: string; chatId: string }>) {
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
        if (project) project.name = name;
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projectList = state.projectList.filter(p => p.id !== action.payload);
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
      .addCase(deleteChat.fulfilled, (state, action) => {
        const { projectId, chatId } = action.payload;
        const project = state.projectList.find(p => p.id === projectId);
        if (project) {
          project.chats = project.chats.filter(chat => chat.id !== chatId);
        }
      })
      .addCase(persistReorderedChats.fulfilled, (state, action) => {
        const { projectId, newOrder } = action.payload;
        const project = state.projectList.find(p => p.id === projectId);
        if (!project) return;
        const chatMap = new Map(project.chats.map(chat => [chat.id, chat]));
        project.chats = newOrder.map(id => chatMap.get(id)).filter(Boolean) as Chat[];
      })
      .addCase(moveChatToProject.fulfilled, (state, action) => {
        const { chatId, sourceProjectId, targetProjectId } = action.payload;
        const source = state.projectList.find(p => p.id === sourceProjectId);
        const target = state.projectList.find(p => p.id === targetProjectId);
        if (source && target) {
          const index = source.chats.findIndex(c => c.id === chatId);
          if (index !== -1) {
            const [chat] = source.chats.splice(index, 1);
            target.chats.push(chat);
          }
        }
        if (state.selectedChatId === chatId) {
          state.selectedChatId = null;
        }
      });
  }
});

export const {
  setProjects,
  clearProjects,
  appendProjects,
  setSelectedChatId,
  appendParsedMarkdown,
  deleteChatFromProject
} = projectsSlice.actions;

export default projectsSlice.reducer;

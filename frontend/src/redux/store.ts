// redux/store.ts
import { configureStore } from '@reduxjs/toolkit';
import chatEntriesReducer from './chatEntriesSlice';
import projectsReducer from './projectsSlice';

export const store = configureStore({
  reducer: {
    projects: projectsReducer,
    chatEntries: chatEntriesReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

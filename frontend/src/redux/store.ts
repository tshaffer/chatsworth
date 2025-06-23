import { configureStore } from '@reduxjs/toolkit';
import parsedMarkdownReducer from './parsedMarkdownSlice';

export const store = configureStore({
  reducer: {
    parsedMarkdown: parsedMarkdownReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

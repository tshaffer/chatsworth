import express from 'express';
import {
  createProject,
  deleteChat,
  deleteChatEntry,
  deleteProject,
  exportChat,
  getVersion,
  markdownImporterEndpoint,
  moveChatEntry,
  moveChatToProject,
  renameOrMoveChat,
  renameProject,
  reorderChatEntries,
  reorderChats,
  updateChatEntryOriginalPrompt,
  updateChatEntryPromptSummary,
  updateChatEntryResponse,
} from '../controllers';
import { getProjects } from '../controllers/projects';

export const createRoutes = (app: express.Application) => {
  app.get('/api/v1/version', getVersion);

  app.get('/api/v1/projects', getProjects);

  app.post('/api/v1/importMarkdown', markdownImporterEndpoint);

  app.post('/api/v1/projects', createProject);
  app.post('/api/v1/projects/:projectId/reorderChats', reorderChats);
  app.patch('/api/v1/projects/:projectId', renameProject);
  app.delete('/api/v1/projects/:projectId', deleteProject);

  app.get('/api/v1/chats/:chatId/export', exportChat);
  app.patch('/api/v1/chats/:chatId', renameOrMoveChat);
  app.delete('/api/v1/projects/:projectId/chats/:chatId', deleteChat);
  app.post('/api/v1/chats/:chatId/reorderEntries', reorderChatEntries);

  app.patch('/api/v1/chat-entries/promptSummary/:chatId/:entryIndex', updateChatEntryPromptSummary);
  app.patch('/api/v1/chat-entries/originalPrompt/:chatId/:entryIndex', updateChatEntryOriginalPrompt);
  app.patch('/api/v1/chat-entries/response/:chatId/:entryIndex', updateChatEntryResponse);

  app.delete('/api/v1/chat-entries/:chatId/:entryIndex', deleteChatEntry);
  app.post('/api/v1/chat-entries/moveChat', moveChatEntry);

  // routes/projectRoutes.ts
  app.post('/api/v1/projects/moveChat', moveChatToProject);

};

import express from 'express';
import {
  createProject,
  deleteChat,
  deleteChatEntry,
  deleteProject,
  exportChat,
  getChatEntries,
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
import { searchRoutes } from '../controllers/search';
import { semanticSearchRoute } from '../controllers/semanticSearch';

export const createRoutes = (app: express.Application) => {
  app.get('/api/v1/version', getVersion);

  app.get('/api/v1/projects', getProjects);

  app.get('/api/v1/search', searchRoutes);
  app.post('/api/v1/semantic-search', semanticSearchRoute);

  app.post('/api/v1/importMarkdown', markdownImporterEndpoint);

  app.post('/api/v1/projects', createProject);
  app.post('/api/v1/projects/:projectId/reorderChats', reorderChats);
  app.patch('/api/v1/projects/:projectId', renameProject);
  app.delete('/api/v1/projects/:projectId', deleteProject);

  app.get('/api/v1/chats/:chatId/export', exportChat);
  app.patch('/api/v1/chats/:chatId', renameOrMoveChat);
  app.delete('/api/v1/projects/:projectId/chats/:chatId', deleteChat);

  app.get('/api/v1/chatEntries', getChatEntries);
  app.post('/api/v1/chat-entries/moveChat', moveChatEntry);
  app.post('/api/v1/chats/:chatId/reorderEntries', reorderChatEntries);

  app.patch('/api/v1/chatEntries/:id/promptSummary', updateChatEntryPromptSummary);
  app.patch('/api/v1/chatEntries/:id/originalPrompt', updateChatEntryOriginalPrompt);
  app.patch('/api/v1/chatEntries/:id/response', updateChatEntryResponse);
  app.delete('/api/v1/chatEntries/:id', deleteChatEntry);

  app.post('/api/v1/projects/moveChat', moveChatToProject);

};

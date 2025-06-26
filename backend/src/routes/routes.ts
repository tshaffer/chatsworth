import express from 'express';
import {
  createProject,
  deleteChat,
  deleteChatEntry,
  deleteProject,
  getVersion,
  markdownImporterEndpoint,
  renameOrMoveChat,
  renameProject,
  updateChatEntry,
} from '../controllers';
import { getProjects } from '../controllers/projects';

export const createRoutes = (app: express.Application) => {
  app.get('/api/v1/version', getVersion);

  app.get('/api/v1/projects', getProjects);

  app.post('/api/v1/importMarkdown', markdownImporterEndpoint);

  app.post('/api/v1/projects', createProject);
  app.patch('/api/v1/projects/:projectId', renameProject);
  app.delete('/api/v1/projects/:projectId', deleteProject);

  app.patch('/api/v1/chats/:chatId', renameOrMoveChat);
  app.delete('/api/v1/chats/:chatId', deleteChat);

  app.patch('/api/v1/chat-entries/:chatId/:entryIndex', updateChatEntry);
  app.delete('/api/v1/chat-entries/:chatId/:entryIndex', deleteChatEntry);

};

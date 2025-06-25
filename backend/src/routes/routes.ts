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

  app.post('/projects', createProject);
  app.patch('/projects/:projectId', renameProject);
  app.delete('/projects/:projectId', deleteProject);

  app.patch('/chats/:chatId', renameOrMoveChat);
  app.delete('/chats/:chatId', deleteChat);

  app.patch('/chat-entries/:chatId/:entryIndex', updateChatEntry);
  app.delete('/chat-entries/:chatId/:entryIndex', deleteChatEntry);

};


/*
✅ Project Routes

Create Project
POST /api/projects

Rename Project
PATCH /api/projects/:projectId

Delete Project
DELETE /api/projects/:projectId

✅ Chat Routes

Rename or Move Chat to another Project
PATCH /api/chats/:chatId

Delete Chat
DELETE /api/chats/:chatId

✅ ChatEntry Routes

Edit promptSummary or reorder entries
PATCH /api/chat-entries/:chatId/:entryIndex

Delete ChatEntry
DELETE /api/chat-entries/:chatId/:entryIndex
*/

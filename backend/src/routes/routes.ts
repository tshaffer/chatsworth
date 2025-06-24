import express from 'express';
import {
  getVersion,
  markdownImporterEndpoint,
} from '../controllers';
import { getProjects } from '../controllers/projects';

export const createRoutes = (app: express.Application) => {
  app.get('/api/v1/version', getVersion);

  app.get('/api/v1/projects', getProjects);

  app.post('/api/v1/importMarkdown', markdownImporterEndpoint);

};


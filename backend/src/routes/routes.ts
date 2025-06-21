import express from 'express';
import {
  getVersion,
  markdownImporterEndpoint,
} from '../controllers';

export const createRoutes = (app: express.Application) => {
  app.get('/api/v1/version', getVersion);

    app.post('/api/v1/importPhotos', markdownImporterEndpoint);

};


import express from 'express';
import {
  getVersion,
} from '../controllers';

export const createRoutes = (app: express.Application) => {
  app.get('/api/v1/version', getVersion);
};


import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import { connectDB } from './config';
import { createRoutes } from './routes';
const bodyParser = require('body-parser');
import { Server } from 'http';
import path from 'path';

console.log('This is a placeholder for the server code.');

dotenv.config();

const startServer = async () => {

  await connectDB();  // ✅ Ensure DB is connected before anything else

  // Initialize Express app
  const app: express.Application = express();
  const PORT = process.env.PORT || 8080;

  app.use(cors());
  app.use(express.json());

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

    // add routes
  createRoutes(app);

  // === Environment Configuration Endpoint ===
  app.get('/env-config.json', (req, res) => {
    res.json({
      BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8080',
    });
  });

    // Serve static files from the /public directory
  app.use(express.static(path.join(__dirname, '../public')));

  // Serve the SPA on the root route (index.html)
  app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
  });

  // Start the server
  const server: Server<any> = app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });

  process.on('unhandledRejection', (err: any, promise: any) => {
    console.log(`Error: ${err.message}`);
    // Close server and exit process
    server.close(() => process.exit(1));
  });

}

startServer();
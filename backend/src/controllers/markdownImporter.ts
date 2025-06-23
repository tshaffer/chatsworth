// markdownImporter.ts

import { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { extractChatEntriesPreservingMarkdown, extractMarkdownMetadata } from '../utilities/parseChatMarkdown';
import { ParsedMarkdown, Project, Chat } from '../types';

export const markdownImporterEndpoint = async (request: Request, response: Response) => {
  const storage = multer.memoryStorage(); // Use memory storage for simplicity
  const upload = multer({ storage });

  upload.array('files')(request, response, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return response.status(500).json({ error: 'Upload failed' });
    }

    const files = request.files as Express.Multer.File[];
    const projectsMap: Map<string, Project> = new Map();

    for (const file of files) {
      const markdown = file.buffer.toString('utf-8');

      const metadata = extractMarkdownMetadata(markdown);
      const entries = extractChatEntriesPreservingMarkdown(markdown);

      const chat: Chat = {
        id: uuidv4(),
        title: metadata?.title || file.originalname,
        metadata,
        entries
      };

      // Use metadata.user or fallback to "Default Project"
      const projectName = metadata?.user || 'Default Project';
      if (!projectsMap.has(projectName)) {
        projectsMap.set(projectName, {
          id: uuidv4(),
          name: projectName,
          chats: []
        });
      }

      projectsMap.get(projectName)!.chats.push(chat);
    }

    const parsedMarkdown: ParsedMarkdown = {
      projects: Array.from(projectsMap.values())
    };

    return response.json(parsedMarkdown);
  });
};

// markdownImporter.ts

import { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extractChatEntriesPreservingMarkdown, extractMarkdownMetadata } from '../utilities/parseChatMarkdown';
import { ParsedMarkdown, Project, Chat } from '../types';
import { ProjectModel } from '../models/Project'; // import the Mongoose model

export const markdownImporterEndpoint = async (request: Request, response: Response) => {
  const storage = multer.memoryStorage();
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
      const projectName =
        metadata?.user && metadata?.created
          ? metadata.user + metadata.created
          : 'Default Project ' + new Date().toISOString();
      if (!projectsMap.has(projectName)) {
        projectsMap.set(projectName, {
          id: uuidv4(),
          name: projectName,
          chats: []
        });
      }

      projectsMap.get(projectName)!.chats.push(chat);
    }

    // Convert Map to array of Project documents and insert
    const parsedProjects = Array.from(projectsMap.values());

    // Save all projects (replace if same name exists)
    const saveResults = await Promise.all(parsedProjects.map(async (proj) => {
      await ProjectModel.findOneAndDelete({ name: proj.name });
      const newProj = new ProjectModel(proj);
      const saved = await newProj.save();
      return saved.toObject(); // Convert to plain JS object
    }));

    const parsedMarkdown: ParsedMarkdown = {
      projects: saveResults as Project[] // Safe now that they are plain objects
    };

    return response.json(parsedMarkdown);
  });
};

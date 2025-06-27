// markdownImporter.ts

import { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extractChatEntriesPreservingMarkdown, extractMarkdownMetadata } from '../utilities/parseChatMarkdown';
import { ProjectsState, Project, Chat } from '../types';
import { ProjectModel } from '../models/Project';

export const markdownImporterEndpoint = async (request: Request, response: Response) => {
  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  upload.array('files')(request, response, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return response.status(500).json({ error: 'Upload failed' });
    }

    const files = request.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return response.status(400).json({ error: 'No files uploaded' });
    }

    // Read project name from the form field
    const projectNameFromForm = (request.body.projectName || '').trim();

    // If multiple files are uploaded, we may want to suffix them or handle differently.
    const projectsMap: Map<string, Project> = new Map();

    for (const file of files) {
      const markdown = file.buffer.toString('utf-8');
      const metadata = extractMarkdownMetadata(markdown);
      const entries = extractChatEntriesPreservingMarkdown(markdown);

      const chat: Chat = {
        id: uuidv4(),
        title: metadata?.title || file.originalname,
        metadata,
        entries,
      };

      // Determine the project name
      const projectName =
        projectNameFromForm ||
        (metadata?.user && metadata?.created
          ? `${metadata.user}${metadata.created}`
          : `Default Project ${new Date().toISOString()}`);

      if (!projectsMap.has(projectName)) {
        projectsMap.set(projectName, {
          id: uuidv4(),
          name: projectName,
          chats: [],
        });
      }

      projectsMap.get(projectName)!.chats.push(chat);
    }

    const parsedProjects = Array.from(projectsMap.values());

    // Replace any existing projects with the same name
    const saveResults = await Promise.all(parsedProjects.map(async (proj) => {
      await ProjectModel.findOneAndDelete({ name: proj.name });
      const newProj = new ProjectModel(proj);
      const saved = await newProj.save();
      return saved.toObject(); // Convert to plain JS object
    }));

    const parsedMarkdown: ProjectsState = {
      projectList: saveResults as Project[],
    };

    return response.json(parsedMarkdown);
  });
};

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

    // Optional values from FormData
    const projectId = request.body.projectId?.trim();
    const projectNameFromForm = request.body.projectName?.trim();

    const chatsFromFiles: Chat[] = [];

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

      chatsFromFiles.push(chat);
    }

    let savedProject;

    // CASE 1: Append to existing project
    if (projectId) {
      const existingProject = await ProjectModel.findOne({ id: projectId });
      if (!existingProject) {
        return response.status(404).json({ error: 'Project not found' });
      }

      existingProject.chats.push(...chatsFromFiles);
      savedProject = await existingProject.save();

    } else {
      // CASE 2: Create a new project
      const newProject: Project = {
        id: uuidv4(),
        name: projectNameFromForm || `Imported Project ${new Date().toISOString()}`,
        chats: chatsFromFiles,
      };

      savedProject = await new ProjectModel(newProject).save();
    }

    const projectsState: ProjectsState = {
      projectList: [savedProject.toObject()],
    };

    return response.json(projectsState);
  });
};

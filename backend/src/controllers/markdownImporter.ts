import { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extractChatEntriesPreservingMarkdown, extractMarkdownMetadata } from '../utilities/parseChatMarkdown';
import { ProjectsState, Project, Chat, ChatEntry } from '../types';
import { ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';

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

    const projectIdFromForm = request.body.projectId?.trim();
    const projectNameFromForm = request.body.projectName?.trim();

    const chatsFromFiles: Chat[] = [];
    const chatEntryDocsToInsert: ChatEntry[] = [];

    // Step 1: Parse all uploaded files into Chat and ChatEntry objects
    for (const file of files) {
      const markdown = file.buffer.toString('utf-8');
      const metadata = extractMarkdownMetadata(markdown);
      const entries = extractChatEntriesPreservingMarkdown(markdown);
      const chatId = uuidv4();

      const chat: Chat = {
        id: chatId,
        title: metadata?.title || file.originalname,
        metadata,
      };
      chatsFromFiles.push(chat);

      entries.forEach((entry, index) => {
        chatEntryDocsToInsert.push({
          chatId,
          projectId: '', // to be filled in later
          originalPrompt: entry.originalPrompt,
          promptSummary: entry.promptSummary,
          response: entry.response,
          position: index,
        });
      });
    }

    let savedProject: Project;

    // Step 2: Handle new or existing project
    if (projectIdFromForm) {
      const existingProject = await ProjectModel.findOne({ id: projectIdFromForm });
      if (!existingProject) {
        return response.status(404).json({ error: 'Project not found' });
      }

      // Assign the existing projectId to each ChatEntry
      chatEntryDocsToInsert.forEach(entry => {
        entry.projectId = existingProject.id;
      });

      existingProject.chats.push(...chatsFromFiles);
      savedProject = await existingProject.save();
    } else {
      const newProjectId = uuidv4();
      const newProject: Project = {
        id: newProjectId,
        name: projectNameFromForm?.trim() || `Imported Project ${new Date().toISOString()}`,
        chats: chatsFromFiles,
      };

      // Assign the new projectId to each ChatEntry
      chatEntryDocsToInsert.forEach(entry => {
        entry.projectId = newProjectId;
      });

      const savedProjectDoc = await new ProjectModel(newProject).save();
      savedProject = savedProjectDoc.toObject() as Project; // Now a plain Project
    }

    // Step 3: Insert all chat entries
    await ChatEntryModel.insertMany(chatEntryDocsToInsert);

    const projectsState: ProjectsState = {
      projectList: [savedProject],
    };

    return response.json(projectsState);
  });
};

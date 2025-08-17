import { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extractChatEntriesPreservingMarkdown, extractMarkdownMetadata } from '../utilities/parseChatMarkdown';
import { ProjectsState, Project, Chat, ChatEntry, MarkdownMetadata } from '../types';
import { ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';
const fs = require('fs').promises; // Use the promise-based version for async/await
import path from 'path';

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

export type Classification =
  | 'NOT_IMPORTED'
  | 'IMPORTED_UNCHANGED'
  | 'IMPORTED_AND_UPDATED';


export interface MarkdownFileData {
  filePath: string;
  metadata: MarkdownMetadata;
  classification?: Classification;
}

export const parseMarkdownFiles = async (filePaths: string[]): Promise<MarkdownFileData[]> => {
  const markdownFilesData: MarkdownFileData[] = [];
  for (const filePath of filePaths) {
    const markdown: string = await fs.readFile(filePath, 'utf-8');
    const metadata: MarkdownMetadata = extractMarkdownMetadata(markdown);
    markdownFilesData.push({ filePath, metadata });
  }
  return Promise.resolve(markdownFilesData);
}

const pizza = async (project: any, markdownFilesData: MarkdownFileData[]) => {
  for (const markdownFileData of markdownFilesData) {

    const chatsFromFiles: Chat[] = [];
    const chatEntryDocsToInsert: ChatEntry[] = [];

    if (markdownFileData.classification === 'NOT_IMPORTED') {
      console.log(`Importing file ${markdownFileData.filePath} as it is marked NOT_IMPORTED`);
      const markdownFilePath: string = markdownFileData.filePath;
      const markdownFileName = path.basename(markdownFilePath, '.md');
      const markdownFileContent: string = await fs.readFile(markdownFilePath, 'utf-8');
      console.log('Markdown file content:', markdownFileContent);

      const metadata = extractMarkdownMetadata(markdownFileContent);
      const entries = extractChatEntriesPreservingMarkdown(markdownFileContent);
      const chatId = uuidv4();

      const chat: Chat = {
        id: chatId,
        title: metadata?.title || markdownFileName,
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

      // Assign the existing projectId to each ChatEntry
      chatEntryDocsToInsert.forEach(entry => {
        entry.projectId = project.id;
      });

      project.chats.push(...chatsFromFiles);
      // await project.save();

      // await ChatEntryModel.insertMany(chatEntryDocsToInsert);


    } else {
      console.log('Skipping file import as it is not marked NOT_IMPORTED:', markdownFileData.filePath);
    }
  }
};

export const importMarkdownFiles = async (projectName: string, markdownFilesData: MarkdownFileData[]): Promise<any> => {

  const project = await ProjectModel.findOne({ name: projectName }).lean();
  console.log('Project fineOne result:', project);
  if (!project) {
    throw new Error(`Project with name ${projectName} not found`);
  }

  console.log('Importing markdown files for project:', projectName);
  await pizza(project, markdownFilesData);
  console.log('Markdown files data:', markdownFilesData);
  return;

  for (const markdownFileData of markdownFilesData) {

    const chatsFromFiles: Chat[] = [];
    const chatEntryDocsToInsert: ChatEntry[] = [];

    if (markdownFileData.classification === 'NOT_IMPORTED') {
      console.log(`Importing file ${markdownFileData.filePath} as it is marked NOT_IMPORTED`);

      const markdownFilePath: string = markdownFileData.filePath;
      const markdownFileName = path.basename(markdownFilePath, '.md');
      console.log(`Importing new markdown file: ${markdownFileData.filePath}`);
      const markdownFileContent: string = await fs.readFile(markdownFilePath, 'utf-8');

      const metadata = extractMarkdownMetadata(markdownFileContent);
      const entries = extractChatEntriesPreservingMarkdown(markdownFileContent);
      const chatId = uuidv4();

      const chat: Chat = {
        id: chatId,
        title: metadata?.title || markdownFileName,
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

      // Assign the existing projectId to each ChatEntry
      chatEntryDocsToInsert.forEach(entry => {
        entry.projectId = project.id;
      });

      project.chats.push(...chatsFromFiles);
      // await project.save();

      // await ChatEntryModel.insertMany(chatEntryDocsToInsert);

    } else {
      console.log('Skipping file import as it is not marked NOT_IMPORTED:', markdownFileData.filePath);
      return;
    }
  };
}
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
      const metadata: MarkdownMetadata = extractMarkdownMetadata(markdown);
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

function updateKeyToMarkdownFilesByKeyMap(map: Record<string, MarkdownFileData>, key: string, markdownFileData: MarkdownFileData): void {
  if (!map[key]) {
    map[key] = markdownFileData;
  } else {
    const existingMarkdownFileData: MarkdownFileData = map[key];
    const existingMarkdownMetadata: MarkdownMetadata = existingMarkdownFileData.metadata;
    const existingUpdated = existingMarkdownMetadata.updated;

    const newMarkdownMetadata: MarkdownMetadata = markdownFileData.metadata;
    const newUpdated = newMarkdownMetadata.updated;

    if (existingUpdated === newUpdated) {
      // Exact duplicate found
      return;
    }

    if (existingUpdated < newUpdated) {
      // Newer version found, replace existing chat
      map[key] = markdownFileData;
    }
  }
}

export const parseMarkdownFiles = async (filePaths: string[]): Promise<Record<string, MarkdownFileData>> => {
  const markDownFilesDataByKey: Record<string, MarkdownFileData> = {};
  for (const filePath of filePaths) {
    const markdown: string = await fs.readFile(filePath, 'utf-8');
    const metadata: MarkdownMetadata = extractMarkdownMetadata(markdown);
    const markdownFileName = path.basename(filePath, '.md');
    if (!metadata) {
      console.warn(`No metadata found in file: ${filePath}`);
      continue;
    }
    const key = generateKeyFromMetadata(markdownFileName, metadata);
    const markdownFileData: MarkdownFileData = {
      filePath,
      metadata,
    };
    updateKeyToMarkdownFilesByKeyMap(markDownFilesDataByKey, key, markdownFileData);
  }
  return Promise.resolve(markDownFilesDataByKey);
}

const performMarkdownFilesImport = async (project: any, markdownFilesData: Record<string, MarkdownFileData>) => {

  for (const key in markdownFilesData) {
    const markdownFileData = markdownFilesData[key];

    const chatsFromFiles: Chat[] = [];
    const chatEntryDocsToInsert: ChatEntry[] = [];

    if (markdownFileData.classification === 'NOT_IMPORTED') {
      const markdownFilePath: string = markdownFileData.filePath;
      const markdownFileName = path.basename(markdownFilePath, '.md');
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
      await project.save();

      await ChatEntryModel.insertMany(chatEntryDocsToInsert);
    }
  }
};

export const importMarkdownFiles = async (projectName: string, markdownFilesDataByKey: Record<string, MarkdownFileData>): Promise<any> => {

  const project = await ProjectModel.findOne({ name: projectName });

  if (!project) {
    throw new Error(`Project with name ${projectName} not found`);
  }

  await performMarkdownFilesImport(project, markdownFilesDataByKey);

  console.log(`Markdown files imported successfully for project: ${projectName}`);
}

export const generateKeyFromMetadata = (titleFromFileName: string, metadata: MarkdownMetadata): string => {
  let key = metadata?.title || titleFromFileName;
  key += metadata.user;
  key += metadata.created;
  return key;
}
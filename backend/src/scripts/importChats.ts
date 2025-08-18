import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});
const fs = require('fs').promises;
import path from 'path';
import { ProjectModel } from "../models";

import { parseMarkdownFiles, MarkdownFileData, importMarkdownFiles, generateKeyFromMetadata } from '../controllers';
import { connectDB } from '../config/db';
import { Chat, MarkdownMetadata, Project } from '../types';

/**
 * HOW TO USE
 * ---------
 *    npx ts-node src/scripts/importChats.ts --chatsDirectory=<directory>
 *
 * Examples:
 *    npx ts-node src/scripts/importChats.ts --chatsDirectory=/Users/tedshaffer/Documents/ChatGPTExports
 *    npx ts-node src/scripts/importChats.ts --chatsDirectory=/Users/tedshaffer/Documents/ChatGPTExports/miscellaneous
 */

type CLI = {
  projectName: string;
  chatsDirectory: string;
};

function parseArgs(): CLI {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const ix = args.findIndex(a => a.startsWith(`--${key}=`));
    if (ix >= 0) return args[ix].split('=')[1];
    const present = args.includes(`--${key}`);
    return present ? '' : undefined;
  };

  const cli: CLI = {
    projectName: get('projectName'),
    chatsDirectory: get('chatsDirectory'),
  };
  return cli;
}

// for future use
function stripNumberSuffixMd(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\s*\(\d+\)(?=\.md$)/i, '');
  return path.join(dir, base);
}

async function getAllMarkdownFilePaths(dirPath: string): Promise<string[]> {
  let files: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await getAllMarkdownFilePaths(fullPath)); // Recursively call for subdirectories
    } else {
      if (fullPath.toLowerCase().endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function generateMarkDownFilesDataByKey(chatsDirectory: string): Promise<Record<string, MarkdownFileData>> {
  const allFilePaths: string[] = await getAllMarkdownFilePaths(chatsDirectory);
  const markDownFilesDataByKey: Record<string, MarkdownFileData> = await parseMarkdownFiles(allFilePaths);
  return markDownFilesDataByKey;
}

// diagnostic function to check for duplicate titles in a project
function checkForDuplicateTitles(project: Project) {
  const chatsSortedByTitle = project.chats.sort((a, b) => a.title.localeCompare(b.title));
  console.log(chatsSortedByTitle);

  // see if any chats have duplicate titles
  const titleCounts: Record<string, number> = {};
  for (const chat of chatsSortedByTitle) {
    if (!chat.metadata) {
      throw new Error(`Chat ${chat.id} in project ${project.id} is missing metadata`);
    }
    const title = chat.metadata.title || chat.title;
    if (!title || title.trim() === '') {
      throw new Error(`Chat ${chat.id} in project ${project.id} is missing title or metadata.title`);
    }
    titleCounts[title] = (titleCounts[title] || 0) + 1;
  }
  console.log('Looking for duplicate titles in project:', project.id);
  for (const [title, count] of Object.entries(titleCounts)) {
    if (count > 1) {
      console.warn(`Warning: Project ${project.id} has ${count} chats with the title "${title}"`);
    }
  }
}

function updateDbKeyToChatMap(map: Record<string, Chat>, key: string, chat: Chat) {

  // map is the mapping of key to the chat for the db chat documents 
  // key is the unique identifier for the chat, a combination of title, user, and created date
  // Chat is the document from the db

  // Chat doesn't exist in db, so add it to the map
  if (!map[key]) {
    map[key] = chat;
  }

  /* Chat exists in db
    check for exact duplicate (same key; same updated date)
      if yes, skip this
    different version (same key; different updated date)
      compare updatedKey to updatedKey for existing chat in the map
        older or equal to than existing updatedKey: discard
        newer than existing updatedKey: replacing existing chat
  */
  // Exists, so check if it's the same
  const existingChat: Chat = map[key];
  const existingChatMetadata: MarkdownMetadata = existingChat.metadata;
  if (!existingChatMetadata) {
    throw new Error(`Chat ${chat.id} in project ${chat.id} is missing metadata`);
  }
  const existingUpdated = existingChatMetadata.updated;

  const newChatMetadata: MarkdownMetadata = chat.metadata;
  if (!newChatMetadata) {
    throw new Error(`Chat ${chat.id} in project ${chat.id} is missing metadata`);
  }
  const newUpdated = newChatMetadata.updated;

  if (existingUpdated === newUpdated) {
    // Exact duplicate found
    return;
  }

  if (existingUpdated < newUpdated) {
    // Newer version found, replace existing chat
    map[key] = chat;
  }
  // If existingUpdated > newUpdated, we discard the new chat
  // as it is older or equal to the existing chat in the map.
  // No action needed in this case.

}

async function generateChatsInDbByKey(): Promise<Record<string, Chat>> {
  const map: Record<string, Chat> = {};
  const projects: Project[] = await ProjectModel.find().lean();
  for (const project of projects) {

    checkForDuplicateTitles(project);

    for (const chat of project.chats) {

      if (!chat.metadata) {
        throw new Error(`Chat ${chat.id} in project ${project.id} is missing metadata`);
      }

      const key = generateKeyFromMetadata(chat.title, chat.metadata);

      if (!key) {
        throw new Error(`Chat ${chat.id} in project ${project.id} is missing key`);
      }

      updateDbKeyToChatMap(map, key, chat);
    }
  }
  return map;
}

function classifyMarkdownImports(markdownFileData: Record<string, MarkdownFileData>, chatsInDbByKey: Record<string, Chat>): void {
  for (const key in markdownFileData) {
    const markdownDataForFile = markdownFileData[key];
    if (!markdownDataForFile.metadata) {
      console.log(`Markdown file ${markdownDataForFile.filePath} is missing metadata`);
      continue;
    }
    const existingChatInDb = chatsInDbByKey[key];
    if (!existingChatInDb) {
      // no match; new file.
      markdownDataForFile.classification = 'NOT_IMPORTED';
    }
    else if (existingChatInDb .metadata?.updated === markdownDataForFile.metadata.updated) {
      // match found, no changes
      markdownDataForFile.classification = 'IMPORTED_UNCHANGED';
    } else {
      // match found, but updated
      markdownDataForFile.classification = 'IMPORTED_AND_UPDATED';
    }
  }
}

async function main() {

  const cli = parseArgs();
  if (!cli.chatsDirectory) {
    throw new Error('Missing required argument: --chatsDirectory');
  }

  await connectDB()

  try {

    const markdownFilesDataByKey: Record<string, MarkdownFileData> = await generateMarkDownFilesDataByKey(cli.chatsDirectory);

    const chatsInDbByKey: Record<string, Chat> = await generateChatsInDbByKey();
    console.log('Chats by Key:', chatsInDbByKey);

    classifyMarkdownImports(markdownFilesDataByKey, chatsInDbByKey);
    console.log('Markdown File Data:', markdownFilesDataByKey);

    await importMarkdownFiles(cli.projectName, markdownFilesDataByKey);
    console.log('Markdown files imported successfully.');

  } catch (error) {
    console.error('Error reading files:', error);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});

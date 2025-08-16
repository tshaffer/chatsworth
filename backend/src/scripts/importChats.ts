import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});
const fs = require('fs').promises;
import path from 'path';
import { ProjectModel } from "../models";

import { parseMarkdownFiles, MarkdownFileData } from '../controllers';
import { connectDB } from '../config/db';
import { Chat, Project } from '../types';

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
  chatsDirectory: string;
};

type Classification =
  | 'NOT_IMPORTED'
  | 'IMPORTED_UNCHANGED'
  | 'IMPORTED_AND_UPDATED';

function parseArgs(): CLI {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const ix = args.findIndex(a => a.startsWith(`--${key}=`));
    if (ix >= 0) return args[ix].split('=')[1];
    const present = args.includes(`--${key}`);
    return present ? '' : undefined;
  };

  const cli: CLI = {
    chatsDirectory: get('chatsDirectory'),
  };
  return cli;
}

async function getAllMarkdownFiles(dirPath: string): Promise<string[]> {
  let files: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await getAllMarkdownFiles(fullPath)); // Recursively call for subdirectories
    } else {
      if (fullPath.toLowerCase().endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function getMarkdownFileData(chatsDirectory: string): Promise<MarkdownFileData[]> {
  const allFiles: string[] = await getAllMarkdownFiles(chatsDirectory);
  const markdownFileData: MarkdownFileData[] = await parseMarkdownFiles(allFiles);
  return markdownFileData;
}

async function getChatsByBaseHash(): Promise<Record<string, Chat[]>> {
  const map: Record<string, Chat[]> = {};
  const projects: Project[] = await ProjectModel.find().lean();
  for (const project of projects) {
    for (const chat of project.chats) {
      if (!chat.metadata) {
        throw new Error(`Chat ${chat.id} in project ${project.id} is missing metadata`);
      }

      let key = chat.metadata?.title || chat.title;
      if (!key || key.trim() === '') {
        throw new Error(`Chat ${chat.id} in project ${project.id} is missing title or metadata.title`);
      }
      
      key += chat.metadata.user;
      key += chat.metadata.created;

      if (!key) {
        throw new Error(`Chat ${chat.id} in project ${project.id} is missing baseHash`);
      }
      if (!map[key]) map[key] = [];

      map[key].push(chat);
    }
  }
  return map;
}

async function getChats(): Promise<Chat[]> {

  const projects: Project[] = await ProjectModel.find().lean(); // retrieve all from DB

  const chats: Chat[] = [];
  for (const project of projects) {
    for (const chat of project.chats) {
      chats.push(chat);
    }
  }   
  return chats;
}

async function getChatsByChatId(): Promise<Record<string, Chat>> {

  const chatsByChatId: Record<string, Chat> = {};

  const projects: Project[] = await ProjectModel.find().lean(); // retrieve all from DB

  for (const project of projects) {
    for (const chat of project.chats) {
      chatsByChatId[chat.id] = chat;
    }
  }   
  return chatsByChatId;
}

async function main() {

  const cli = parseArgs();
  if (!cli.chatsDirectory) {
    throw new Error('Missing required argument: --chatsDirectory');
  }

  await connectDB()

  try {

    const markdownFileData: MarkdownFileData[] = await getMarkdownFileData(cli.chatsDirectory);

    // const chatsByChatId: Record<string, Chat> = await getChatsByChatId();
    // console.log('Chats by Chat ID:', chatsByChatId);

    const chatsByBaseHash: Record<string, Chat[]> = await getChatsByBaseHash();
    console.log('Chats by Base Hash:', chatsByBaseHash);

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

import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});
const fs = require('fs').promises;
import path from 'path';
import { ProjectModel } from "../models";

import { parseMarkdownFiles, MarkdownFileData, importMarkdownFiles } from '../controllers';
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

async function getMarkdownFileData(chatsDirectory: string): Promise<MarkdownFileData[]> {
  const allFilePaths: string[] = await getAllMarkdownFilePaths(chatsDirectory);
  const markdownFileData: MarkdownFileData[] = await parseMarkdownFiles(allFilePaths);
  return markdownFileData;
}

async function getChatsInDbByBaseHash(): Promise<Record<string, Chat[]>> {
  const map: Record<string, Chat[]> = {};
  const projects: Project[] = await ProjectModel.find().lean();
  for (const project of projects) {

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

function classifyMarkdownImports(markdownFileData: MarkdownFileData[], chatsByBaseHash: Record<string, Chat[]>): void {
  // const chatsByBaseHashKey: Record<string, boolean> = {};
  for (const markdownDataForFile of markdownFileData) {
    if (!markdownDataForFile.metadata) {
      console.log(`Markdown file ${markdownDataForFile.filePath} is missing metadata`);
      continue;
    }
    const baseHash = markdownDataForFile.metadata.title + markdownDataForFile.metadata.user + markdownDataForFile.metadata.created;
    // if (baseHash === 'Fullscreen Exit CausesTed Shaffer (shaffer.family@gmail.com)7/20/2025 5:26') {
    //   debugger;
    // }
    // if (chatsByBaseHashKey[baseHash]) {
    //   debugger;
    // } else {
    //   chatsByBaseHashKey[baseHash] = true;
    // }
    if (!baseHash) {
      throw new Error(`Markdown file ${markdownDataForFile.filePath} is missing baseHash`);
    }
    const existingChats = chatsByBaseHash[baseHash] || [];
    if (existingChats.length === 0) {
      // no match; new file.
      markdownDataForFile.classification = 'NOT_IMPORTED';
    }
    else if (existingChats.length === 1 && existingChats[0].metadata?.updated === markdownDataForFile.metadata.updated) {
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

    const markdownFileData: MarkdownFileData[] = await getMarkdownFileData(cli.chatsDirectory);

    const chatsByBaseHash: Record<string, Chat[]> = await getChatsInDbByBaseHash();
    console.log('Chats by Base Hash:', chatsByBaseHash);

    classifyMarkdownImports(markdownFileData, chatsByBaseHash);
    console.log('Markdown File Data:', markdownFileData);

    await importMarkdownFiles(cli.projectName, markdownFileData);
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

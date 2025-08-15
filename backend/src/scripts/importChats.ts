import dotenv from 'dotenv';
dotenv.config();

const fs = require('fs').promises; // Use the promise-based version for async/await
import path from 'path';
import { ProjectModel } from "../models";

import { parseMarkdownFiles, MarkdownFileData } from '../controllers';
import { connectDB } from '../config/db';
import { Project } from '../types';

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
  // console.log(`Found ${allFiles.length} markdown files in directory.`);
  const markdownFileData: MarkdownFileData[] = await parseMarkdownFiles(allFiles);
  // console.log(`Parsed metadata from ${markdownFileData.length} markdown files.`);
  // console.log(markdownFileData);
  return markdownFileData;
}

async function poo(): Promise<void> {
  const projects: Project[] = await ProjectModel.find().lean(); // retrieve all from DB
  console.log(projects);
  // const entries: ChatEntry[] = await ChatEntryModel.find().lean();
  // console.log(entries[0]);
  return null;
}

async function main() {

  const cli = parseArgs();
  if (!cli.chatsDirectory) {
    throw new Error('Missing required argument: --chatsDirectory');
  }

  await connectDB()

  // console.log(`Importing chats from directory: ${cli.chatsDirectory}`);

  try {

    const markdownFileData = await getMarkdownFileData(cli.chatsDirectory);

    await (poo());

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

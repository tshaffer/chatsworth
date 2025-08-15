import dotenv from 'dotenv';
import { get } from 'http';
dotenv.config();

const fs = require('fs').promises; // Use the promise-based version for async/await
import path from 'path';

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

async function main() {
  const cli = parseArgs();
  if (!cli.chatsDirectory) {
    throw new Error('Missing required argument: --chatsDirectory');
  }
  console.log(`Importing chats from directory: ${cli.chatsDirectory}`);

  try {
    const allFiles: string[] = await getAllMarkdownFiles(cli.chatsDirectory);
    console.log(`Found ${allFiles.length} markdown files in directory.`);
  } catch (error) {
    console.error('Error reading files:', error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});

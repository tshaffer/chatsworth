import dotenv from 'dotenv';
dotenv.config();

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


async function main() {
  const cli = parseArgs();
  if (!cli.chatsDirectory) {
    throw new Error('Missing required argument: --chatsDirectory');
  }
  console.log(`Importing chats from directory: ${cli.chatsDirectory}`);

  console.log(process.env);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});

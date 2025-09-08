/*
  from
      /Users/tedshaffer/Documents/Projects/chatsworth/backend/src/scripts
      
  run
      npx ts-node apply-project-map.ts \
      /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-09-08-25-0/conversations.json \
      /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-09-08-25-0/project-map.json \
      /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-09-08-25-0/conversations-with-projects.json

  from
      /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/scripts
  run
      npx ts-node apply-project-map.ts ../data/chatGPTExport-08-25-25-0/conversations.json ../data/chatGPTExport-08-25-25-0/project-map.json ../data/chatGPTExport-08-25-25-0/conversations-with-projects.json
      npx ts-node apply-project-map.ts ../data/chatGPTExport-08-23-25-0/conversations.json ../data/chatGPTExport-08-23-25-0/project-map.json ../data/chatGPTExport-08-23-25-0/conversations-with-projects.json
      npx ts-node apply-project-map.ts ../data/chatGPTExport-08-21-25-0/conversations.json ../data/chatGPTExport-08-21-25-0/project-map.json ../data/chatGPTExport-08-21-25-0/conversations-with-projects.json
  
      npx ts-node apply-project-map.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-19-25-0/conversations.json /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/project-map.json
  npx ts-node apply-project-map.ts conversations.json project-map.json
  npx ts-node apply-project-map.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-19-25-0/conversations.json /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/project-map.json
*/
import fs from "fs/promises";

(async () => {
  const exportFile = process.argv[2] ?? "conversations.json";
  const mappingFile = process.argv[3] ?? "project-map.json";
  const outputFile = process.argv[4] ?? "conversations-with-projects.json";

  const conversations = JSON.parse(await fs.readFile(exportFile, "utf8"));
  const projectMap = JSON.parse(await fs.readFile(mappingFile, "utf8"));

  // Build reverse lookup: convId -> project name
  const convToProject: Record<string, string> = {};
  for (const [projectName, ids] of Object.entries(projectMap)) {
    if (Array.isArray(ids)) {
      for (const id of ids) convToProject[id] = projectName;
    }
  }

  // Update conversations with fake project info
  for (const conv of conversations) {
    const projectName = convToProject[conv.id];
    if (projectName) {
      conv.project = {
        id: `manual_${projectName.toLowerCase().replace(/\s+/g, "_")}`,
        name: projectName
      };
    } else if (!conv.project) {
      conv.project = null;
    }
  }

  await fs.writeFile(outputFile, JSON.stringify(conversations, null, 2), "utf8");
  console.log(`Updated export written to ${outputFile}`);
})();

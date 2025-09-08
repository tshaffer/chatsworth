/**
 * Usage:
 * from
 *  /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/scripts
 *      npx ts-node build-project-map.ts "/path/to/chatIdChromeExports"
 *
 
 * Example:
npx ts-node src/scripts/build-project-map.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-09-08-25-0/chatIdChromeExports
npx ts-node build-project-map.ts data/chatGPTExport-08-19-25-0/chatIdChromeExports
npx ts-node build-project-map.ts data/chatGPTExport-08-19-25-0/chatIdChromeExports
npx ts-node build-project-map.ts data/chatGPTExport-08-21-25-0/chatIdChromeExports
npx ts-node build-project-map.ts ../data/chatGPTExport-08-23-25-0/chatIdChromeExports
npx ts-node build-project-map.ts ../data/chatGPTExport-08-25-25-0/chatIdChromeExports
 *
 * Output:
 *   Writes project-map.json one directory *above* the input directory.
 */

import fs from "fs/promises";
import path from "path";

type ProjectMap = Record<string, string[]>;

function deriveProjectNameFromFilename(filename: string): string {
  // Strip "-chat-ids.json", replace underscores with spaces, trim.
  return filename
    .replace(/-chat-ids\.json$/i, "")
    .replace(/_/g, " ")
    .trim();
}

function extractIdsFromFileObject(obj: any): string[] {
  if (!obj || typeof obj !== "object") return [];
  // Prefer any top-level property that is an array of strings (exclude _meta)
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_meta") continue;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return v as string[];
    }
  }
  // Fallback: some folks might store under "ids"
  if (Array.isArray((obj as any).ids) && (obj as any).ids.every((x: any) => typeof x === "string")) {
    return (obj as any).ids as string[];
  }
  return [];
}

async function main() {
  const inputDir = process.argv[2];
  if (!inputDir) {
    console.error("Usage: npx ts-node build-project-map.ts \"/path/to/chatIdChromeExports\"");
    process.exit(1);
  }

  const absInput = path.resolve(inputDir);
  const parentDir = path.dirname(absInput);
  const outPath = path.join(parentDir, "project-map.json");

  // Read directory
  const entries = await fs.readdir(absInput, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /-chat-ids\.json$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error(`No "*-chat-ids.json" files found in: ${absInput}`);
    process.exit(1);
  }

  const projectMap: ProjectMap = {};
  const seenIdToProjects = new Map<string, Set<string>>();

  for (const file of files) {
    const projectName = deriveProjectNameFromFilename(file);
    const full = path.join(absInput, file);
    const raw = await fs.readFile(full, "utf8");

    let json: any;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      console.warn(`⚠️  Skipping ${file}: invalid JSON`);
      continue;
    }

    const ids = extractIdsFromFileObject(json);
    if (!ids.length) {
      console.warn(`⚠️  Skipping ${file}: could not find an array of chat IDs`);
      continue;
    }

    // Deduplicate within this file
    const uniqueIds = Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean)));

    // Merge into projectMap
    const existing = projectMap[projectName] ?? [];
    const merged = Array.from(new Set([...existing, ...uniqueIds]));
    projectMap[projectName] = merged;

    // Track cross-project duplicates
    for (const id of uniqueIds) {
      const set = seenIdToProjects.get(id) ?? new Set<string>();
      set.add(projectName);
      seenIdToProjects.set(id, set);
    }

    console.log(`✅ ${projectName}: +${uniqueIds.length} (total ${merged.length})`);
  }

  // Warn about IDs that appear in multiple projects
  const crossAssigned = [...seenIdToProjects.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([id, set]) => ({ id, projects: Array.from(set.values()) }));

  if (crossAssigned.length) {
    console.warn(
      `\n⚠️  Found ${crossAssigned.length} chat ID(s) that appear in multiple projects:\n` +
      crossAssigned
        .slice(0, 10)
        .map((x) => `  - ${x.id} → ${x.projects.join(", ")}`)
        .join("\n") +
      (crossAssigned.length > 10 ? `\n  ...and ${crossAssigned.length - 10} more` : "")
    );
  }

  // Write output
  await fs.writeFile(outPath, JSON.stringify(projectMap, null, 2), "utf8");

  // Summary
  const projectCount = Object.keys(projectMap).length;
  const totalIds = Object.values(projectMap).reduce((acc, arr) => acc + arr.length, 0);
  console.log(`\nWrote project map → ${outPath}`);
  console.log(`Projects: ${projectCount}, Total chat IDs: ${totalIds}`);
}

main().catch((err) => {
  console.error("Failed to build project-map.json:", err);
  process.exit(1);
});

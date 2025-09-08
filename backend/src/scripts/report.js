// Switch to your database
use('chatsworthv2');

// ---------- Helpers ----------
function pad(n) { return (n < 10 ? '0' : '') + n; }
function isoDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ---------- Precompute entry counts by (projectId, chatId) ----------
const entryCounts = db.chatentries.aggregate([
  {
    $group: {
      _id: { projectId: "$projectId", chatId: "$chatId" },
      count: { $sum: 1 }
    }
  }
]).toArray();

const countMap = new Map();
for (const row of entryCounts) {
  const k = `${row._id.projectId}||${row._id.chatId}`;
  countMap.set(k, row.count);
}

// ---------- Detect where chats live (embedded vs separate collection) ----------
const allCollections = db.getCollectionNames();
const hasChatsCollection = allCollections.includes('chats');

// Fetch all projects up front
const projects = db.projects.find().toArray();

// If chats are in their own collection, prefetch them grouped by projectId
let chatsByProjectId = new Map();
if (hasChatsCollection) {
  const allChats = db.chats.find().toArray();
  chatsByProjectId = allChats.reduce((m, chat) => {
    const list = m.get(chat.projectId) || [];
    list.push(chat);
    m.set(chat.projectId, list);
    return m;
  }, new Map());
}

// ---------- Build report ----------
const lines = [];
lines.push(`Chatsworth Project/Chat Report`);
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`----------------------------------------`);

for (const project of projects) {
  const projectId = project.projectId || project.id || String(project._id);
  const projectName = project.name || '(unnamed project)';

  // Get chats for this project
  let chats = [];
  if (hasChatsCollection) {
    chats = chatsByProjectId.get(projectId) || [];
  } else {
    // Embedded chats scenario (project.chats = [ { chatId, title, ... } ])
    chats = Array.isArray(project.chats) ? project.chats : [];
  }

  // Sort chats by title (optional)
  chats.sort((a, b) => {
    const ta = (a.title || '').toLowerCase();
    const tb = (b.title || '').toLowerCase();
    return ta.localeCompare(tb);
  });

  lines.push('');
  lines.push(`Project: ${projectName}`);
  lines.push(`Chats: ${chats.length}`);

  for (const chat of chats) {
    const chatId = chat.chatId || chat.id || String(chat._id);
    const chatTitle = chat.title || '(untitled chat)';
    const key = `${projectId}||${chatId}`;
    const nEntries = countMap.get(key) || 0;
    lines.push(`  • "${chatTitle}" — ${nEntries} entr${nEntries === 1 ? 'y' : 'ies'}`);
  }
}

lines.push('');
lines.push('----------------------------------------');
const report = lines.join('\n');

// ---------- Try to write to a file; fall back to printing ----------
let wroteFile = false;
try {
  if (typeof require === 'function') {
    const fs = require('fs');
    const filename = `./project_chat_counts_${isoDateStamp()}.txt`;
    fs.writeFileSync(filename, report, { encoding: 'utf8' });
    print(`\nWrote report to: ${filename}\n`);
    wroteFile = true;
  }
} catch (e) {
  // ignore and fall back to printing
}

if (!wroteFile) {
  print('\nUnable to write to a file from mongosh (no fs/require). Printing the report below:\n');
  print(report);
  print('\nTip: if you save this script to a file, you can run:\n  mongosh --file yourscript.js > project_chat_counts.txt\n');
}

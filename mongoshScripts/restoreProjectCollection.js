// Restore the `projects` collection in the `chatsworth` database

use chatsworth;

// ====== EDIT THIS PATH IF NEEDED ======
const backupFile =
  "/Users/tedshaffer/Documents/MongoDBBackups/chatsworth/backup-08-18-1/projects.json";
// ======================================

const fs = require("fs");

// Make sure the backup file exists
if (!fs.existsSync(backupFile)) {
  throw new Error(`Backup file not found: ${backupFile}`);
}

// Read and parse using Extended JSON so ObjectIds/Dates are preserved
const raw = fs.readFileSync(backupFile, "utf8");
const docs = (typeof EJSON !== "undefined") ? EJSON.parse(raw) : JSON.parse(raw);

if (!Array.isArray(docs)) {
  throw new Error("Backup file did not contain an array of documents.");
}

print(`Loaded ${docs.length} documents from backup.`);

// (Re)create the projects collection cleanly
if (db.getCollectionNames().includes("projects")) {
  print("Dropping existing 'projects' collection (if present)...");
  db.projects.drop();
}

print("Creating 'projects' collection...");
db.createCollection("projects");

// Insert documents
if (docs.length > 0) {
  print("Inserting documents...");
  const res = db.projects.insertMany(docs, { ordered: false });
  // insertMany result shape can vary by shell version; count robustly:
  const insertedCount = res.insertedIds
    ? Object.keys(res.insertedIds).length
    : (res.nInserted ?? docs.length);
  print(`Inserted ${insertedCount} documents.`);
} else {
  print("No documents to insert.");
}

// Recreate indexes your app expects (add any others you use)
print("Recreating indexes...");
db.projects.createIndex({ "chats.title": "text" });

const finalCount = db.projects.countDocuments();
print(`Restore complete. projects count: ${finalCount}`);
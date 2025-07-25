use chatsworth;

// Run this in `mongosh` while connected to your target database

const projectCursor = db.projects.find();

let insertedCount = 0;

while (projectCursor.hasNext()) {
  const project = projectCursor.next();
  const projectId = project.id || project._id?.toString();

  if (!project.chats) continue;

  for (const chat of project.chats) {
    const chatId = chat.id || new ObjectId().toString();

    if (!chat.entries) continue;

    for (const entry of chat.entries) {
      const newEntry = {
        projectId: projectId,
        chatId: chatId,
        originalPrompt: entry.originalPrompt || '',
        promptSummary: entry.promptSummary || '',
        response: entry.response || '',
        embedding: entry.embedding || undefined, // preserve if already exists
      };

      db.chatentries.insertOne(newEntry);
      insertedCount++;
    }
  }
}

print(`✅ Done! Inserted ${insertedCount} entries into 'chatentries' collection.`);

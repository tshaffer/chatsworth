// controllers/chatController.ts
import { Request, Response } from 'express';
import { ProjectDoc, ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';
import type { ChatEntryDoc } from '../models/ChatEntry';
import type { ChatSubdoc } from '../models/Project';

interface RenameOrMoveChatBody {
  newTitle?: string;
  targetProjectId?: string;
}

export const renameOrMoveChat = async (
  req: Request<{ chatId: string }, {}, RenameOrMoveChatBody>,
  res: Response
) => {
  const { chatId } = req.params;
  const { newTitle, targetProjectId } = req.body;

  const sourceProject = await ProjectModel
    .findOne({ 'chats.chatId': chatId })
    .lean<ProjectDoc>();
  if (!sourceProject) return res.status(404).json({ error: 'Chat not found' });

  const chatIndex = (sourceProject.chats ?? []).findIndex(c => c.chatId === chatId);
  if (chatIndex === -1) return res.status(404).json({ error: 'Chat not found in project' });

  const chat = { ...sourceProject.chats[chatIndex] };
  if (newTitle?.trim()) chat.title = newTitle.trim();

  // MOVE
  if (targetProjectId && targetProjectId !== sourceProject.projectId) {
    const targetProject = await ProjectModel.findOne({ projectId: targetProjectId });
    if (!targetProject) return res.status(404).json({ error: 'Target project not found' });

    // remove from source
    await ProjectModel.updateOne(
      { projectId: sourceProject.projectId },
      { $pull: { chats: { chatId } } }
    );

    // push into target (DB shape)
    targetProject.chats.push({
      ...chat,
      projectId: targetProject.projectId,
      projectName: targetProject.name,
      metadata: {
        ...chat.metadata,
        source: 'chatsworth-app',
        sourceUpdatedAt: new Date(),
        exportedAt: new Date(),
      },
    });
    await targetProject.save();

    return res.json({ message: 'Chat moved' });
  }

  // RENAME in-place
  if (newTitle?.trim()) {
    await ProjectModel.updateOne(
      { projectId: sourceProject.projectId, 'chats.chatId': chatId },
      { $set: { 'chats.$.title': chat.title } }
    );
  }

  return res.json({ message: 'Chat updated' });
};

export const deleteChat = async (req: Request, res: Response) => {

  const { projectId, chatId } = req.params;

  try {
    const project = await ProjectModel.findOne({ projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const chatIndex = project.chats.findIndex((c) => c.chatId === chatId);
    if (chatIndex === -1) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    project.chats.splice(chatIndex, 1);
    await project.save();

    res.status(200).json({ message: 'Chat deleted' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



export const exportChat = async (
  req: Request<{ chatId: string }>,
  res: Response
): Promise<void> => {
  const { chatId } = req.params;

  // Find the project that contains this chat
  const project = await ProjectModel.findOne({ 'chats.chatId': chatId }).lean();

  if (!project) {
    res.status(404).send('Chat not found');
    return;
  }

  const chat = project.chats.find((c) => c.chatId === chatId); // type: ChatSubdoc | undefined

  if (!chat) {
    res.status(404).send('Chat not found');
    return;
  }

  // Fetch associated ChatEntry documents from the DB
  const entries = await ChatEntryModel.find({ chatId }).sort({ position: 1 }).lean();

  let markdown = `# ${chat.title}\n\n`;

  // if (chat.metadata) {
  //   markdown += `**User:** ${chat.metadata.user || ''}\n`;
  //   markdown += `**Created:** ${chat.metadata.created || ''}\n`;
  //   markdown += `**Updated:** ${chat.metadata.updated || ''}\n`;
  //   markdown += `**Exported:** ${new Date().toISOString()}\n\n`;
  // }

  entries.forEach((entry: ChatEntryDoc, idx: number) => {
    markdown += `## Prompt:\n${entry.originalPrompt}\n\n`;
    markdown += `**Summary:** ${entry.promptSummary}\n\n`;
    markdown += `**Response:**\n${entry.response}\n\n`;
  });

  res.setHeader('Content-Disposition', `attachment; filename="${chat.title || 'Chat'}.md"`);
  res.setHeader('Content-Type', 'text/markdown');
  res.send(markdown);
};

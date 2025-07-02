// controllers/chatController.ts
import { Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { Project, Chat } from '../types'; // Adjust path to where your types are defined

interface RenameOrMoveChatBody {
  newTitle?: string;
  targetProjectId?: string;
}

export const renameOrMoveChat = async (
  req: Request<{ chatId: string }, {}, RenameOrMoveChatBody>,
  res: Response
): Promise<void> => {
  const { chatId } = req.params;
  const { newTitle, targetProjectId } = req.body;

  const sourceProject = await ProjectModel.findOne({ 'chats.id': chatId }).lean() as Project | null;
  if (!sourceProject) {
    res.status(404).json({ error: 'Chat not found' });
    return;
  }

  const chatIndex = sourceProject.chats.findIndex((chat: Chat) => chat.id === chatId);
  if (chatIndex === -1) {
    res.status(404).json({ error: 'Chat not found in project' });
    return;
  }

  const chatToMove = sourceProject.chats[chatIndex];
  if (newTitle) {
    chatToMove.title = newTitle;
  }

  if (targetProjectId && targetProjectId !== sourceProject.id) {
    // Remove from source project
    await ProjectModel.updateOne(
      { id: sourceProject.id },
      { $pull: { chats: { id: chatId } } }
    );

    // Add to target project
    const targetProject = await ProjectModel.findOne({ id: targetProjectId });
    if (!targetProject) {
      res.status(404).json({ error: 'Target project not found' });
      return;
    }

    targetProject.chats.push(chatToMove);
    await targetProject.save();
  } else {
    // Update title in place
    await ProjectModel.updateOne(
      { id: sourceProject.id, 'chats.id': chatId },
      { $set: { 'chats.$.title': chatToMove.title } }
    );
  }

  res.json({ message: 'Chat updated' });
};

export const deleteChat = async (req: Request, res: Response) => {

  const { projectId, chatId } = req.params;

  try {
    const project = await ProjectModel.findOne({ id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const chatIndex = (project.chats as Chat[]).findIndex((chat: Chat) => chat.id === chatId);
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
  const project: Project = await ProjectModel.findOne({ 'chats.id': chatId }).lean();

  if (!project) {
    res.status(404).send('Chat not found');
  }

  const chat: Chat = project.chats.find(c => c.id === chatId);
  if (!chat) {
    res.status(404).send('Chat not found');
  }

  let markdown = `# ${chat.title}\n\n`;
  if (chat.metadata) {
    markdown += `**Created:** ${chat.metadata.created || ''}\n`;
    markdown += `**Updated:** ${chat.metadata.updated || ''}\n\n`;
  }

  chat.entries.forEach(entry => {
    markdown += `## Prompt:\n${entry.originalPrompt}\n\n`;
    markdown += `**Summary:** ${entry.promptSummary}\n\n`;
    markdown += `**Response:**\n${entry.response}\n\n`;
  });

  res.setHeader('Content-Disposition', `attachment; filename="${chat.title || 'Chat'}.md"`);
  res.setHeader('Content-Type', 'text/markdown');
  res.send(markdown);
};

// controllers/chatEntryController.ts
import { Request, Response } from 'express';

import { ChatEntryModel } from '../models';

interface ChatEntryParams {
  chatId: string;
  entryIndex: string;
}

interface UpdateChatEntryBody {
  promptSummary?: string;
}

export const getChatEntries = async (req: Request, res: Response): Promise<void> => {
  const { chatId } = req.query;

  if (!chatId || typeof chatId !== 'string') {
    res.status(400).json({ error: 'chatId query parameter is required' });
    return;
  }

  try {
    const entries = await ChatEntryModel.find({ chatId }).sort({ position: 1 }).lean();
    res.json(entries);
  } catch (err) {
    console.error('Error fetching chat entries:', err);
    res.status(500).json({ error: 'Failed to fetch chat entries' });
  }
};

export const updateChatEntryPromptSummary = async (
  req: Request<any, {}, UpdateChatEntryBody>,
  res: Response
): Promise<void> => {

  const { id } = req.params;
  const { promptSummary } = req.body;
  await ChatEntryModel.findByIdAndUpdate(id, { promptSummary });
  res.sendStatus(204);
};

export const updateChatEntryOriginalPrompt = async (
  req: Request<any, {}, any>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { originalPrompt } = req.body;
  await ChatEntryModel.findByIdAndUpdate(id, { originalPrompt });
  res.sendStatus(204);
};

export const updateChatEntryResponse = async (
  req: Request<any, {}, any>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { response } = req.body;
  await ChatEntryModel.findByIdAndUpdate(id, { response });
  res.sendStatus(204);
};

export const deleteChatEntry = async (
  req: Request<any>,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  await ChatEntryModel.findByIdAndDelete(id);
  res.sendStatus(204);

  // const { chatId, entryIndex } = req.params;

  // const project: Document & ProjectType | null = await ProjectModel.findOne({ 'chats.id': chatId });
  // if (!project) {
  //   res.status(404).json({ error: 'Chat not found' });
  //   return;
  // }

  // const chat: Chat | undefined = project.chats.find((c) => c.id === chatId);
  // if (!chat) {
  //   res.status(404).json({ error: 'Chat not found in project' });
  //   return;
  // }

  // const index = Number(entryIndex);
  // if (isNaN(index) || index < 0 || index >= chat.entries.length) {
  //   res.status(404).json({ error: 'ChatEntry not found' });
  //   return;
  // }

  // chat.entries.splice(index, 1);
  // await project.save();

  // res.json({ message: 'ChatEntry deleted' });
};

export const reorderChatEntries = async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { newOrder } = req.body; // array of ChatEntry._id strings in new order

  if (!chatId || !Array.isArray(newOrder)) {
    return res.status(400).json({ error: 'chatId and newOrder[] are required' });
  }

  try {
    const updates = newOrder.map((entryId: string, index: number) =>
      ChatEntryModel.findByIdAndUpdate(entryId, { position: index })
    );
    await Promise.all(updates);
    res.sendStatus(204);
  } catch (err) {
    console.error('Failed to reorder chat entries:', err);
    res.status(500).json({ error: 'Failed to reorder entries' });
  }
};

export const moveChatEntry = async (req: Request, res: Response) => {
  const {
    entryId,
    fromChatId,
    toChatId,
    fromProjectId,
    toProjectId,
    newIndex = 0,
  } = req.body;

  if (!entryId || !toChatId || !toProjectId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Update the entry to point to the new chat/project and position
    await ChatEntryModel.findByIdAndUpdate(entryId, {
      chatId: toChatId,
      projectId: toProjectId,
      position: newIndex,
    });

    res.sendStatus(204);
  } catch (err) {
    console.error('Failed to move entry:', err);
    res.status(500).json({ error: 'Failed to move chat entry' });
  }
};

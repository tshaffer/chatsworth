// controllers/chatEntryController.ts
import { Request, Response } from 'express';

import { ChatEntryDoc, ChatEntryModel } from '../models';
import { toDomainEntry } from '../types/mappers';

interface UpdateChatEntryBody {
  promptSummary?: string;
}

export const getChatEntries = async (req: Request, res: Response) => {
  const { chatId } = req.query as { chatId: string };
  const docs = await ChatEntryModel
    .find({ chatId })
    .sort({ position: 1, _id: 1 })
    .lean<ChatEntryDoc[]>()
    .exec();

  return res.json({ entries: docs.map(toDomainEntry) });
};

export async function patchChatEntry(req: Request, res: Response) {
  const { entryId } = req.params;
  const { response } = req.body;
  const updated = await ChatEntryModel
    .findByIdAndUpdate(entryId, { $set: { response } }, { new: true })
    .lean<ChatEntryDoc>()
    .exec();

  if (!updated) return res.status(404).json({ error: 'Entry not found' });
  return res.json(toDomainEntry(updated));
}

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


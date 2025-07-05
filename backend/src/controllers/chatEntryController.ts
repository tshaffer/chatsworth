// controllers/chatEntryController.ts
import { Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { Chat } from '../types'; // Adjust to match your types location
import type { Document } from 'mongoose';

import { Project as ProjectType } from '../types'; // Rename to avoid conflict with Mongoose model

interface ChatEntryParams {
  chatId: string;
  entryIndex: string;
}

interface UpdateChatEntryBody {
  promptSummary?: string;
}

export const updateChatEntry = async (
  req: Request<ChatEntryParams, {}, UpdateChatEntryBody>,
  res: Response
): Promise<void> => {
  const { chatId, entryIndex } = req.params;
  const { promptSummary } = req.body;

  const project: Document & ProjectType | null = await ProjectModel.findOne({ 'chats.id': chatId });
  if (!project) {
    res.status(404).json({ error: 'Chat not found' });
    return;
  }

  const chat: Chat | undefined = project.chats.find((c) => c.id === chatId);
  if (!chat) {
    res.status(404).json({ error: 'Chat not found in project' });
    return;
  }

  const index = Number(entryIndex);
  if (isNaN(index) || index < 0 || index >= chat.entries.length) {
    res.status(404).json({ error: 'ChatEntry not found' });
    return;
  }

  if (promptSummary !== undefined) {
    chat.entries[index].promptSummary = promptSummary;
  }

  await project.save();
  res.json({ message: 'ChatEntry updated' });
};

export const deleteChatEntry = async (
  req: Request<ChatEntryParams>,
  res: Response
): Promise<void> => {
  const { chatId, entryIndex } = req.params;

  const project: Document & ProjectType | null = await ProjectModel.findOne({ 'chats.id': chatId });
  if (!project) {
    res.status(404).json({ error: 'Chat not found' });
    return;
  }

  const chat: Chat | undefined = project.chats.find((c) => c.id === chatId);
  if (!chat) {
    res.status(404).json({ error: 'Chat not found in project' });
    return;
  }

  const index = Number(entryIndex);
  if (isNaN(index) || index < 0 || index >= chat.entries.length) {
    res.status(404).json({ error: 'ChatEntry not found' });
    return;
  }

  chat.entries.splice(index, 1);
  await project.save();

  res.json({ message: 'ChatEntry deleted' });
};

export const reorderChatEntries = async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { newOrder } = req.body; // array of entry indices

  const project: Document & ProjectType | null = await ProjectModel.findOne({ 'chats.id': chatId });
  if (!project) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const chat = project.chats.find(c => c.id === chatId);
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found in project' });
  }

  const currentEntries = chat.entries;
  chat.entries = newOrder.map((i: number) => currentEntries[i]).filter(Boolean);

  await project.save();
  res.json({ success: true });
};

// controllers/chatEntryController.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';                       // <-- add this
import { ChatEntryDoc, ChatEntryModel, TombstoneModel } from '../models';
import { toDomainEntry } from '../types/mappers';

// NEW: accept either Mongo _id or string entryId
const byEitherId = (idOrEntryId: string) =>
  mongoose.isValidObjectId(idOrEntryId)
    ? { _id: idOrEntryId }
    : { entryId: idOrEntryId };

// --- unchanged ---
export const getChatEntries = async (req: Request, res: Response) => {
  const { chatId } = req.query as { chatId: string };
  const docs = await ChatEntryModel.find({ chatId })
    .sort({ position: 1, _id: 1 })
    .lean<ChatEntryDoc[]>()
    .exec();
  return res.json({ entries: docs.map(toDomainEntry) });
};

// Replace your updateChatEntryPromptSummary with this:
export const updateChatEntryPromptSummary = async (req: Request<any, {}, { promptSummary?: string }>, res: Response) => {
  const { id } = req.params;
  const { promptSummary } = req.body;

  if (typeof promptSummary !== 'string') {
    return res.status(400).json({ error: 'promptSummary (string) is required' });
  }

  await ChatEntryModel.findOneAndUpdate(byEitherId(id), { $set: { promptSummary: promptSummary.trim() } });
  res.sendStatus(204);
};

// (Recommended) make these consistent too:
export const updateChatEntryOriginalPrompt = async (req: Request<any, {}, any>, res: Response) => {
  const { id } = req.params;
  const { originalPrompt } = req.body;
  await ChatEntryModel.findOneAndUpdate(byEitherId(id), { $set: { originalPrompt } });
  res.sendStatus(204);
};

export const updateChatEntryResponse = async (req: Request<any, {}, any>, res: Response) => {
  const { id } = req.params;
  const { response } = req.body;
  await ChatEntryModel.findOneAndUpdate(byEitherId(id), { $set: { response } });
  res.sendStatus(204);
};

// If you use patchChatEntry elsewhere, make it tolerant too:
export async function patchChatEntry(req: Request, res: Response) {
  const { entryId } = req.params;
  const { response } = req.body;
  const updated = await ChatEntryModel
    .findOneAndUpdate(byEitherId(entryId), { $set: { response } }, { new: true })
    .lean<ChatEntryDoc>()
    .exec();

  if (!updated) return res.status(404).json({ error: 'Entry not found' });
  return res.json(toDomainEntry(updated));
}

// DELETE: by either id
export const deleteChatEntry = async (req: Request<any>, res: Response) => {
  const { id } = req.params;

  const entry = await ChatEntryModel.findOne({ entryId: id });
  if (!entry) return res.status(404).json({ error: 'Not found' });

  await TombstoneModel.updateOne(
    { kind: 'entry', projectId: entry.projectId, chatId: entry.chatId, entryId: entry.entryId },
    { $setOnInsert: { deletedAt: new Date(), source: 'app' } },
    { upsert: true }
  );

  await ChatEntryModel.findOneAndDelete(byEitherId(id));
  res.sendStatus(204);
};

// REORDER: entries array may contain _id or entryId
export const reorderChatEntries = async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { newOrder } = req.body as { newOrder: string[] }; // array of ids (either kind)
  if (!chatId || !Array.isArray(newOrder)) {
    return res.status(400).json({ error: 'chatId and newOrder[] are required' });
  }
  try {
    const updates = newOrder.map((id, index) =>
      ChatEntryModel.updateOne(byEitherId(id), { $set: { position: index } })
    );
    await Promise.all(updates);
    res.sendStatus(204);
  } catch (err) {
    console.error('Failed to reorder chat entries:', err);
    res.status(500).json({ error: 'Failed to reorder entries' });
  }
};

// Large offset for collision-free shifting
const SHIFT = 1_000_000;

export const moveChatEntry = async (req: Request, res: Response) => {
  const { entryId, toChatId, toProjectId, newIndex } = req.body as {
    entryId: string;
    toChatId: string;
    toProjectId: string;
    newIndex?: number;
  };

  if (!entryId || !toChatId || !toProjectId) {
    return res.status(400).json({ error: 'entryId, toChatId, and toProjectId are required' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const entry = await ChatEntryModel.findOne(byEitherId(entryId))
        .session(session)
        .lean<ChatEntryDoc>()
        .exec();
      if (!entry) throw new Error('Entry not found');

      const fromChatId = entry.chatId;
      const fromProjectId = entry.projectId;
      const fromPos = entry.position;

      // Compute bounded dest index inside the txn
      const destCount = await ChatEntryModel.countDocuments({ chatId: toChatId }).session(session);
      let destIndex =
        typeof newIndex === 'number' && newIndex >= 0 ? Math.min(newIndex, destCount) : destCount;

      // No-op?
      if (fromChatId === toChatId && fromProjectId === toProjectId && destIndex === fromPos) {
        return;
      }

      if (fromChatId === toChatId) {
        // ===== Reorder within same chat (no collisions via offset window)
        if (destIndex > fromPos) {
          // Move (fromPos, destIndex] down by 1
          await ChatEntryModel.updateMany(
            { chatId: fromChatId, position: { $gt: fromPos, $lte: destIndex } },
            { $inc: { position: -SHIFT } },
            { session }
          );
          await ChatEntryModel.updateOne(byEitherId(entryId), { $set: { position: destIndex } }, { session });
          await ChatEntryModel.updateMany(
            { chatId: fromChatId, position: { $lt: 0 } },
            { $inc: { position: SHIFT - 1 } },
            { session }
          );
        } else {
          // Move [destIndex, fromPos) up by 1
          await ChatEntryModel.updateMany(
            { chatId: fromChatId, position: { $gte: destIndex, $lt: fromPos } },
            { $inc: { position: +SHIFT } },
            { session }
          );
          await ChatEntryModel.updateOne(byEitherId(entryId), { $set: { position: destIndex } }, { session });
          await ChatEntryModel.updateMany(
            { chatId: fromChatId, position: { $gte: destIndex + SHIFT } },
            { $inc: { position: -(SHIFT - 1) } },
            { session }
          );
        }
        return;
      }

      // ===== Cross-chat move =====
      // 1) Create a big gap in the destination at destIndex
      await ChatEntryModel.updateMany(
        { chatId: toChatId, position: { $gte: destIndex } },
        { $inc: { position: +SHIFT } },
        { session }
      );

      // 2) Move the entry into the gap
      await ChatEntryModel.updateOne(
        byEitherId(entryId),
        { $set: { chatId: toChatId, projectId: toProjectId, position: destIndex } },
        { session }
      );

      // 3) Normalize destination positions so items end up shifted by +1
      await ChatEntryModel.updateMany(
        { chatId: toChatId, position: { $gte: destIndex + SHIFT } },
        { $inc: { position: -(SHIFT - 1) } },
        { session }
      );

      // 4) Close the gap in the source by shifting everything after fromPos down by 1
      //    (do it collision-free via a negative offset then normalize)
      await ChatEntryModel.updateMany(
        { chatId: fromChatId, position: { $gt: fromPos } },
        { $inc: { position: -SHIFT } },
        { session }
      );
      await ChatEntryModel.updateMany(
        { chatId: fromChatId, position: { $lt: 0 } },
        { $inc: { position: SHIFT - 1 } },
        { session }
      );
    });

    return res.sendStatus(204);
  } catch (err) {
    console.error('Failed to move entry:', err);
    return res.status(500).json({ error: 'Failed to move chat entry' });
  } finally {
    session.endSession();
  }
};

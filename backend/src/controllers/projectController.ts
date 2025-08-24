// controllers/projectController.ts
import { Request, Response } from 'express';
import { ProjectDoc, ProjectModel } from '../models/Project';
import { v4 as uuidv4 } from 'uuid';
import { toDomainProject } from '../types';

// PATCH /api/projects/:projectId
export const renameProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { name } = req.body;

  const projectDoc = await ProjectModel
    .findOneAndUpdate({ projectId }, { name }, { new: true })
    .lean<ProjectDoc>()
    .exec();

  if (!projectDoc) return res.status(404).json({ error: 'Project not found' });
  return res.json(toDomainProject(projectDoc));
};

// DELETE /api/projects/:projectId
export const deleteProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const result = await ProjectModel.findOneAndDelete({ id: projectId });
  if (!result) return res.status(404).json({ error: 'Project not found' });
  res.json({ message: 'Project deleted' });
};

export const createProject = async (req: Request, res: Response) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const existing = await ProjectModel.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (existing) {
    return res.status(409).json({ error: 'Project name must be unique' });
  }

  const newProject = new ProjectModel({
    id: uuidv4(),
    name: name.trim(),
    chats: [],
  });

  await newProject.save();
  res.status(201).json(newProject);
};

export const reorderChats = async (req: Request, res: Response) => {
  const { projectId } = req.params as { projectId: string };
  const { newOrder } = req.body as { newOrder: string[] }; // array of chatIds

  if (!Array.isArray(newOrder)) {
    return res.status(400).json({ error: 'newOrder must be an array of chatIds (strings)' });
  }

  // Pull the project (note: field is projectId, not id)
  const project = await ProjectModel.findOne({ projectId });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Build lookup of existing chats by chatId
  const chatMap = new Map(project.chats.map((c) => [c.chatId, c]));

  // Basic validation
  const dupes = newOrder.length !== new Set(newOrder).size;
  if (dupes) return res.status(400).json({ error: 'newOrder contains duplicate chatIds' });

  const unknown = newOrder.filter((id) => !chatMap.has(id));
  if (unknown.length) {
    return res.status(400).json({ error: `Unknown chatIds: ${unknown.join(', ')}` });
  }

  // Strict mode: require caller to specify all chats
  if (newOrder.length !== project.chats.length) {
    return res.status(400).json({ error: 'newOrder must include all chatIds for this project' });
  }

  // Rebuild array in requested order (ChatSubdoc[])
  const reordered = newOrder.map((id) => chatMap.get(id)!);

  project.chats = reordered;
  project.markModified('chats'); // ensure Mongoose sees the array mutation
  await project.save();

  return res.json({
    success: true,
    chatIds: project.chats.map((c) => c.chatId),
  });
};

export const moveChatToProject = async (req: Request, res: Response) => {
  const { chatId, sourceProjectId, targetProjectId } = req.body as {
    chatId: string; sourceProjectId: string; targetProjectId: string;
  };

  if (!chatId || !sourceProjectId || !targetProjectId) {
    return res.status(400).json({ error: 'chatId, sourceProjectId, targetProjectId are required' });
  }
  if (sourceProjectId === targetProjectId) {
    return res.status(400).json({ error: 'sourceProjectId and targetProjectId must differ' });
  }

  const session = await ProjectModel.startSession();
  try {
    await session.withTransaction(async () => {
      const [sourceProject, targetProject] = await Promise.all([
        ProjectModel.findOne({ projectId: sourceProjectId }).session(session),
        ProjectModel.findOne({ projectId: targetProjectId }).session(session),
      ]);

      if (!sourceProject) throw new Error('Source project not found');
      if (!targetProject) throw new Error('Target project not found');

      const idx = sourceProject.chats.findIndex((c) => c.chatId === chatId);
      if (idx === -1) throw new Error('Chat not found in source project');

      // idempotency / duplicate check
      if (targetProject.chats.some((c) => c.chatId === chatId)) {
        // already present in target — treat as success after removing from source if needed
        sourceProject.chats.splice(idx, 1);
        sourceProject.markModified('chats');
        await sourceProject.save({ session });
        return;
      }

      // pull from source
      const [chatToMove] = sourceProject.chats.splice(idx, 1);

      // update subdoc fields to reflect new project
      chatToMove.projectId = targetProject.projectId;
      chatToMove.projectName = targetProject.name;
      chatToMove.metadata = chatToMove.metadata || {};
      chatToMove.metadata.exportedAt = new Date();
      chatToMove.metadata.sourceUpdatedAt = new Date();

      // push into target
      targetProject.chats.push(chatToMove);

      sourceProject.markModified('chats');
      targetProject.markModified('chats');

      await Promise.all([
        sourceProject.save({ session }),
        targetProject.save({ session }),
      ]);
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    const msg = typeof err?.message === 'string' ? err.message : 'Failed to move chat';
    return res.status(400).json({ error: msg });
  } finally {
    session.endSession();
  }
};
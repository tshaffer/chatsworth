// controllers/projectController.ts
import { Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { v4 as uuidv4 } from 'uuid';
import { Chat } from '../types';

// PATCH /api/projects/:projectId
export const renameProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { name } = req.body;
  const project = await ProjectModel.findOneAndUpdate({ id: projectId }, { name }, { new: true });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
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
  const { projectId } = req.params;
  const { newOrder } = req.body; // array of chat IDs

  const project = await ProjectModel.findOne({ id: projectId });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Reorder based on new chat ID order
  const chatMap = new Map(
    project.chats.map((c: Chat) => [c.id, c])
  );
  project.chats = newOrder.map((id: string) => chatMap.get(id)).filter(Boolean);

  await project.save();
  res.json({ success: true });
};

// controllers/projectController.ts
export const moveChatToProject = async (req: Request, res: Response) => {
  const { chatId, sourceProjectId, targetProjectId } = req.body;

  try {
    const sourceProject = await ProjectModel.findOne({ id: sourceProjectId });
    const targetProject = await ProjectModel.findOne({ id: targetProjectId });

    if (!sourceProject || !targetProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const chatIndex = sourceProject.chats.findIndex(
      (c: Chat) => c.id === chatId
    );

    if (chatIndex === -1) {
      return res.status(404).json({ error: 'Chat not found in source project' });
    }

    const [chatToMove] = sourceProject.chats.splice(chatIndex, 1);
    targetProject.chats.push(chatToMove);

    await sourceProject.save();
    await targetProject.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move chat' });
  }
};

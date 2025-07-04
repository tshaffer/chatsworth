// controllers/projectController.ts
import { Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { v4 as uuidv4 } from 'uuid';

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

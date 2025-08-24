import { Request, Response } from 'express';

import { ProjectsState } from "../types";
import { ProjectModel } from "../models";
import { toDomainProject } from '../types/mappers';

export const getProjects = async (request: Request, response: Response, next: any) => {
  try {
    const dbProjects = await ProjectModel.find().lean().exec();
    const projects = dbProjects.map(toDomainProject);
    const parsedMarkdown: ProjectsState = { projectList: projects };
    response.json(parsedMarkdown);
  } catch (error) {
    console.error('Error fetching projects:', error);
    response.status(500).json({ error: 'Failed to fetch projects' });
  }
}

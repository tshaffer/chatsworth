import { Request, Response } from 'express';

import { ProjectsState } from "../types";
import { ProjectModel } from "../models";

export const getProjects = async (request: Request, response: Response, next: any) => {
  try {
    const projects = await ProjectModel.find().lean(); // retrieve all from DB
    const parsedMarkdown: ProjectsState = { projectList: projects };
    response.json(parsedMarkdown);
  } catch (error) {
    console.error('Error fetching projects:', error);
    response.status(500).json({ error: 'Failed to fetch projects' });
  }
}

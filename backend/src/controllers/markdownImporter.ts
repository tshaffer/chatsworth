
import { Request, Response } from 'express';

export const markdownImporterEndpoint = async (request: Request, response: Response, next: any) => {

  try {
    console.log(request.body);
      response.json({});
  } catch (error) {
    console.error('Error in importPhotosEndpoint:', error);
    response.status(500).json(error);
  }
}

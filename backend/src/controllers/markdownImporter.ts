
import { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import * as fs from 'fs';
import { extractChatEntries, extractChatEntriesPreservingMarkdown } from '../utilities';

export const markdownImporterEndpoint = async (request: Request, response: Response, next: any) => {

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const pathToUploads = path.join(__dirname, '../../public/uploads');
      console.log('pathToUploads: ', pathToUploads);
      cb(null, pathToUploads);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  });

  const upload = multer({ storage });
  upload.array('files')(request, response, async (err) => {
    if (err instanceof multer.MulterError) {
      console.log('MulterError: ', err);
      return response.status(500).json(err);
    } else if (err) {
      console.log('nonMulterError: ', err);
      return response.status(500).json(err);
    } else {
      console.log('no error on upload');
      console.log(request.files.length);

      const uploadedMarkdownFiles: Express.Multer.File[] = (request as any).files;
      if (uploadedMarkdownFiles.length === 1) {
        for (const uploadedMarkdownFile of uploadedMarkdownFiles) {
          const filePath: string = uploadedMarkdownFile.path;
          const content: string = fs.readFileSync(filePath).toString();
          // const parsedChat = extractChatEntries(content);
          const parsedChat = extractChatEntriesPreservingMarkdown(content);
          console.log('Parsed Chat: ', parsedChat);
          return response.status(200).json(parsedChat);
        }
      }
    }
  });
}

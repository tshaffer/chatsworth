
import { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import * as fs from 'fs';
import markdownit from 'markdown-it';

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

      const uploadedStatementFiles: Express.Multer.File[] = (request as any).files;
      for (const uploadedStatementFile of uploadedStatementFiles) {
        const originalFileName: string = uploadedStatementFile.originalname;
        const filePath: string = uploadedStatementFile.path;
        const content: string = fs.readFileSync(filePath).toString();

        const md = markdownit()
        const result = md.render(content);
        console.log('Markdown content rendered: ', result);


      }

      const responseData = {
        uploadStatus: 'success',
      };
      return response.status(200).send(responseData);
    }
  });

}

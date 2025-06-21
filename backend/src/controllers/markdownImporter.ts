
import { Request, Response } from 'express';
import { FileToImport } from '../types';
import path from 'path';
import multer from 'multer';
import * as fs from 'fs';

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

      }

      const responseData = {
        uploadStatus: 'success',
      };
      return response.status(200).send(responseData);
    }
  });

  // try {
  //   console.log(request.body);

  //   const files: FileToImport[] = request.body.files;
  //   const fileNames: string[] = files.map((file) => file.name);

  //   console.log('files:', files);
  //   console.log('fileNames:', fileNames);

  //   // for (const fileName of fileNames) {
  //   //   let updatedFileName: string = '';
  //   //   const filePath = path.join(baseDirectory, fileName);
  //   //   const fileExtension = path.extname(filePath);
  //   //   if (fileExtension.toLowerCase() === '.heic' || fileExtension.toLowerCase() === '.heif') {
  //   //     const inputFilePath = filePath;
  //   //     const dirname = path.dirname(inputFilePath); // Extracts the directory path
  //   //     const newFilename = path.basename(inputFilePath, fileExtension) + ".jpg"; // Replaces .heic with .jpg
  //   //     const outputFilePath = path.join(dirname, newFilename); // Combines directory with new filename
  //   //     console.log('convertFilesToJpeg:', inputFilePath, outputFilePath);

  //   //     const fileEntry = processingStatuses[importId].files.find((f) => f.filename === fileName);


  //   //   } else {
  //   //     updatedFileName = fileName;
  //   //   }

  //   //   const mediaItem: MediaItem = await buildLocalStorageMediaItem(baseDirectory, albumId, updatedFileName, googleAlbumName, googleAlbumId);
  //   //   await addMediaItemsFromLocalStorage([mediaItem]);

  //   // }

  //   response.json({});
  // } catch (error) {
  //   console.error('Error in importPhotosEndpoint:', error);
  //   response.status(500).json(error);
  // }
}

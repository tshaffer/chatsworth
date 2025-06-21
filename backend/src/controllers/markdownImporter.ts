
import { Request, Response } from 'express';
import { FileToImport } from '../types';
import path from 'path';

export const markdownImporterEndpoint = async (request: Request, response: Response, next: any) => {

  try {
    console.log(request.body);

    const files: FileToImport[] = request.body.files;
    const fileNames: string[] = files.map((file) => file.name);

    console.log('files:', files);
    console.log('fileNames:', fileNames);

    // for (const fileName of fileNames) {
    //   let updatedFileName: string = '';
    //   const filePath = path.join(baseDirectory, fileName);
    //   const fileExtension = path.extname(filePath);
    //   if (fileExtension.toLowerCase() === '.heic' || fileExtension.toLowerCase() === '.heif') {
    //     const inputFilePath = filePath;
    //     const dirname = path.dirname(inputFilePath); // Extracts the directory path
    //     const newFilename = path.basename(inputFilePath, fileExtension) + ".jpg"; // Replaces .heic with .jpg
    //     const outputFilePath = path.join(dirname, newFilename); // Combines directory with new filename
    //     console.log('convertFilesToJpeg:', inputFilePath, outputFilePath);

    //     const fileEntry = processingStatuses[importId].files.find((f) => f.filename === fileName);


    //   } else {
    //     updatedFileName = fileName;
    //   }

    //   const mediaItem: MediaItem = await buildLocalStorageMediaItem(baseDirectory, albumId, updatedFileName, googleAlbumName, googleAlbumId);
    //   await addMediaItemsFromLocalStorage([mediaItem]);

    // }

    response.json({});
  } catch (error) {
    console.error('Error in importPhotosEndpoint:', error);
    response.status(500).json(error);
  }
}

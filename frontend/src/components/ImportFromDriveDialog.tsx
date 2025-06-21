import * as React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { Button, DialogActions, DialogContent, Stack, Typography, Alert } from '@mui/material';

import { setDisplayedAlbumNodeIds, TedTaggerDispatch } from '../models';

import { getMediaContentTree, getAppInitialized, getDisplayedAlbumNodeIds } from '../selectors';
import { MediaContentNode, apiUrlFragment, FileToImport, MediaContentNodeType, getServerUrl } from '../types';
import { addAlbumToTree, loadMediaItemCounts, reloadMediaItemsByViewSpec } from '../controllers';
import { isAlbumNode } from '../utilities';

export interface ImportFromDriveDialogPropsFromParent {
  parentMediaContentNode: MediaContentNode;
  open: boolean;
  onClose: () => void;
}

export interface ImportFromDriveDialogProps extends ImportFromDriveDialogPropsFromParent {
  appInitialized: boolean;
  displayedAlbumNodeIds: string[];
  albumNodes: MediaContentNode[];
  onAddAlbumNode: (mediaContentNode: MediaContentNode, parentId?: string) => any;
  onSetDisplayedAlbumNodeIds: (displayedAlbumNodeIds: string[]) => any;
  onReloadMediaItemsByViewSpec: () => void;
  onLoadMediaItemCounts: () => any;
}

type FileStatus = "uploading" | "processing" | "completed" | "conversion failed";
type FileStatuses = Record<string, FileStatus>;

const ImportFromDriveDialog = (props: ImportFromDriveDialogProps) => {

  const [baseDirectory, setBaseDirectory] = React.useState<string>('');
  const [selectedFiles, setSelectedFiles] = React.useState<FileList | null>(null);
  const [newAlbumName, setNewAlbumName] = React.useState<string>('');
  const [progress, setProgress] = React.useState(0);

  const [fileProgress, setFileProgress] = React.useState<Record<string, number>>({});
  const [fileStatuses, setFileStatuses] = React.useState<FileStatuses>({});
  const [processingComplete, setProcessingComplete] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const localAlbumNodeIdRef = React.useRef<string>(props.displayedAlbumNodeIds[0]);

  const updateLocalAlbumId = (newId: string) => {
    localAlbumNodeIdRef.current = newId;
    console.log("Updated localAlbumId (ref):", localAlbumNodeIdRef.current);
  };

  React.useEffect(() => {
    if (props.open) {
      updateLocalAlbumId(props.displayedAlbumNodeIds[0]);
      setProgress(0);
      setFileProgress({});
      setFileStatuses({});
      setProcessingComplete(false);
      // setBaseDirectory('');
      setSelectedFiles(null);
      setNewAlbumName('');
      setErrorMessage(null);
    }
  }, [props.open]);

  const handleClose = () => {
    props.onClose();
  };

  const handleImportFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(event.target.files);
    }
  };

  const createAlbum = async (): Promise<MediaContentNode | undefined> => {

    if (!newAlbumName.trim()) return Promise.resolve(undefined);

    const newAlbum: MediaContentNode = {
      id: uuidv4(),
      name: newAlbumName,
      type: MediaContentNodeType.Album,
    };

    return props.onAddAlbumNode(newAlbum, props.parentMediaContentNode.id).then(() => {
      console.log('AlbumNode added: ', newAlbum);
      updateLocalAlbumId(newAlbum.id);
      setNewAlbumName("");
      return Promise.resolve(newAlbum);
    });
  };

  const checkProcessingComplete = async (importId: string): Promise<void> => {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const response = await axios.get(`/api/v1/import-photos-status/${importId}`);

          if (!response.data || response.data.files.length === 0) return;

          const updatedStatuses: FileStatuses = {};

          response.data.files.forEach((file: { filename: string; status: string }) => {
            updatedStatuses[file.filename] = file.status as FileStatus;
          });

          setFileStatuses(updatedStatuses);

          if (Object.values(updatedStatuses).every((status) => ((status === "completed") || (status === "conversion failed")))) {
            clearInterval(interval);
            console.log("All files processed!");
            props.onSetDisplayedAlbumNodeIds([localAlbumNodeIdRef.current]);
            localStorage.setItem('displayedAlbumNodeIds', localAlbumNodeIdRef.current);
            props.onReloadMediaItemsByViewSpec();
            setProcessingComplete(true);
            resolve();
          }
        } catch (error) {
          console.error("Error checking status", error);
        }
      }, 500);
    });
  };

  const albumExists = (albumName: string): boolean => {
    return props.albumNodes.some((album) => album.name === albumName);
  };

  const handleImport = async () => {
    if (selectedFiles && (baseDirectory !== '')) {
      let albumNodeId = localAlbumNodeIdRef.current;
      if (!isAlbumNode(props.parentMediaContentNode)) {
        if (albumExists(newAlbumName)) {
          // Instead of logging an error, set an error message to display in a modal dialog.
          setErrorMessage('AlbumNode already exists');
          return;
        }
        const newAlbum: MediaContentNode | undefined = await createAlbum();
        if (!newAlbum) return;
        albumNodeId = newAlbum.id;
      } else if (!albumNodeId) {
        // Instead of logging an error, set an error message to display in a modal dialog.
        setErrorMessage('No album selected');
        return;
      }
      console.log('import files: ', baseDirectory, albumNodeId, selectedFiles);
      await handleImportFromDrive(baseDirectory, albumNodeId, selectedFiles);
    }
  };

  const handleImportFromDrive = async (baseDirectory: string, albumNodeId: string, selectedFiles: FileList) => {
    setFileProgress({});
    setFileStatuses({});
    setProcessingComplete(false);

    const uploadUrl = getServerUrl() + apiUrlFragment + 'importPhotos';

    const files: FileToImport[] = [];
    for (const key in selectedFiles) {
      if (Object.prototype.hasOwnProperty.call(selectedFiles, key)) {
        const selectedFile: File = selectedFiles[key];
        const file: FileToImport = {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
          lastModified: selectedFile.lastModified,
          lastModifiedDate: (selectedFile as any).lastModifiedDate,
        };
        files.push(file);
      }
    }

    const uploadBody = {
      baseDirectory,
      albumId: albumNodeId,
      files,
    };

    try {
      const response = await axios.post(uploadUrl, uploadBody, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
          );

          // ✅ Update each file's progress separately
          const updatedProgress = { ...fileProgress };
          files.forEach((file) => (updatedProgress[file.name] = percentCompleted));
          setFileProgress(updatedProgress);
        },
      });

      console.log("Upload started:", response.data);
      files.forEach((file) => setFileStatuses((prev) => ({ ...prev, [file.name]: "processing" })));

      await checkProcessingComplete(response.data.importId);

      props.onLoadMediaItemCounts();

      console.log("Processing is fully complete!");

    } catch (error) {
      console.error("Upload failed", error);
    }
  };

  const getFileStatusLabel = (status: FileStatus): string => {
    switch (status) {
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Processing...";
      case "completed":
        return "✅ Done";
      case "conversion failed":
        return "❌ Conversion Failed";
      default:
        return "Unknown Status";
    }
  };

  return (
    <>
      <Dialog onClose={handleClose} open={props.open} maxWidth="md" fullWidth>
        <DialogTitle>Import Markdown</DialogTitle>
        <DialogContent style={{ paddingTop: '6px', paddingBottom: '0px' }} sx={{ width: '100%', minWidth: '500px' }}>
          {processingComplete && (
            <Alert severity="success" sx={{ mb: 2, fontSize: '1.2rem', textAlign: 'center' }}>
              Processing Complete!
            </Alert>
          )}
          <input
            type="file"
            accept=".jpg,.heic,image/jpeg,image/heic"
            onChange={handleImportFilesSelect}
            id="importFilesInput"
            name="file"
            multiple
            style={{ marginTop: '1rem' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button onClick={handleImport} autoFocus disabled={!selectedFiles || selectedFiles.length === 0 || (baseDirectory === '') || (!isAlbumNode(props.parentMediaContentNode) && !newAlbumName.trim())}>
            Import
          </Button>
        </DialogActions>
      </Dialog >

      {errorMessage && (
        <Dialog open={true} onClose={() => setErrorMessage(null)}>
          <DialogTitle>Error</DialogTitle>
          <DialogContent>
            <Alert severity="error">{errorMessage}</Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setErrorMessage(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )
      }
    </>
  );
};

function mapStateToProps(state: any) {
  return {
    appInitialized: getAppInitialized(state),
    displayedAlbumNodeIds: getDisplayedAlbumNodeIds(state),
    albumNodes: getMediaContentTree(state),
  };
}

const mapDispatchToProps = (dispatch: TedTaggerDispatch) => {
  return bindActionCreators({
    onAddAlbumNode: addAlbumToTree,
    onSetDisplayedAlbumNodeIds: setDisplayedAlbumNodeIds,
    onReloadMediaItemsByViewSpec: reloadMediaItemsByViewSpec,
    onLoadMediaItemCounts: loadMediaItemCounts,
  }, dispatch);
};

export default connect(mapStateToProps, mapDispatchToProps)(ImportFromDriveDialog);

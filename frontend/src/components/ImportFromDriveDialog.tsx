import * as React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { Button, DialogActions, DialogContent, Alert } from '@mui/material';
import { getServerUrl, apiUrlFragment, FileToImport } from '../types';
import axios from 'axios';


export interface ImportFromDriveDialogPropsFromParent {
  open: boolean;
  onClose: () => void;
}

export interface ImportFromDriveDialogProps extends ImportFromDriveDialogPropsFromParent {
}

const ImportFromDriveDialog = (props: ImportFromDriveDialogProps) => {

  const [selectedFiles, setSelectedFiles] = React.useState<FileList | null>(null);

  const [processingComplete, setProcessingComplete] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (props.open) {
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

  const handleImport = async () => {
    console.log('handleImport: ', selectedFiles);
    if (selectedFiles && (selectedFiles.length > 0)) {
      // await handleImportFromDrive(baseDirectory, albumNodeId, selectedFiles);

      const uploadUrl = getServerUrl() + apiUrlFragment + 'importMarkdown';
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
        files,
      };

      try {
        const response = await axios.post(uploadUrl, uploadBody);

        console.log("Upload started:", response.data);
        console.log("Processing is fully complete!");

      } catch (error) {
        console.error("Upload failed", error);
      }
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
            accept=".md"
            onChange={handleImportFilesSelect}
            id="importFilesInput"
            name="file"
            multiple
            style={{ marginTop: '1rem' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button onClick={handleImport} autoFocus disabled={!selectedFiles || selectedFiles.length === 0}>
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
  };
}

const mapDispatchToProps = (dispatch: any) => {
  return bindActionCreators({
  }, dispatch);
};

export default connect(mapStateToProps, mapDispatchToProps)(ImportFromDriveDialog);

import * as React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { Button, DialogActions, DialogContent, Alert, TextField } from '@mui/material';
import { ProjectsState } from '../types';
import { uploadFile } from '../controllers';

export interface ImportFromDriveDialogPropsFromParent {
  open: boolean;
  onAppendParsedMarkdown: (parsedMarkdown: ProjectsState) => void;
  onClose: () => void;
}

export interface ImportFromDriveDialogProps extends ImportFromDriveDialogPropsFromParent {
  onUploadFile: (data: FormData) => any;
}

const ImportFromDriveDialog = (props: ImportFromDriveDialogProps) => {
  const [selectedFiles, setSelectedFiles] = React.useState<FileList | null>(null);
  const [projectName, setProjectName] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleClose = () => {
    props.onClose();
  };

  const handleImportFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setSelectedFiles(event.target.files);
      const defaultName = file.name.replace(/\.md$/i, '');
      setProjectName(defaultName);
    }
  };

  const handleImport = async () => {
    if (!selectedFiles) return;

    const formData = new FormData();
    Array.from(selectedFiles).forEach(file => {
      formData.append('files', file);
    });
    formData.append('projectName', projectName);

    try {
      const response = await props.onUploadFile(formData);
      const parsedMarkdown: ProjectsState = response.data;
      props.onAppendParsedMarkdown(parsedMarkdown);
      handleClose();
    } catch (err) {
      console.error('uploadFile returned error:', err);
      setErrorMessage('Failed to upload markdown file.');
    }
  };

  return (
    <>
      <Dialog onClose={handleClose} open={props.open} maxWidth="md" fullWidth>
        <DialogTitle>Import Markdown</DialogTitle>
        <DialogContent sx={{ pt: 1, pb: 0, minWidth: '500px' }}>
          <input
            type="file"
            accept=".md"
            onChange={handleImportFilesSelect}
            id="importFilesInput"
            name="file"
            style={{ marginTop: '1rem', display: 'block' }}
          />
          <TextField
            fullWidth
            margin="normal"
            label="Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button
            onClick={handleImport}
            autoFocus
            disabled={!selectedFiles || selectedFiles.length === 0 || !projectName.trim()}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>

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
      )}
    </>
  );
};

const mapDispatchToProps = (dispatch: any) => {
  return bindActionCreators({
    onUploadFile: uploadFile,
  }, dispatch);
};

export default connect(null, mapDispatchToProps)(ImportFromDriveDialog);

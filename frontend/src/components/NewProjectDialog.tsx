import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useState } from 'react';
import { RootState, createProject } from '../redux';

const CreateProjectDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dispatch = useDispatch();
  const existingNames = useSelector((state: RootState) =>
    state.projects.projectList.map(p => p.name.toLowerCase())
  );

  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Project name is required');
      return;
    }
    if (existingNames.includes(trimmed.toLowerCase())) {
      setError('Project name must be unique');
      return;
    }

    const result = await dispatch(createProject(trimmed) as any);
    if (result.meta.requestStatus === 'fulfilled') {
      onClose();
      setName('');
    } else {
      setError(result.payload || 'Error creating project');
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Create New Project</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Project Name"
          fullWidth
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          error={!!error}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate}>Create</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateProjectDialog;

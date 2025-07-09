// components/SelectProjectDialog.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';

interface SelectProjectDialogProps {
  open: boolean;
  currentProjectId: string;
  onClose: () => void;
  onConfirm: (targetProjectId: string) => void;
}

const SelectProjectDialog: React.FC<SelectProjectDialogProps> = ({
  open,
  currentProjectId,
  onClose,
  onConfirm,
}) => {
  const projectList = useSelector((state: RootState) => state.projects.projectList);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectableProjects = projectList.filter((p) => p.id !== currentProjectId);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Select a Target Project</DialogTitle>
      <DialogContent>
        {selectableProjects.length === 0 ? (
          <Typography>No other projects available</Typography>
        ) : (
          <List>
            {selectableProjects.map((project) => (
              <ListItemButton
                key={project.id}
                selected={selectedProjectId === project.id}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <ListItemText primary={project.name} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!selectedProjectId}
          onClick={() => selectedProjectId && onConfirm(selectedProjectId)}
        >
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SelectProjectDialog;

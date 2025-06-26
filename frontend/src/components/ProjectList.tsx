// components/ProjectList.tsx
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';

import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Collapse,
  Button,
  Divider,
  TextField,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';

import { renameProject, setSelectedChatId } from '../redux/projectsSlice';

const ProjectList: React.FC = () => {

  const dispatch = useDispatch<AppDispatch>();

  const projects = useSelector((state: RootState) => state.projects.projectList);
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const [editProjectName, setEditProjectName] = useState('');
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set(projects.map((p) => p.id))
  );
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const updated = new Set(prev);
      updated.has(projectId) ? updated.delete(projectId) : updated.add(projectId);
      return updated;
    });
  };

  return (
    <Box p={2}>
      <Button variant="contained" fullWidth sx={{ mb: 2 }}>
        + New Project
      </Button>

      {projects.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 4, fontStyle: 'italic' }}>No projects found.</Box>
      ) : (
        projects.map((project) => (
          <Box key={project.id}>
            <ListItem
              disableGutters
              secondaryAction={
                <Box>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditingProjectId(project.id);
                      setEditProjectName(project.name);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <ListItemIcon
                onClick={() => toggleProject(project.id)}
                sx={{ minWidth: '30px', cursor: 'pointer' }}
              >
                {expandedProjectIds.has(project.id) ? <ExpandLess /> : <ExpandMore />}
              </ListItemIcon>
              {editingProjectId === project.id ? (
                <TextField
                  fullWidth
                  size="small"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  onBlur={() => {
                    if (editProjectName.trim() !== project.name) {
                      dispatch(renameProject({ projectId: project.id, name: editProjectName.trim() }));
                    }
                    setEditingProjectId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  autoFocus
                />
              ) : (
                <ListItemText primary={project.name} />
              )}
            </ListItem>

            <Collapse in={expandedProjectIds.has(project.id)} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {project.chats.map((chat) => (
                  <ListItem
                    key={chat.id}
                    sx={{
                      pl: 4,
                      backgroundColor: selectedChatId === chat.id ? 'action.selected' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => dispatch(setSelectedChatId(chat.id))}
                  >
                    <ListItemText primary={`• ${chat.title}`} />
                  </ListItem>
                ))}
              </List>
            </Collapse>

            <Divider sx={{ my: 1 }} />
          </Box>
        ))
      )}
    </Box>
  );
};

export default ProjectList;

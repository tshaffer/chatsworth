// components/ProjectList.tsx
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import ImportFromDriveDialog from './ImportFromDriveDialog';
import { uploadFile } from '../controllers';
import { appendParsedMarkdown } from '../redux/projectsSlice'; // Make sure this exists
import { ProjectsState } from '../types';

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

import { renameChat, renameProject, setSelectedChatId } from '../redux/projectsSlice';

const ProjectList: React.FC = () => {

  const dispatch = useDispatch<AppDispatch>();

  const projects = useSelector((state: RootState) => state.projects.projectList);
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const [editProjectName, setEditProjectName] = useState('');
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set(projects.map((p) => p.id))
  );
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatTitle, setEditChatTitle] = useState('');

  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const updated = new Set(prev);
      updated.has(projectId) ? updated.delete(projectId) : updated.add(projectId);
      return updated;
    });
  };

  return (
    <Box p={2}>
      <Button variant="contained" fullWidth sx={{ mb: 1 }}>
        + New Project
      </Button>
      <Button
        variant="outlined"
        fullWidth
        sx={{ mb: 2 }}
        onClick={() => setImportDialogOpen(true)}
      >
        Import Markdown
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
                      cursor: editingChatId === chat.id ? 'default' : 'pointer',
                    }}
                    onClick={() => {
                      if (editingChatId !== chat.id) {
                        dispatch(setSelectedChatId(chat.id));
                      }
                    }}
                    secondaryAction={
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation(); // prevent triggering selection when clicking ✎
                          setEditingChatId(chat.id);
                          setEditChatTitle(chat.title);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    {editingChatId === chat.id ? (
                      <TextField
                        fullWidth
                        size="small"
                        value={editChatTitle}
                        onChange={(e) => setEditChatTitle(e.target.value)}
                        onBlur={() => {
                          if (editChatTitle.trim() !== chat.title) {
                            dispatch(renameChat({ chatId: chat.id, title: editChatTitle.trim() }));
                          }
                          setEditingChatId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <ListItemText primary={`• ${chat.title}`} />
                    )}
                  </ListItem>
                ))}
              </List>
            </Collapse>

            <Divider sx={{ my: 1 }} />
          </Box>
        ))
      )}
      <ImportFromDriveDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onAppendParsedMarkdown={(parsed: ProjectsState) => {
          dispatch(appendParsedMarkdown(parsed));
        }}
      />
    </Box>
  );
};

export default ProjectList;

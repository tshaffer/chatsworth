// components/ProjectList.tsx
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import {
  appendParsedMarkdown,
  deleteProject,
  moveChatToProject,
  renameChat,
  renameProject,
  setSelectedChatId,
} from '../redux/projectsSlice';
import { Project, ProjectsState, Chat } from '../types';

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
  Delete as DeleteIcon,
} from '@mui/icons-material';

import React, { useState, useEffect, useMemo } from 'react';
import ChatContextMenu from './ChatContextMenu';
import CreateProjectDialog from './NewProjectDialog';
import SelectProjectDialog from './SelectProjectDialog';
import ImportFromDriveDialog from './ImportFromDriveDialog';
import ConfirmDeleteProjectDialog from './ConfirmDeleteDialog';
import { selectSelectedProjectId } from '../redux/selectors/projectSelectors';

interface ProjectListProps {
  searchQuery?: string | null;
}

const ProjectList: React.FC<ProjectListProps> = ({ searchQuery }) => {
  const dispatch = useDispatch<AppDispatch>();
  const allProjects = useSelector((state: RootState) => state.projects.projectList);
  const selectedProjectId = useSelector(selectSelectedProjectId);
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);

  const [editProjectName, setEditProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatTitle, setEditChatTitle] = useState('');

  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuContext, setMenuContext] = useState<{
    chatId: string;
    projectId: string;
    index: number;
    total: number;
  } | null>(null);

  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [chatToMove, setChatToMove] = useState<{ chatId: string; projectId: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const normalizedQuery = searchQuery?.toLowerCase().trim();

  const isMatch = (chat: Chat): boolean => {
    if (!normalizedQuery) return true;
    return (
      chat.title.toLowerCase().includes(normalizedQuery) ||
      chat.entries.some((entry) =>
        entry.originalPrompt?.toLowerCase().includes(normalizedQuery) ||
        entry.promptSummary?.toLowerCase().includes(normalizedQuery) ||
        entry.response?.toLowerCase().includes(normalizedQuery)
      )
    );
  };

  const projects = useMemo(() => {
    if (!searchQuery) return allProjects;

    return allProjects
      .map((project) => ({
        ...project,
        chats: project.chats.filter(isMatch),
      }))
      .filter((project) => project.chats.length > 0);
  }, [searchQuery, allProjects]);

  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Expand matching projects when searchQuery changes
  useEffect(() => {
    if (!searchQuery) {
      // Restore all projects expanded when search is cleared
      setExpandedProjectIds(new Set(allProjects.map((p) => p.id)));
      return;
    }

    const matching = new Set<string>();
    for (const project of allProjects) {
      if (project.chats.some(isMatch)) {
        matching.add(project.id);
      }
    }

    setExpandedProjectIds(matching);
  }, [searchQuery, allProjects]);

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const updated = new Set(prev);
      updated.has(projectId) ? updated.delete(projectId) : updated.add(projectId);
      return updated;
    });
  };

  return (
    <Box p={2}>
      <Button variant="contained" fullWidth sx={{ mb: 1 }} onClick={() => setNewProjectDialogOpen(true)}>
        + New Project
      </Button>
      <Button variant="outlined" fullWidth sx={{ mb: 2 }} onClick={() => setImportDialogOpen(true)}>
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
                  <IconButton size="small" onClick={() => {
                    setEditingProjectId(project.id);
                    setEditProjectName(project.name);
                  }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => {
                    setProjectToDelete(project);
                    setDeleteDialogOpen(true);
                  }}>
                    <DeleteIcon fontSize="small" />
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
                {project.chats.map((chat, index) => (
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
                          e.stopPropagation();
                          setMenuAnchorEl(e.currentTarget);
                          setMenuContext({
                            chatId: chat.id,
                            projectId: project.id,
                            index,
                            total: project.chats.length,
                          });
                        }}
                      >
                        <MoreVertIcon fontSize="small" />
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

      <ChatContextMenu
        anchorEl={menuAnchorEl}
        context={menuContext}
        onClose={() => {
          setMenuAnchorEl(null);
          setMenuContext(null);
        }}
        onRename={(chatId, title) => {
          setEditingChatId(chatId);
          setEditChatTitle(title);
        }}
        onMoveToProject={(chatId, projectId) => {
          setChatToMove({ chatId, projectId });
          setMoveDialogOpen(true);
        }}
      />

      {projectToDelete && (
        <ConfirmDeleteProjectDialog
          open={deleteDialogOpen}
          projectName={projectToDelete.name}
          onCancel={() => {
            setDeleteDialogOpen(false);
            setProjectToDelete(null);
          }}
          onConfirm={() => {
            if (projectToDelete) {
              dispatch(deleteProject(projectToDelete.id));
              setDeleteDialogOpen(false);
              setProjectToDelete(null);
            }
          }}
        />
      )}

      <ImportFromDriveDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        existingProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
        onAppendParsedMarkdown={(parsed: ProjectsState) => {
          dispatch(appendParsedMarkdown(parsed));
        }}
      />

      <CreateProjectDialog open={newProjectDialogOpen} onClose={() => setNewProjectDialogOpen(false)} />

      <SelectProjectDialog
        open={moveDialogOpen}
        currentProjectId={chatToMove?.projectId ?? ''}
        onClose={() => {
          setMoveDialogOpen(false);
          setChatToMove(null);
        }}
        onConfirm={(targetProjectId) => {
          if (chatToMove) {
            dispatch(
              moveChatToProject({
                chatId: chatToMove.chatId,
                sourceProjectId: chatToMove.projectId,
                targetProjectId,
              })
            );
          }
          setMoveDialogOpen(false);
          setChatToMove(null);
        }}
      />
    </Box>
  );
};

export default ProjectList;

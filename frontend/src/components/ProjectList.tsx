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
import {
  Project,
  SemanticSearchResults,
  SemanticSearchResultProject,
} from '../types';

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

import { makeSelectFilteredProjects } from '../redux/selectors/searchSelectors';

interface ProjectListProps {
  searchQuery?: string | null;
  semanticResults?: SemanticSearchResults | null;
}

const ProjectList: React.FC<ProjectListProps> = ({ searchQuery, semanticResults }) => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const allProjects = useSelector((state: RootState) => state.projects.projectList);

  // Centralized filtering (keyword or semantic)
  const filteredSelector = useMemo(() => {
    const sel = makeSelectFilteredProjects();
    return (state: RootState) =>
      sel(state, {
        query: searchQuery ?? '',
        mode: semanticResults ? 'semantic' as const : 'fulltext' as const,
        semantic: semanticResults ?? null,
      });
  }, [searchQuery, semanticResults]);

  const filtered = useSelector(filteredSelector);

  // The rest of this component expects either real Projects or "semantic-like" projects.
  // `filtered` is already in the semantic-like form, so we just use that.
  const projects = filtered as unknown as (SemanticSearchResultProject | Project)[];

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
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Auto-expand:
  // - No search → expand all projects
  // - With search or semantic results → expand only those with chats
  useEffect(() => {
    const expanded = new Set<string>();

    if (!searchQuery && !semanticResults) {
      allProjects.forEach((p) => expanded.add(p.id));
    } else {
      const toCheck: (Project | SemanticSearchResultProject)[] =
        (semanticResults as any) ?? projects;
      toCheck.forEach((project) => {
        const projectId = isSemanticProject(project) ? project.projectId : project.id;
        if (project.chats.length > 0) {
          expanded.add(projectId);
        }
      });
    }

    setExpandedProjectIds(expanded);
  }, [searchQuery, semanticResults, allProjects, projects]);

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const updated = new Set(prev);
      updated.has(projectId) ? updated.delete(projectId) : updated.add(projectId);
      return updated;
    });
  };

  const isSemanticProject = (p: SemanticSearchResultProject | Project): p is SemanticSearchResultProject =>
    'projectId' in p;

  const getProjectId = (p: SemanticSearchResultProject | Project): string =>
    isSemanticProject(p) ? p.projectId : p.id;

  const getProjectName = (p: SemanticSearchResultProject | Project): string =>
    isSemanticProject(p) ? p.projectName : p.name;

  const isSemanticChat = (chat: any): chat is { chatId: string; chatTitle: string } =>
    'chatId' in chat && 'chatTitle' in chat;

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
        projects.map((project) => {
          const projectId = isSemanticProject(project) ? project.projectId : (project as Project).id;
          const projectName = isSemanticProject(project) ? project.projectName : (project as Project).name;

          return (
            <Box key={projectId}>
              <ListItem
                disableGutters
                secondaryAction={
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditingProjectId(projectId);
                        setEditProjectName(projectName);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>

                    {!isSemanticProject(project) && (
                      <IconButton
                        size="small"
                        onClick={() => {
                          setProjectToDelete(project as Project);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}

                    <IconButton size="small">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemIcon
                  onClick={() => toggleProject(projectId)}
                  sx={{ minWidth: '30px', cursor: 'pointer' }}
                >
                  {expandedProjectIds.has(projectId) ? <ExpandLess /> : <ExpandMore />}
                </ListItemIcon>
                {editingProjectId === projectId ? (
                  <TextField
                    fullWidth
                    size="small"
                    value={editProjectName}
                    onChange={(e) => setEditProjectName(e.target.value)}
                    onBlur={() => {
                      const trimmed = editProjectName.trim();
                      if (trimmed && trimmed !== projectName) {
                        dispatch(renameProject({ projectId, name: trimmed }));
                      }
                      setEditingProjectId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <ListItemText primary={projectName} />
                )}
              </ListItem>

              <Collapse in={expandedProjectIds.has(projectId)} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {project.chats.map((chat: any, index: number) => {
                    const chatId = isSemanticChat(chat) ? chat.chatId : chat.id;
                    const chatTitle = isSemanticChat(chat) ? chat.chatTitle : chat.title;

                    return (
                      <ListItem
                        key={chatId}
                        sx={{
                          pl: 4,
                          backgroundColor: selectedChatId === chatId ? 'action.selected' : undefined,
                          cursor: editingChatId === chatId ? 'default' : 'pointer',
                        }}
                        onClick={() => {
                          if (editingChatId !== chatId) {
                            dispatch(setSelectedChatId(chatId));
                          }
                        }}
                        secondaryAction={
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuAnchorEl(e.currentTarget);
                              setMenuContext({ chatId, projectId, index, total: project.chats.length });
                            }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        {editingChatId === chatId ? (
                          (() => {
                            debugger; return (
                              <TextField
                                fullWidth
                                size="small"
                                value={editChatTitle}
                                onChange={(e) => setEditChatTitle(e.target.value)}
                                onBlur={() => {
                                  const trimmed = editChatTitle.trim();
                                  if (trimmed && trimmed !== chatTitle) {
                                    dispatch(renameChat({ chatId, title: trimmed }));
                                  }
                                  setEditingChatId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  // optional: prevent ListItem click bubbling just in case
                                  e.stopPropagation?.();
                                }}
                                autoFocus
                                // ✅ color the actual input text
                                sx={{
                                  '& .MuiInputBase-input': { color: '#17e786ff' },
                                }}
                              />
                            );
                          })()
                        ) : (<ListItemText
                          primary={`• ${chatTitle}`}
                          primaryTypographyProps={{
                            // this only applies in the non-editing branch
                            sx: { color: 'pink' },
                          }}
                          secondaryTypographyProps={{ sx: { color: 'green' } }}
                        />
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              </Collapse>
              <Divider sx={{ my: 1 }} />
            </Box>
          );
        })
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
            dispatch(deleteProject(projectToDelete.id));
            setDeleteDialogOpen(false);
            setProjectToDelete(null);
          }}
        />
      )}

      <ImportFromDriveDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        existingProjects={projects.map((p) => ({
          id: getProjectId(p),
          name: getProjectName(p),
        }))}
        onAppendParsedMarkdown={(parsed) => {
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

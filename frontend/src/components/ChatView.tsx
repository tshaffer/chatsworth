import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Collapse,
  Paper,
  Box,
  TextField,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Autocomplete,
  CircularProgress,
  Snackbar,
  Alert,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Download as DownloadIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  MoreVert as MoreVertIcon,
  DriveFileMove as DriveFileMoveIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import { fetchChatEntries, updateResponse } from '../redux/chatEntriesSlice';
import { selectProjectIdByChatId } from '../redux';
import { makeSelectChatEntriesByChatId } from '../redux/selectors/chatEntriesSelectors';
import {
  Chat,
  SemanticSearchResults,
  SemanticSearchResultEntry,
  ChatEntry as TypesChatEntry,
  Project as TypesProject,
} from '../types';
import '../styles/markdownStyles.css';

// 1) Make id resolver robust (near top of file)
const getEntryId = (e: any): string => {
  if (!e) return '';
  const candidates = [
    e.entryId,       // domain/semantic results often provide this
    e._id,           // Mongo
    e.id,            // sometimes normalized
    e.entry?.entryId,
    e.entry?._id,
    e.entry?.id,
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

type EntryLike = SemanticSearchResultEntry | (TypesChatEntry & { _id?: string });

interface Props {
  selectedChatId: string | null;
  searchQuery?: string | null;
  semanticResults?: SemanticSearchResults | null;
}

/** Small helper to create a concise label for the entry being moved */
const summarizeEntry = (entry: EntryLike): string => {
  const ps = (entry as any).promptSummary?.trim();
  if (ps) return ps.length > 140 ? ps.slice(0, 140) + '…' : ps;
  const op = (entry as any).originalPrompt?.trim() ?? '';
  return op.length > 140 ? op.slice(0, 140) + '…' : op || '(no prompt text)';
};

/** Dialog component for choosing destination and confirming the move */
const MoveEntryDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  entryLabel: string;
  entryId: string;
  projects: TypesProject[];
  initialProjectId?: string | null;
  onMoved: (args: { toChatId: string; fromChatId?: string }) => void;
}> = ({ open, onClose, entryLabel, entryId, projects, initialProjectId, onMoved }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedProjectId(initialProjectId ?? null);
      setSelectedChatId(null);
      setPlacement('bottom');
      setSubmitting(false);
      setError(null);
    }
  }, [open, initialProjectId]);

  const projectOptions = projects;
  const selectedProject = projectOptions.find((p) => p.id === selectedProjectId) || null;
  const chatOptions = selectedProject?.chats ?? [];
  const selectedChat = chatOptions.find((c) => c.id === selectedChatId) || null;

  const canSubmit = !!selectedProject && !!selectedChat && !submitting;

  const handleSubmit = async () => {
    if (!selectedProject || !selectedChat) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: any = {
        entryId, // backend accepts either Mongo _id or our string entryId
        toChatId: selectedChat.id,
        toProjectId: selectedProject.id,
      };
      if (placement === 'top') body.newIndex = 0;

      const resp = await fetch('/api/v1/chat-entries/moveChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Move failed');
      }

      // Optionally read from backend if it returns fromChatId, etc.
      let payload: any = null;
      try { payload = await resp.json(); } catch { /* ok if no JSON */ }

      // notify parent which chats to refresh
      onMoved({
        toChatId: selectedChat.id,
        fromChatId: payload?.fromChatId, // if your API returns it; otherwise omit
      });

      onClose();

    } catch (e: any) {
      setError(e?.message || 'Failed to move entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Move Entry</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary">
          Moving:
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>{entryLabel}</Typography>

        <Autocomplete
          fullWidth
          options={projectOptions}
          getOptionLabel={(p) => p.name}
          value={selectedProject}
          onChange={(_, v) => {
            setSelectedProjectId(v?.id ?? null);
            setSelectedChatId(null);
          }}
          renderInput={(params) => <TextField {...params} label="Destination Project" size="small" />}
          sx={{ mb: 2 }}
        />

        <Autocomplete
          fullWidth
          options={chatOptions}
          getOptionLabel={(c) => c.title}
          value={selectedChat}
          onChange={(_, v) => setSelectedChatId(v?.id ?? null)}
          renderInput={(params) => <TextField {...params} label="Destination Chat" size="small" />}
          disabled={!selectedProject}
          sx={{ mb: 2 }}
        />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Placement
        </Typography>
        <RadioGroup
          row
          value={placement}
          onChange={(e) => setPlacement(e.target.value as 'top' | 'bottom')}
          sx={{ mb: 1 }}
        >
          <FormControlLabel value="bottom" control={<Radio size="small" />} label="Bottom (default)" />
          <FormControlLabel value="top" control={<Radio size="small" />} label="Top" />
        </RadioGroup>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={submitting ? <CircularProgress size={16} /> : <DriveFileMoveIcon />}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ChatView: React.FC<Props> = ({ selectedChatId, searchQuery, semanticResults }) => {
  const dispatch = useDispatch<AppDispatch>();

  const allProjects = useSelector((state: RootState) => state.projects.projectList);
  const selectedProjectId = useSelector((state: RootState) =>
    selectedChatId ? selectProjectIdByChatId(state, selectedChatId) : null
  );

  // Redux entries (normalized) via memoized selector
  const selectEntriesForChat = useMemo(makeSelectChatEntriesByChatId, []);
  const reduxChatEntries = useSelector((state: RootState) =>
    selectedChatId ? (selectEntriesForChat(state, selectedChatId) as unknown as EntryLike[]) : []
  );

  // Prefer semantic results when present, otherwise Redux entries
  const chatEntries: EntryLike[] = useMemo(() => {
    if (semanticResults && selectedChatId) {
      for (const project of semanticResults) {
        for (const chat of project.chats) {
          if (chat.chatId === selectedChatId) {
            return chat.entries as EntryLike[];
          }
        }
      }
      return [];
    }
    return reduxChatEntries;
  }, [semanticResults, selectedChatId, reduxChatEntries]);

  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;

    if (semanticResults) {
      for (const project of semanticResults) {
        for (const chat of project.chats) {
          if (chat.chatId === selectedChatId) {
            return { id: chat.chatId, title: chat.chatTitle };
          }
        }
      }
      return null;
    } else {
      const chat = allProjects.flatMap((p) => p.chats).find((c) => c.id === selectedChatId);
      return chat ? { id: chat.id, title: chat.title } : null;
    }
  }, [selectedChatId, semanticResults, allProjects]);

  useEffect(() => {
    if (!semanticResults && selectedChatId) {
      // Always revalidate on navigation to ensure we see fresh ordering / moved items
      dispatch(fetchChatEntries({ chatId: selectedChatId }));
    }
  }, [dispatch, semanticResults, selectedChatId]);

  useEffect(() => {
    // Reset any per-chat “hidden” state when switching chats
    setHiddenEntryIds({});
    setExpandedResponses({});
    setEditingPromptIndex(null);
    setEditPromptValue('');
    setEditingResponseIndex(null);
    setEditValue('');
  }, [selectedChatId]);

  // Fetch entries when in keyword mode and not already loaded
  useEffect(() => {
    if (!semanticResults && selectedChatId && reduxChatEntries.length === 0) {
      dispatch(fetchChatEntries({ chatId: selectedChatId }));
    }
  }, [dispatch, semanticResults, selectedChatId, reduxChatEntries.length]);

  const loadingEntries = false;

  const [editingResponseIndex, setEditingResponseIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // promptSummary editing state
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editPromptValue, setEditPromptValue] = useState('');
  const [promptSummaryOverrides, setPromptSummaryOverrides] = useState<Record<string, string>>({});

  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});

  // NEW: per-entry “more” menu and move dialog state
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuEntryIndex, setMenuEntryIndex] = useState<number | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveEntryId, setMoveEntryId] = useState<string>('');
  const [moveEntryLabel, setMoveEntryLabel] = useState<string>('');

  // NEW: local hide for entries successfully moved away (optimistic UX)
  const [hiddenEntryIds, setHiddenEntryIds] = useState<Record<string, true>>({});

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

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

  const isVisible = useMemo(() => {
    if (!selectedChat || !searchQuery) return true;

    if (semanticResults) {
      return semanticResults.some(project =>
        project.chats.some(chat => chat.chatId === selectedChat.id)
      );
    }

    return isMatch({
      id: selectedChat.id,
      title: selectedChat.title,
      entries: chatEntries as any,
    } as Chat);
  }, [selectedChat, searchQuery, semanticResults, chatEntries]);

  const toggleResponse = (index: number) => {
    const key = `${selectedChat?.id}-${index}`;
    setExpandedResponses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 2) Replace the dummy handler with a real save (inside component)
  const handleConfirmPromptSummaryRename = async (entry: EntryLike, index: number) => {
    const id = getEntryId(entry);
    const newSummary = editPromptValue.trim();

    // Exit edit mode immediately (better UX), and apply optimistic local value
    setEditingPromptIndex(null);
    setEditPromptValue('');
    if (!id) {
      alert('Cannot save: entry id is missing.');
      return;
    }

    const previousId = id;
    const previousValue = (entry as any).promptSummary ?? '';
    setPromptSummaryOverrides((prev) => ({ ...prev, [previousId]: newSummary }));

    try {
      const resp = await fetch(`/api/v1/chatEntries/${encodeURIComponent(id)}/promptSummary`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptSummary: newSummary }),
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to save prompt summary');
      }

      // (Optional) if you want a canonical refresh in keyword mode
      if (!semanticResults && selectedChatId) {
        dispatch(fetchChatEntries({ chatId: selectedChatId }));
      }
    } catch (err) {
      console.error('Save promptSummary failed:', err);
      // revert optimistic change
      setPromptSummaryOverrides((prev) => {
        const copy = { ...prev };
        copy[previousId] = previousValue;
        return copy;
      });
      alert('Saving prompt summary failed. Please try again.');
    }
  };

  const handleCancelPromptSummaryRename = () => {
    setEditingPromptIndex(null);
    setEditPromptValue('');
  };

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>, index: number) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuEntryIndex(index);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setMenuEntryIndex(null);
  };

  const openMoveDialogForIndex = (index: number) => {
    const entry = chatEntries[index];
    const id = getEntryId(entry);

    if (!id) {
      console.warn('[MoveEntry] Missing id on entry:', entry);
      setSnackbar({ open: true, message: 'Sorry—this entry has no id and cannot be moved.', severity: 'error' });
      return;
    }

    setMoveEntryId(id);
    setMoveEntryLabel(summarizeEntry(entry));
    setMoveOpen(true);
  };

  type MovedArgs = { toChatId: string; fromChatId?: string };

  const handleMoved = ({ toChatId, fromChatId }: MovedArgs) => {
    // Hide just-moved entry in the current list (optimistic)
    setHiddenEntryIds((prev) => ({ ...prev, [moveEntryId]: true }));

    // Revalidate both sides
    if (fromChatId) dispatch(fetchChatEntries({ chatId: fromChatId }));
    dispatch(fetchChatEntries({ chatId: toChatId }));

    setSnackbar({ open: true, message: 'Entry moved', severity: 'success' });
  };

  if (!selectedChat) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4, fontStyle: 'italic' }}>
        Select a chat to view its details.
      </Box>
    );
  }

  if (!isVisible) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4, fontStyle: 'italic' }}>
        Selected chat does not match the current search.
      </Box>
    );
  }

  const isKeywordMode = !semanticResults;
  const isUnloaded = isKeywordMode && selectedChatId && reduxChatEntries.length === 0;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {selectedChat.title}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <IconButton
          size="small"
          onClick={async () => {
            try {
              const response = await fetch(`/api/v1/chats/${selectedChat.id}/export`);
              if (!response.ok) throw new Error('Failed to export chat');
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              let filename = selectedChat.title || 'chat';
              if (!filename.endsWith('.md')) filename += '.md';
              a.download = filename;
              a.click();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              console.error('Export failed:', err);
              alert('Failed to export chat. Please try again.');
            }
          }}
          title="Export Chat as Markdown"
        >
          <DownloadIcon />
        </IconButton>
      </Box>

      {isUnloaded ? (
        <Typography variant="body2" color="text.secondary">
          Loading entries...
        </Typography>
      ) : chatEntries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No entries in this chat.
        </Typography>
      ) : (
        <List disablePadding>
          {chatEntries.map((entry: EntryLike, index: number) => {
            const entryId = getEntryId(entry);
            if (hiddenEntryIds[entryId]) return null; // hide after move

            const key = `${selectedChat.id}-${index}`;
            const expanded = expandedResponses[key] || false;

            const originalSummary = (entry as any).promptSummary ?? '';
            const displaySummary = promptSummaryOverrides[entryId] ?? originalSummary;

            return (
              <React.Fragment key={key}>
                <ListItemButton onClick={() => toggleResponse(index)}>
                  <ListItemText
                    primary={
                      <>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          Prompt:
                        </Typography>

                        {/* promptSummary (editable) */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 1,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Box sx={{ flexGrow: 1, pr: 1 }}>
                            {editingPromptIndex === index ? (
                              <TextField
                                fullWidth
                                size="small"
                                value={editPromptValue}
                                onChange={(e) => setEditPromptValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleConfirmPromptSummaryRename(entry, index);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelPromptSummaryRename();
                                  }
                                }}
                                placeholder="Enter a concise prompt summary"
                              />
                            ) : (
                              <ReactMarkdown>{displaySummary}</ReactMarkdown>
                            )}
                          </Box>

                          {editingPromptIndex === index ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Tooltip title="Save">
                                <IconButton
                                  size="small"
                                  onClick={() => handleConfirmPromptSummaryRename(entry, index)}
                                >
                                  <CheckIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <IconButton size="small" onClick={handleCancelPromptSummaryRename}>
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Tooltip title="Edit prompt summary">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPromptIndex(index);
                                    setEditPromptValue(displaySummary);
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              {/* NEW: per-entry more menu (Move…) */}
                              <Tooltip title="More">
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleOpenMenu(e, index)}
                                >
                                  <MoreVertIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </Box>
                      </>
                    }
                  />
                  {expanded ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>

                <Collapse in={expanded} timeout="auto" unmountOnExit>
                  <Paper variant="outlined" sx={{ ml: 4, mr: 2, mt: 1, mb: 2, p: 2, backgroundColor: '#e8f0fe' }}>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Original Prompt:
                    </Typography>

                    <Box sx={{ cursor: 'default' }}>
                      <ReactMarkdown>{(entry as any).originalPrompt ?? ''}</ReactMarkdown>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                      <Button
                        size="small"
                        startIcon={<DriveFileMoveIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          openMoveDialogForIndex(index);
                        }}
                      >
                        Move
                      </Button>
                    </Box>

                    <Typography variant="caption" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
                      Response:
                    </Typography>

                    {editingResponseIndex === index ? (
                      <Box>
                        <TextField
                          fullWidth
                          multiline
                          minRows={4}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            if (editValue.trim() !== (entry as any).response) {
                              dispatch(updateResponse({
                                entryId: getEntryId(entry),
                                newResponse: editValue.trim(),
                              }));
                            }
                            setEditingResponseIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingResponseIndex(null);
                            }
                          }}
                          autoFocus
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
                          Preview:
                        </Typography>
                        <Box sx={{ border: '1px solid #ccc', borderRadius: 1, p: 1, mt: 1 }}>
                          <ReactMarkdown>{editValue}</ReactMarkdown>
                        </Box>
                      </Box>
                    ) : (
                      <Box
                        onClick={() => {
                          setEditingResponseIndex(index);
                          setEditValue((entry as any).response ?? '');
                        }}
                        sx={{ cursor: 'pointer' }}
                      >
                        <div className="markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {(entry as any).response ?? ''}
                          </ReactMarkdown>
                        </div>
                      </Box>
                    )}
                  </Paper>
                </Collapse>
              </React.Fragment>
            );
          })}
        </List>
      )}

      {/* Row "More" menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={!!menuAnchorEl}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (menuEntryIndex != null) {
              openMoveDialogForIndex(menuEntryIndex);
            }
            handleCloseMenu();
          }}
        >
          <DriveFileMoveIcon fontSize="small" style={{ marginRight: 8 }} />
          Move…
        </MenuItem>
      </Menu>

      {/* Move dialog */}
      <MoveEntryDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        entryLabel={moveEntryLabel}
        entryId={moveEntryId}
        projects={allProjects as TypesProject[]}
        initialProjectId={selectedProjectId}
        onMoved={({ toChatId, fromChatId }) => handleMoved({ toChatId, fromChatId })}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ChatView;

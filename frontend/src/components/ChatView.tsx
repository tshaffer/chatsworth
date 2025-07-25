import React, { useRef, useState, useMemo } from 'react';
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
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Download as DownloadIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  TrendingFlat as TrendingFlatIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import {
  deleteChatEntry,
  fetchChatEntries,
  moveChatEntry,
  persistReorderedChatEntries,
  updateOriginalPrompt,
  updatePromptSummary,
  updateResponse,
} from '../redux/chatEntriesSlice';
import { selectProjectIdByChatId } from '../redux';
import {
  selectChatEntries,
  selectChatEntriesLoading,
} from '../redux/selectors/chatEntriesSelectors';
import MoveChatEntryDialog from './MoveChatEntryDialog';
import {
  Chat,
  SemanticSearchResults,
} from '../types';

interface Props {
  selectedChatId: string | null;
  searchQuery?: string | null;
  semanticResults?: SemanticSearchResults | null;
}

const ChatView: React.FC<Props> = ({ selectedChatId, searchQuery, semanticResults }) => {
  const dispatch = useDispatch<AppDispatch>();

  const prevChatIdRef = useRef<string | null>(null);

  const allProjects = useSelector((state: RootState) => state.projects.projectList);
  const selectedProjectId = useSelector((state: RootState) =>
    selectedChatId ? selectProjectIdByChatId(state, selectedChatId) : null
  );

  if (
    selectedChatId &&
    !semanticResults &&
    selectedChatId !== prevChatIdRef.current
  ) {
    dispatch(fetchChatEntries(selectedChatId));
    prevChatIdRef.current = selectedChatId;
  }

  const reduxChatEntries = useSelector((state: RootState) =>
    selectedChatId ? selectChatEntries(state, selectedChatId) : []
  );

  const chatEntries = useMemo(() => {
    if (semanticResults && selectedChatId) {
      for (const project of semanticResults) {
        for (const chat of project.chats) {
          if (chat.chatId === selectedChatId) {
            return chat.entries;
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

  const loadingEntries = useSelector((state: RootState) =>
    selectedChatId && !semanticResults
      ? selectChatEntriesLoading(state, selectedChatId)
      : false
  );

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingResponseIndex, setEditingResponseIndex] = useState<number | null>(null);
  const [entryIndexToMove, setEntryIndexToMove] = useState<number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const cancelRef = useRef(false);
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});

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

  const allChats = useMemo(() => allProjects.flatMap((p) => p.chats), [allProjects]);

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
      entries: chatEntries,
    } as Chat);
  }, [selectedChat, searchQuery, semanticResults, chatEntries]);

  const toggleResponse = (index: number) => {
    const key = `${selectedChat?.id}-${index}`;
    setExpandedResponses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirmMove = (targetProjectId: string, targetChatId: string) => {
    if (
      selectedChat &&
      entryIndexToMove !== null &&
      entryIndexToMove >= 0 &&
      entryIndexToMove < chatEntries.length
    ) {
      const entryToMove = chatEntries[entryIndexToMove];

      dispatch(
        moveChatEntry({
          entryId: entryToMove._id,
          fromProjectId: selectedProjectId || '',
          fromChatId: selectedChat.id,
          toProjectId: targetProjectId,
          toChatId: targetChatId,
          newIndex: 0,
        })
      );
    }

    setMoveDialogOpen(false);
    setEntryIndexToMove(null);
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

      {loadingEntries ? (
        <Typography variant="body2" color="text.secondary">
          Loading entries...
        </Typography>
      ) : chatEntries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No entries in this chat.
        </Typography>
      ) : (
        // Keep existing render loop exactly as-is
        <List disablePadding>
          {chatEntries.map((entry, index) => {
            const key = `${selectedChat.id}-${index}`;
            const expanded = expandedResponses[key] || false;
            const isEditing = editingIndex === index;

            return (
              <React.Fragment key={key}>
                <ListItemButton onClick={() => toggleResponse(index)}>
                  <ListItemText
                    primary={
                      <>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          Prompt:
                        </Typography>
                        {isEditing ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TextField
                              fullWidth
                              size="small"
                              variant="outlined"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => {
                                if (!cancelRef.current && editValue.trim() !== entry.promptSummary) {
                                  dispatch(updatePromptSummary({
                                    chatEntryId: entry._id,
                                    chatId: selectedChat.id,
                                    promptSummary: editValue.trim(),
                                  }));
                                }
                                cancelRef.current = false;
                                setEditingIndex(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelRef.current = true;
                                  setEditingIndex(null);
                                }
                              }}
                              autoFocus
                            />
                            <IconButton
                              size="small"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelRef.current = true;
                              }}
                              onClick={() => setEditingIndex(null)}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Box sx={{ flexGrow: 1 }}>
                              <ReactMarkdown>{entry.promptSummary}</ReactMarkdown>
                            </Box>
                            <IconButton
                              size="small"
                              disabled={index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (index > 0) {
                                  const newOrder = [...chatEntries.map((entry) => entry._id)];
                                  [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                  dispatch(persistReorderedChatEntries({
                                    chatId: selectedChat.id,
                                    newOrder,
                                  }));
                                }
                              }}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              disabled={index === chatEntries.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (index < chatEntries.length - 1) {
                                  const newOrder = [...chatEntries.map((entry) => entry._id)];
                                  [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
                                  dispatch(persistReorderedChatEntries({
                                    chatId: selectedChat.id,
                                    newOrder,
                                  }));
                                }
                              }}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingIndex(index);
                                setEditValue(entry.promptSummary);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEntryIndexToMove(index);
                                setMoveDialogOpen(true);
                              }}
                            >
                              <TrendingFlatIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const confirmed = window.confirm('Delete this entry?');
                                if (confirmed) {
                                  dispatch(deleteChatEntry({ chatEntryId: entry._id, chatId: selectedChat.id }));
                                }
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )}
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

                    {editingPromptIndex === index ? (
                      <Box>
                        <TextField
                          fullWidth
                          multiline
                          minRows={4}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            if (editValue.trim() !== entry.originalPrompt) {
                              dispatch(updateOriginalPrompt({
                                chatEntryId: entry._id,
                                chatId: selectedChat.id,
                                originalPrompt: editValue.trim(),
                              }));
                            }
                            setEditingPromptIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingPromptIndex(null);
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
                          setEditingPromptIndex(index);
                          setEditValue(entry.originalPrompt);
                        }}
                        sx={{ cursor: 'pointer' }}
                      >
                        <ReactMarkdown>{entry.originalPrompt}</ReactMarkdown>
                      </Box>
                    )}

                    <Typography variant="caption" color="text.secondary" gutterBottom>
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
                            if (editValue.trim() !== entry.response) {
                              dispatch(updateResponse({
                                chatEntryId: entry._id,
                                chatId: selectedChat.id,
                                response: editValue.trim(),
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
                          setEditValue(entry.response);
                        }}
                        sx={{ cursor: 'pointer' }}
                      >
                        <ReactMarkdown>{entry.response}</ReactMarkdown>
                      </Box>
                    )}
                  </Paper>
                </Collapse>
              </React.Fragment>
            );
          })}
        </List>
      )}

      <MoveChatEntryDialog
        open={moveDialogOpen}
        onClose={() => {
          setMoveDialogOpen(false);
          setEntryIndexToMove(null);
        }}
        onConfirm={handleConfirmMove}
        availableChats={allChats}
        currentChatId={selectedChat.id}
      />
    </Box>
  );
};

export default ChatView;

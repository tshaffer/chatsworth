// components/ChatView.tsx
import React, { useEffect, useRef, useState } from 'react';
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
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ReactMarkdown from 'react-markdown';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import {
  persistReorderedChatEntries,
  moveChatEntry,
} from '../redux/projectsSlice';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import MoveChatEntryDialog from './MoveChatEntryDialog';
import { Chat } from '../types';
import { selectProjectIdByChatId } from '../redux';
import { selectChatEntries, selectChatEntriesLoading } from '../redux/selectors/chatEntriesSelectors';
import { deleteChatEntry, fetchChatEntries, updateOriginalPrompt, updatePromptSummary, updateResponse } from '../redux/chatEntriesSlice';

interface Props {
  searchQuery?: string | null;
}

const ChatView: React.FC<Props> = ({ searchQuery }) => {
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const selectedProjectId = useSelector((state: RootState) =>
    selectProjectIdByChatId(state, selectedChatId!)
  );
  const allProjects = useSelector((state: RootState) => state.projects.projectList);
  const dispatch = useDispatch<AppDispatch>();

  const chatEntries = useSelector((state: RootState) =>
    selectedChatId ? selectChatEntries(state, selectedChatId) : []
  );
  const loadingEntries = useSelector((state: RootState) =>
    selectedChatId ? selectChatEntriesLoading(state, selectedChatId) : false
  );

  useEffect(() => {
    if (selectedChatId) {
      dispatch(fetchChatEntries(selectedChatId));
    }
  }, [dispatch, selectedChatId]);

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

  // const selectedChat: Chat | undefined = allProjects
  //   .flatMap((project) => project.chats)
  //   .filter(isMatch)
  //   .find((chat) => chat.id === selectedChatId);
  // const allChats = allProjects.flatMap((project) => project.chats);

  const allChats = allProjects.flatMap((project) => project.chats);
  const selectedChat: Chat | undefined = allChats.find(
    (chat) => chat.id === selectedChatId
  );
  const isVisible = selectedChat && (!searchQuery || isMatch(selectedChat));

  const toggleResponse = (index: number) => {
    const key = `${selectedChat?.id}-${index}`;
    setExpandedResponses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirmMove = (targetProjectId: string, targetChatId: string) => {
    if (selectedChat && entryIndexToMove !== null) {
      dispatch(
        moveChatEntry({
          fromProjectId: selectedProjectId || '',
          fromChatId: selectedChat.id,
          toProjectId: targetProjectId,
          toChatId: targetChatId,
          entryIndex: entryIndexToMove,
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

  console.log('Selected chat:', selectedChat);

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
            if (!selectedChat?.id) return;
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
        <List disablePadding>
          {chatEntries.map((entry, index) => {
            const key = `${selectedChat.id}-${index}`;
            const expanded = expandedResponses[key] || false;
            const isEditing = editingIndex === index;

            return (
              <React.Fragment key={key}>
                <ListItemButton
                  onClick={() => toggleResponse(index)}
                >
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
                                const newOrder = chatEntries.map((_, i) => i);
                                [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                dispatch(persistReorderedChatEntries({ chatId: selectedChat.id, newOrder }));
                              }}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              disabled={index === chatEntries.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newOrder = chatEntries.map((_, i) => i);
                                [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
                                dispatch(persistReorderedChatEntries({ chatId: selectedChat.id, newOrder }));
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

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 2 }}
                        >
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

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 2 }}
                        >
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


                    {/* <Typography variant="caption" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
                      Response:
                    </Typography>
                    <ReactMarkdown>{entry.response}</ReactMarkdown> */}
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
        }} onConfirm={handleConfirmMove}
        availableChats={allChats}
        currentChatId={selectedChat.id}
      />
    </Box>
  );
};

export default ChatView;

// components/ChatView.tsx
import React, { useRef, useState } from 'react';
import {
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Collapse,
  Paper,
  Box,
} from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ReactMarkdown from 'react-markdown';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { TextField, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../redux/store';
import { persistReorderedChatEntries, updatePromptSummary } from '../redux/projectsSlice';
import { deleteChatEntry } from '../redux/projectsSlice';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';


const ChatView: React.FC = () => {

  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const allProjects = useSelector((state: RootState) => state.projects.projectList);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const cancelRef = useRef(false);

  const dispatch = useDispatch<AppDispatch>();

  const selectedChat = allProjects
    .flatMap((project) => project.chats)
    .find((chat) => chat.id === selectedChatId);

  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});

  const toggleResponse = (index: number) => {
    const key = `${selectedChat?.id}-${index}`;
    setExpandedResponses((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (!selectedChat) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4, fontStyle: 'italic' }}>
        Select a chat to view its details.
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {selectedChat.title}
      </Typography>

      import DownloadIcon from '@mui/icons-material/Download';

      // Inside the component, right before rendering the chat entries:
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <IconButton
          size="small"
          onClick={async () => {
            if (!selectedChat?.id) return;

            try {
              const response = await fetch(`/api/v1/chats/${selectedChat.id}/export`);
              if (!response.ok) {
                throw new Error('Failed to export chat');
              }

              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              let filename = selectedChat.title || 'chat';
              if (!filename.endsWith('.md')) {
                filename += '.md';
              }
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

      {selectedChat.entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No entries in this chat.
        </Typography>
      ) : (
        <List disablePadding>
          {selectedChat.entries.map((entry, index) => {
            const key = `${selectedChat.id}-${index}`;
            const expanded = expandedResponses[key] || false;
            const isEditing = editingIndex === index;

            return (
              <React.Fragment key={key}>
                <ListItemButton onClick={() => toggleResponse(index)}>
                  <ListItemText
                    primary={
                      <>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          gutterBottom
                        >
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
                                if (
                                  !cancelRef.current &&
                                  editValue.trim() !== entry.promptSummary
                                ) {
                                  dispatch(
                                    updatePromptSummary({
                                      chatId: selectedChat.id,
                                      entryIndex: index,
                                      promptSummary: editValue.trim(),
                                    })
                                  );
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
                              onClick={() => {
                                setEditingIndex(null);
                              }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 1,
                            }}
                          >
                            <Box sx={{ flexGrow: 1 }}>
                              <ReactMarkdown>{entry.promptSummary}</ReactMarkdown>
                            </Box>

                            {/* Move Up */}
                            <IconButton
                              size="small"
                              disabled={index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newOrder = selectedChat.entries.map((_, i) => i);
                                [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                dispatch(persistReorderedChatEntries({ chatId: selectedChat.id, newOrder }));
                              }}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>

                            {/* Move Down */}
                            <IconButton
                              size="small"
                              disabled={index === selectedChat.entries.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newOrder = selectedChat.entries.map((_, i) => i);
                                [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
                                dispatch(persistReorderedChatEntries({ chatId: selectedChat.id, newOrder }));
                              }}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>

                            {/* Edit */}
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

                            {/* Delete */}
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const confirmed = window.confirm('Delete this entry?');
                                if (confirmed) {
                                  dispatch(deleteChatEntry({ chatId: selectedChat.id, entryIndex: index }));
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
                  <Paper
                    variant="outlined"
                    sx={{
                      ml: 4,
                      mr: 2,
                      mt: 1,
                      mb: 2,
                      p: 2,
                      backgroundColor: '#e8f0fe',
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      gutterBottom
                    >
                      Original Prompt:
                    </Typography>
                    <ReactMarkdown>{entry.originalPrompt}</ReactMarkdown>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      gutterBottom
                      sx={{ mt: 2 }}
                    >
                      Response:
                    </Typography>
                    <ReactMarkdown>{entry.response}</ReactMarkdown>
                  </Paper>
                </Collapse>
              </React.Fragment>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default ChatView;

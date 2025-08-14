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
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import { updateResponse } from '../redux/chatEntriesSlice';
import { selectProjectIdByChatId } from '../redux';
import { makeSelectChatEntriesByChatId } from '../redux/selectors/chatEntriesSelectors';
import {
  Chat,
  SemanticSearchResults,
  SemanticSearchResultEntry,
  ChatEntry as TypesChatEntry,
} from '../types';

interface Props {
  selectedChatId: string | null;
  searchQuery?: string | null;
  semanticResults?: SemanticSearchResults | null;
}

// Helper: get an id regardless of _id or id
const getEntryId = (e: any): string => (e?._id ?? e?.id ?? '') as string;

type EntryLike = SemanticSearchResultEntry | (TypesChatEntry & { _id?: string });

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

  // If you still have a loading flag in state, wire it here. For now, false.
  const loadingEntries = false;

  const [editingResponseIndex, setEditingResponseIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
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
        <List disablePadding>
          {chatEntries.map((entry: EntryLike, index: number) => {
            const key = `${selectedChat.id}-${index}`;
            const expanded = expandedResponses[key] || false;

            return (
              <React.Fragment key={key}>
                <ListItemButton onClick={() => toggleResponse(index)}>
                  <ListItemText
                    primary={
                      <>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          Prompt:
                        </Typography>

                        {/* Read-only prompt summary for now */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Box sx={{ flexGrow: 1 }}>
                            <ReactMarkdown>{(entry as any).promptSummary ?? ''}</ReactMarkdown>
                          </Box>
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

                    {/* Read-only original prompt for now */}
                    <Box sx={{ cursor: 'default' }}>
                      <ReactMarkdown>{(entry as any).originalPrompt ?? ''}</ReactMarkdown>
                    </Box>

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
                        <ReactMarkdown>{(entry as any).response ?? ''}</ReactMarkdown>
                      </Box>
                    )}
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

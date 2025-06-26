// components/ChatView.tsx
import React, { useState } from 'react';
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
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../redux/store';
import { updatePromptSummary } from '../redux/projectsSlice';


const ChatView: React.FC = () => {
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const allProjects = useSelector((state: RootState) => state.projects.projectList);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
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
                        <TextField
                          fullWidth
                          size="small"
                          variant="outlined"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            dispatch(updatePromptSummary({
                              chatId: selectedChat.id,
                              entryIndex: index,
                              promptSummary: editValue,
                            }));
                            setEditingIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur(); // trigger save
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Box sx={{ flexGrow: 1 }}>
                            <ReactMarkdown>{entry.promptSummary}</ReactMarkdown>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation(); // prevent expanding
                              setEditingIndex(index);
                              setEditValue(entry.promptSummary);
                            }}
                          >
                            <EditIcon fontSize="small" />
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

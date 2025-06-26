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

const ChatView: React.FC = () => {
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const allProjects = useSelector((state: RootState) => state.projects.projectList);

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
                        <ReactMarkdown>{entry.promptSummary}</ReactMarkdown>
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

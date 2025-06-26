// components/ChatView.tsx
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import {
  Box,
  Typography,
  Paper,
  Divider,
} from '@mui/material';

const ChatView: React.FC = () => {
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);
  const allProjects = useSelector((state: RootState) => state.projects.projectList);

  const selectedChat = allProjects
    .flatMap((project) => project.chats)
    .find((chat) => chat.id === selectedChatId);

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
      <Divider sx={{ mb: 2 }} />

      {selectedChat.entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No entries yet in this chat.
        </Typography>
      ) : (
        selectedChat.entries.map((entry, index) => (
          <Paper key={index} sx={{ mb: 2, p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Original Prompt
            </Typography>
            <Typography variant="body1" gutterBottom>
              {entry.originalPrompt}
            </Typography>

            <Typography variant="subtitle2" color="text.secondary">
              Summary
            </Typography>
            <Typography variant="body2" gutterBottom>
              {entry.promptSummary}
            </Typography>

            <Divider sx={{ my: 1 }} />

            <Typography variant="subtitle2" color="text.secondary">
              Response
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {entry.response}
            </Typography>
          </Paper>
        ))
      )}
    </Box>
  );
};

export default ChatView;

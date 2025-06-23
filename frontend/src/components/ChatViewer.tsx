import React from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Paper,
  Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReactMarkdown from 'react-markdown';

import { ParsedMarkdown, Project, ChatEntry, Chat } from '../types';

export interface ChatViewerProps {
  parsedMarkdown: ParsedMarkdown;
}

const ChatViewer = ({ parsedMarkdown }: ChatViewerProps) => {
  if (!parsedMarkdown.projects || parsedMarkdown.projects.length === 0) {
    return <div>No chat data loaded.</div>;
  }

  return (
    <div>
      {parsedMarkdown.projects.map((project: Project) => (
        <Accordion key={project.id} defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Project: {project.name}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {project.chats.map((chat: Chat) => (
              <Accordion key={chat.id} sx={{ ml: 2, mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle1">{chat.title}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {chat.entries.map((entry: ChatEntry, index: number) => (
                    <Box key={index} sx={{ mb: 2 }}>
                      <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#f5f5f5', mb: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                          Prompt:
                        </Typography>
                        <ReactMarkdown>{entry.prompt}</ReactMarkdown>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#e8f0fe' }}>
                        <Typography variant="caption" color="textSecondary">
                          Response:
                        </Typography>
                        <ReactMarkdown>{entry.response}</ReactMarkdown>
                      </Paper>
                    </Box>
                  ))}
                </AccordionDetails>
              </Accordion>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  );
};

export default ChatViewer;

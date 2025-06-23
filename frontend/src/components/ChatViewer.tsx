import React, { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Collapse,
  Paper,
  Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ReactMarkdown from 'react-markdown';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';

import { ParsedMarkdown, Project, Chat, ChatEntry } from '../types';

const ChatViewer = () => {
  const parsedMarkdown: ParsedMarkdown = useSelector((state: RootState) => state.parsedMarkdown.parsedMarkdown);
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});

  const toggleResponse = (chatId: string, index: number) => {
    const key = `${chatId}-${index}`;
    setExpandedResponses((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Chat:
                    </Typography>
                    <Typography variant="subtitle1">{chat.title}</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <List disablePadding>
                    {chat.entries.map((entry: ChatEntry, index: number) => {
                      const key = `${chat.id}-${index}`;
                      const expanded = expandedResponses[key] || false;
                      return (
                        <React.Fragment key={key}>
                          <ListItemButton onClick={() => toggleResponse(chat.id, index)}>
                            <ListItemText
                              primary={
                                <>
                                  <Typography
                                    variant="caption"
                                    color="textSecondary"
                                    gutterBottom
                                  >
                                    Prompt:
                                  </Typography>
                                  <ReactMarkdown>{entry.prompt}</ReactMarkdown>
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
                                color="textSecondary"
                                gutterBottom
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

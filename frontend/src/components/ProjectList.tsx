// components/ProjectList.tsx
import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Typography,
  Collapse,
  Button,
  Divider,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';

type Chat = {
  id: string;
  title: string;
};

type Project = {
  id: string;
  name: string;
  chats: Chat[];
};

const mockProjects: Project[] = [
  {
    id: 'project-a',
    name: 'Project A',
    chats: [
      { id: 'chat-1', title: 'Chat 1' },
      { id: 'chat-2', title: 'Chat 2' },
    ],
  },
  {
    id: 'project-b',
    name: 'Project B',
    chats: [
      { id: 'chat-3', title: 'Chat 3' },
      { id: 'chat-4', title: 'Chat 4' },
    ],
  },
];

const ProjectList: React.FC = () => {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set(mockProjects.map((p) => p.id))
  );

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(projectId)) {
        updated.delete(projectId);
      } else {
        updated.add(projectId);
      }
      return updated;
    });
  };

  return (
    <Box p={2}>
      <Button variant="contained" fullWidth sx={{ mb: 2 }}>
        + New Project
      </Button>

      {mockProjects.map((project) => (
        <Box key={project.id}>
          <ListItem
            disableGutters
            secondaryAction={
              <Box>
                <IconButton size="small">
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small">
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Box>
            }
          >
            <ListItemIcon
              onClick={() => toggleProject(project.id)}
              sx={{ minWidth: '30px', cursor: 'pointer' }}
            >
              {expandedProjectIds.has(project.id) ? <ExpandLess /> : <ExpandMore />}
            </ListItemIcon>
            <ListItemText primary={project.name} />
          </ListItem>

          <Collapse in={expandedProjectIds.has(project.id)} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {project.chats.map((chat) => (
                <ListItem key={chat.id} sx={{ pl: 4 }}>
                  <ListItemText primary={`• ${chat.title}`} />
                </ListItem>
              ))}
            </List>
          </Collapse>

          <Divider sx={{ my: 1 }} />
        </Box>
      ))}
    </Box>
  );
};

export default ProjectList;

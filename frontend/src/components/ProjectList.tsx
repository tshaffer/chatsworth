// components/ProjectList.tsx
import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
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
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';

const ProjectList: React.FC = () => {
  const projects = useSelector((state: RootState) => state.projects.projectList);

  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set(projects.map((p) => p.id))
  );

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const updated = new Set(prev);
      updated.has(projectId) ? updated.delete(projectId) : updated.add(projectId);
      return updated;
    });
  };

  return (
    <Box p={2}>
      <Button variant="contained" fullWidth sx={{ mb: 2 }}>
        + New Project
      </Button>

      {projects.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 4, fontStyle: 'italic' }}>No projects found.</Box>
      ) : (
        projects.map((project) => (
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
        ))
      )}
    </Box>
  );
};

export default ProjectList;

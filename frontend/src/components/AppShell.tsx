// components/AppShell.tsx
import React from 'react';
import { Box, CssBaseline, Drawer, Toolbar, AppBar, Typography } from '@mui/material';
import ProjectList from './ProjectList';
import ChatView from './ChatView';

const drawerWidth = 280;

const AppShell: React.FC = () => {
  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      
      <AppBar position="fixed" sx={{ zIndex: 1201 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            Chatsworth
          </Typography>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <ProjectList />
        </Box>
      </Drawer>
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          marginLeft: `${drawerWidth}px`,
          marginTop: '64px',
        }}
      >
        <ChatView />
      </Box>
    </Box>
  );
};

export default AppShell;

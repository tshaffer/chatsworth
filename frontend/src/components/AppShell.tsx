// components/AppShell.tsx
import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Box,
  CssBaseline,
  Drawer,
  Toolbar,
  AppBar,
  Typography,
  Divider,
} from '@mui/material';
import ProjectList from './ProjectList';
import ChatView from './ChatView';
import SearchBar from './SearchBar';
import { fetchProjects } from '../redux/projectsSlice';
import { AppDispatch } from '../redux/store';

const drawerWidth = 444;

const AppShell: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    try {
      const response = await fetch(`/api/v1/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery(null);
    setSearchResults([]);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />

      <AppBar position="fixed" sx={{ zIndex: 1201 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
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
          <ProjectList searchQuery={searchQuery}/>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          paddingTop: '164px', // AppBar + fixed SearchBar
        }}
      >
        {/* Fixed SearchBar */}
        <Box
          sx={{
            position: 'fixed',
            top: '64px',
            left: drawerWidth,
            right: 0,
            zIndex: (theme) => theme.zIndex.appBar,
            backgroundColor: 'background.paper',
            padding: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            query={searchQuery ?? ''}
          />
          <Divider sx={{ mt: 1 }} />
        </Box>

        <ChatView searchQuery={searchQuery}/>
      </Box>
    </Box>
  );
};

export default AppShell;
